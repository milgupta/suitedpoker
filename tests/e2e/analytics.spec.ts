import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The real event stream, read off the wire.
 *
 * Every request to /ingest is intercepted and decoded, so this asserts what
 * PostHog actually receives rather than what the code intended to send. It
 * skips when NEXT_PUBLIC_POSTHOG_KEY is absent, because without a key the
 * client never initialises and there is no stream to read.
 */

loadLocalEnv();

const CONFIGURED = (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "") !== "";

/** Set by the runner when the suite is driven with a visible browser. */
const HEADED = (process.env.PWHEADED ?? "") !== "";

interface Captured {
  event: string;
  properties: Record<string, unknown>;
}

/** Decodes PostHog's batch payloads, whichever transport it chose. */
function decode(body: string | null): Captured[] {
  if (body === null || body === "") return [];

  const urlDecoded = body.startsWith("data=") ? decodeURIComponent(body.slice(5)) : body;

  // posthog-js base64s the payload on some transports. The first version of
  // this decoder only handled `data=` and raw JSON, so those requests parsed
  // to nothing and the stream looked empty rather than wrong.
  const raw = urlDecoded.trimStart().startsWith("{")
    ? urlDecoded
    : ((): string => {
        try {
          return Buffer.from(urlDecoded, "base64").toString("utf8");
        } catch {
          return urlDecoded;
        }
      })();

  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "batch" in parsed
        ? (parsed as { batch: unknown[] }).batch
        : [parsed];

    return list
      .filter((e): e is Captured => typeof e === "object" && e !== null && "event" in e)
      .map((e) => ({ event: e.event, properties: e.properties ?? {} }));
  } catch {
    return [];
  }
}

/**
 * Makes posthog-js willing to send anything at all.
 *
 * `_is_bot()` drops every capture, silently, when `navigator.webdriver` is
 * true — which it always is under Playwright, headed or not. Without this the
 * stream is simply empty and every assertion here fails in a way that looks
 * like a broken capture path rather than a browser-detection quirk. Must run
 * before any navigation, hence addInitScript.
 */
async function maskWebdriver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
}

async function recordStream(page: Page): Promise<Captured[]> {
  const stream: Captured[] = [];

  await maskWebdriver(page);

  await page.route("**/ingest/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      for (const event of decode(request.postData())) stream.push(event);
    }
    // Answer locally: the point is what we SEND, and this keeps the test from
    // depending on PostHog being reachable.
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return stream;
}

/**
 * Waits for an event to actually arrive, rather than guessing how long a flush
 * takes.
 *
 * posthog-js BATCHES. Measured against the running client: the first request
 * leaves at ~440ms and the next at ~3340ms, so a fixed 2500ms wait — which is
 * what every test here used — asserted on a stream that had not received
 * `landing_viewed` yet. The tests had never run (no key, then headless bot
 * detection), so a hardcoded wait shorter than the flush interval sat here
 * unnoticed since 8.1. Polling makes the interval irrelevant.
 */
async function waitForEvent(
  page: Page,
  stream: Captured[],
  event: string,
  timeoutMs = 12_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stream.some((e) => e.event === event)) return;
    await page.waitForTimeout(250);
  }
}

