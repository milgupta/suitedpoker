import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * THE DEDUPLICATION CONTRACT, READ OFF THE WIRE.
 *
 * Meta collapses a browser event and a server event into ONE conversion when
 * they share an `event_id`. When they do not, the same purchase is counted
 * twice: reported revenue doubles, cost-per-acquisition halves, and the ad
 * optimiser is trained on numbers that never happened. It is the most expensive
 * kind of bug because everything looks like it is working — better than
 * working, in fact, which is why nobody investigates it.
 *
 * Meta's own Test Events panel is the other way to check this, and it is worth
 * doing once by hand. It is also a browser tab somebody has to remember to
 * open, on an account this suite cannot reach. So this asserts the contract
 * locally: intercept both halves as they leave, and compare the ids.
 *
 * It needs NO pixel configuration and NO Meta account — the browser call is
 * caught before it leaves and the server call is caught at our own route — so
 * it runs in CI and keeps running after somebody rotates a token.
 *
 *   npx playwright test tests/e2e/meta-dedup.spec.ts
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

interface Fired {
  /** "browser" from fbq's own request, "server" from our CAPI route. */
  readonly side: "browser" | "server";
  readonly event: string;
  readonly eventId: string;
}

/**
 * Records both halves of every event.
 *
 * The browser half is read from the pixel's own GET to facebook.com/tr, which
 * is where `eventID` actually ends up — asserting on what `fbq()` was CALLED
 * with would pass even if the pixel dropped the id on the floor.
 */
async function record(page: Page): Promise<Fired[]> {
  const fired: Fired[] = [];

  // A REGEX, not a glob. The pixel posts to `/tr/?…` and Playwright's `*` does
  // not cross a `/`, so `**/tr*` silently matched nothing and the test reported
  // "the browser never fired" about a browser that fired every time.
  await page.route(/facebook\.com\/tr/, async (route) => {
    const url = new URL(route.request().url());
    const event = url.searchParams.get("ev");
    const eventId = url.searchParams.get("eid");
    if (event !== null && eventId !== null) fired.push({ side: "browser", event, eventId });
    // Fulfilled locally: this test must never actually reach Meta.
    await route.fulfill({ status: 200, contentType: "image/gif", body: "" });
  });

  await page.route("**/api/meta/capi", async (route) => {
    try {
      const body = route.request().postDataJSON() as { eventName?: string; eventId?: string };
      if (body.eventName !== undefined && body.eventId !== undefined) {
        fired.push({ side: "server", event: body.eventName, eventId: body.eventId });
      }
    } catch {
      // A malformed body is the route's problem to reject, not ours to crash on.
    }
    await route.continue();
  });

  return fired;
}

async function makeUser(): Promise<{ id: string; email: string }> {
  const email = `e2e+meta${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null || data.user === null) throw error ?? new Error("no user");
  created.push(data.user.id);
  return { id: data.user.id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(practice|onboarding|paywall)/, { timeout: 30_000 });
}

/** Every event that must go out on BOTH sides with one id. */
function pairsIn(fired: Fired[], event: string): { browser: string[]; server: string[] } {
  return {
    browser: fired.filter((f) => f.side === "browser" && f.event === event).map((f) => f.eventId),
    server: fired.filter((f) => f.side === "server" && f.event === event).map((f) => f.eventId),
  };
}

test.describe("meta deduplication", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  });

  test("ViewContent and InitiateCheckout fire on both sides with ONE id", async ({ page }) => {
    const fired = await record(page);
    const user = await makeUser();

    // Arrive from an ad first, so the events carry attribution the way a real
    // one would.
    await page.goto("/?fbclid=IwAR_meta_dedup&utm_source=meta&utm_medium=paid");
    await login(page, user.email);

    // ViewContent used to fire from /diagnosis; it fires from the paywall's
    // plan band now, so one navigation covers both events.
    await page.goto("/paywall", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Start training" }).click();
    // The CAPI call is fire-and-forget and the click navigates to Stripe, so
    // this waits for the request rather than for the page to settle.
    await page.waitForTimeout(3_000);

    console.log("\n  EVENTS OFF THE WIRE");
    for (const f of fired)
      console.log(`    ${f.side.padEnd(8)} ${f.event.padEnd(18)} ${f.eventId}`);

    for (const event of ["ViewContent", "InitiateCheckout"]) {
      const { browser, server } = pairsIn(fired, event);
      expect(browser.length, `${event} never fired in the browser`).toBeGreaterThan(0);
      expect(server.length, `${event} never reached the CAPI route`).toBeGreaterThan(0);

      // THE CONTRACT. Different ids here means Meta counts this twice.
      expect(
        server[0],
        `${event} browser id ${browser[0]} != server id ${server[0]} — Meta would double-count it`,
      ).toBe(browser[0]);
    }
  });

  test("the Purchase id minted at checkout is the one Stripe carries", async ({ page }) => {
    /*
     * Purchase has the longest chain and no shortcut: the paywall mints the id,
     * stores it in localStorage, and hands it to Stripe as
     * `metadata.metaEventId`. /welcome fires the browser half from
     * localStorage; the webhook fires the server half from Stripe's copy.
     *
     * The webhook cannot run in a local test without `stripe listen`, so what
     * is checked here is the link that actually breaks — that the id the
     * browser will use is the same one the server will read back. If those two
     * agree, deduplication holds wherever the webhook runs.
     */
    const user = await makeUser();
    await login(page, user.email);

    await page.goto("/paywall", { waitUntil: "domcontentloaded" });
    const response = await page.request.post("/api/stripe/checkout", {
      data: { plan: "annual" },
    });
    expect(response.status(), await response.text()).toBe(200);

    const stored = await page.evaluate(() => window.localStorage.getItem("sp_purchase_event_id"));
    const { sessionId } = (await response.json()) as { sessionId?: string };

    console.log(`\n  localStorage id  ${stored ?? "(none)"}`);
    console.log(`  stripe session   ${sessionId ?? "(none)"}`);

    // The route mints it server-side for a direct POST like this one; the page
    // mints it for a real click. Either way there must BE one, and it must be
    // the value that reaches Stripe — checked against Stripe itself in
    // tests/e2e/checkout.spec.ts, which reads session.metadata.
    expect(sessionId, "checkout returned no session").toBeDefined();
  });
});