/** Lets a flush that is already in flight land, so "exactly once" means it. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(4000);
}

test.describe("analytics", () => {
  test.skip(!CONFIGURED, "NEXT_PUBLIC_POSTHOG_KEY absent — no event stream to read");

  /**
   * posthog-js DROPS every capture from a headless browser.
   *
   * `_is_bot()` trips on both the "HeadlessChrome" user agent and
   * `navigator.webdriver`, and the drop is silent — capture() simply returns.
   * So these assertions can never pass under a normal Playwright run, and for
   * four substages they never ran at all (no key) and hid that fact.
   *
   * Verified manually, headed, with webdriver masked: `landing_viewed` and
   * `$pageview` both reach /ingest. Re-verify that way after touching the
   * capture path — see docs/POSTHOG-INSIGHTS.md.
   */
  test.skip(
    !HEADED,
    "posthog-js drops all events from headless browsers (_is_bot) — run headed: PWHEADED=1 npx playwright test tests/e2e/analytics.spec.ts --headed",
  );

  test("the landing page emits landing_viewed exactly once", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await waitForEvent(page, stream, "landing_viewed");
    // Then keep listening: "exactly once" is only meaningful if a duplicate
    // would have had time to arrive.
    await settle(page);

    const landing = stream.filter((e) => e.event === "landing_viewed");
    expect(landing.length, `stream: ${stream.map((e) => e.event).join(", ")}`).toBe(1);
  });

  test("a re-render or refresh does not duplicate the event", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await waitForEvent(page, stream, "landing_viewed");
    const afterFirst = stream.filter((e) => e.event === "landing_viewed").length;
    expect(afterFirst, "landing_viewed never arrived").toBe(1);

    // A client-side navigation away must not re-fire the view event for the
    // same mount. Driven from `data-cta="header"` rather than a link NAME:
    // "Pricing" is in both the header nav and the footer, so the by-name
    // lookup matched two elements on desktop and none below `md`, where the
    // nav collapses. This one control is visible at every width.
    await page.locator('[data-cta="header"]').click();
    await settle(page);

    expect(stream.filter((e) => e.event === "landing_viewed").length).toBe(afterFirst);
  });

  test("navigation emits one pageview per route, not per render", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await waitForEvent(page, stream, "$pageview");
    await page.goto("/login");
    await settle(page);

    const pageviews = stream.filter((e) => e.event === "$pageview");
    const urls = pageviews.map((e) => String(e.properties["$current_url"] ?? ""));

    expect(pageviews.length).toBeGreaterThanOrEqual(2);
    // No URL captured twice.
    expect(new Set(urls).size).toBe(urls.length);
  });

  test("signup_started fires with its method", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/signup");
    await page.getByLabel("Email").fill(`e2e+ph${Date.now()}@suitedpoker.com`);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await waitForEvent(page, stream, "signup_started");
    await settle(page);

    const started = stream.filter((e) => e.event === "signup_started");
    expect(started.length).toBe(1);
    expect(started[0]?.properties["method"]).toBe("email");
  });

  test("every captured name exists in the schema", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await waitForEvent(page, stream, "landing_viewed");
    await page.goto("/login");
    await settle(page);

    // PostHog's own $-prefixed events are its business; ours must all be known.
    const ours = stream.map((e) => e.event).filter((name) => !name.startsWith("$"));
    const { EVENT_NAMES } = await import("../../src/lib/analytics");
    for (const name of ours) {
      expect(EVENT_NAMES as readonly string[], `unknown event "${name}"`).toContain(name);
    }
  });

  /**
   * Read off the wire, not off the config object.
   *
   * The first version of this asked `window.posthog.config` — but posthog-js is
   * imported as a module here and no longer attaches itself to `window`, so the
   * lookup returned `undefined`, the test compared `null` to `true`, and it
   * could never have passed in any browser. It had never run, so nobody found
   * out. Typing a real password and grepping every recorder payload for it is
   * also just the better assertion: it proves the secret did not leave, rather
   * than proving a flag that is supposed to stop it was set.
   */
  test("session replay does not send what was typed into a password field", async ({ page }) => {
    const secret = `pw-${Date.now()}-do-not-record`;
    const payloads: string[] = [];

    await maskWebdriver(page);
    await page.route("**/ingest/**", async (route) => {
      const request = route.request();
      if (request.method() === "POST") payloads.push(request.postData() ?? "");
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("masking-probe@suitedpoker.com");
    await page.getByLabel("Password", { exact: true }).fill(secret);
    // Blur, so the recorder has certainly observed the field's final value.
    await page.getByLabel("Email").click();
    await settle(page);

    expect(
      payloads.length,
      "no recorder traffic at all — the probe proved nothing",
    ).toBeGreaterThan(0);

    // Base64 too: posthog-js encodes some transports, and a plain substring
    // check would pass on an encoded leak.
    const haystack = payloads
      .map((body) => {
        const decoded = body.startsWith("data=") ? decodeURIComponent(body.slice(5)) : body;
        try {
          return `${decoded}\n${Buffer.from(decoded, "base64").toString("utf8")}`;
        } catch {
          return decoded;
        }
      })
      .join("\n");

    expect(haystack, "the typed password reached PostHog").not.toContain(secret);
  });
});

/**
 * The identity merge, which is what makes a funnel able to finish at all.
 *
 * Client captures carry PostHog's device id; `captureServer` carries the
 * Supabase user id. Until an `$identify` ties them together they are two
 * separate PERSONS, so a funnel ending in `purchase_completed` scores zero
 * however healthy each event looks on its own. This was live: 2 people reached
 * checkout, 2 purchases landed, the funnel reported no conversions.
 *
 * Asserted on the WIRE rather than by reading posthog's internals, because the
 * failure mode is specifically about what the server receives.
 */
test.describe("identity", () => {
  test.skip(!isConfigured(), "Supabase credentials absent");
  test.skip(
    (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "") === "",
    "NEXT_PUBLIC_POSTHOG_KEY absent — no event stream to read",
  );
  test.skip(
    (process.env.PWHEADED ?? "") === "",
    "posthog-js drops all events from headless browsers (_is_bot) — run headed",
  );

  let admin: SupabaseClient;
  const created: string[] = [];

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  test("an authenticated page identifies as the Supabase user id", async ({ page }) => {
    const email = `e2e+phid${Date.now()}@suitedpoker.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "correct-horse-battery",
      email_confirm: true,
    });
    if (error !== null) throw error;
    const userId = data.user?.id;
    expect(userId, "no user id").toBeTruthy();
    if (userId !== undefined) created.push(userId);

    const stream = await recordStream(page);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByRole("button", { name: "Log in" }).click();
    // Unsubscribed, so the entitlement gate lands them on /paywall — which is
    // inside the (app) group, so the layout's AnalyticsIdentity has mounted.
    await expect(page).toHaveURL(/\/paywall/, { timeout: 30_000 });
    await page.waitForTimeout(2500);

    const identifies = stream.filter((e) => e.event === "$identify");
    expect(
      identifies.length,
      `no $identify on the wire — stream: ${stream.map((e) => e.event).join(", ")}`,
    ).toBeGreaterThanOrEqual(1);

    // The id PostHog is told to merge INTO must be the Supabase user id, or the
    // server-side purchase still lands on a different person.
    const distinctIds = identifies.map((e) => String(e.properties["distinct_id"] ?? ""));
    expect(distinctIds, `identified as ${distinctIds.join(", ")}, expected ${userId}`).toContain(
      userId,
    );

    // And the events that follow must be attributed to that same id, which is
    // the actual precondition for the funnel joining up.
    const afterLogin = stream.filter((e) => e.event === "paywall_viewed");
    for (const event of afterLogin) {
      expect(String(event.properties["distinct_id"] ?? userId)).toBe(userId);
    }
  });
});

test("the /ingest proxy is reachable on our own origin", async ({ request }) => {
  // The whole point of the rewrite: an adblocker blocks posthog.com by
  // hostname, so the request has to leave from ours.
  const response = await request.get("/ingest/static/array.js", { maxRedirects: 2 });
  expect(
    response.status(),
    "the /ingest rewrite is not routing — adblocked users will be invisible",
  ).toBeLessThan(400);
});
