import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * ATTRIBUTION, FROM THE AD CLICK TO THE PROFILE ROW.
 *
 * `?fbclid=` and the UTMs exist only on the landing hit. Several navigations
 * later — which is where signup happens — they are gone. So the thing that has
 * to be proved is not "we read the query string", it is "the value we read on
 * the landing page is still there after signing up", which is the part that
 * silently breaks and is invisible until an ad account cannot attribute
 * anything.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeUser(): Promise<{ id: string; email: string }> {
  const email = `e2e+attr${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
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
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(practice|onboarding|paywall)/, { timeout: 25_000 });
}

test.describe("attribution", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  });

  test("the landing hit writes a first-touch cookie", async ({ page }) => {
    await page.goto("/?fbclid=IwAR_e2e_click&utm_source=meta&utm_medium=paid&utm_campaign=cold_1");

    const cookies = await page.context().cookies();
    const attr = cookies.find((c) => c.name === "sp_attr");
    expect(attr, "no attribution cookie was written on the landing hit").toBeDefined();

    const parsed = JSON.parse(decodeURIComponent(attr!.value)) as Record<string, string>;
    expect(parsed.fbclid).toBe("IwAR_e2e_click");
    expect(parsed.utmSource).toBe("meta");
    expect(parsed.utmCampaign).toBe("cold_1");
    // Reconstructed from the click id, in Meta's format, for the users whose
    // pixel was blocked — which is most of this audience.
    expect(parsed.fbc).toMatch(/^fb\.1\.\d+\.IwAR_e2e_click$/);

    // 30 days.
    const days = (attr!.expires * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  test("FIRST touch survives a later visit from a different source", async ({ page }) => {
    await page.goto("/?utm_source=meta&utm_campaign=cold_1");
    await page.goto("/?utm_source=google&utm_campaign=brand");

    const attr = (await page.context().cookies()).find((c) => c.name === "sp_attr");
    const parsed = JSON.parse(decodeURIComponent(attr!.value)) as Record<string, string>;

    // The ad acquired them. Crediting the search that closed would make the ad
    // account optimise against its own success.
    expect(parsed.utmSource).toBe("meta");
    expect(parsed.utmCampaign).toBe("cold_1");
  });

  test("the cookie reaches the PROFILE through a real signup", async ({ page }) => {
    const user = await makeUser();

    // Land from the ad first, exactly as a real user would.
    await page.goto("/?fbclid=IwAR_persist&utm_source=meta&utm_medium=paid&utm_campaign=persist_1");
    await page.goto("/login");
    await login(page, user.email);

    // Onboarding is the first authenticated server call, and where the cookie
    // is moved onto the profile.
    await page.goto("/onboarding");
    await page.waitForLoadState("networkidle");

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("profiles")
            .select("fbclid, fbc, utm_source, utm_campaign")
            .eq("id", user.id)
            .single();
          return data?.fbclid ?? null;
        },
        { timeout: 20_000, message: "attribution never reached the profile" },
      )
      .toBe("IwAR_persist");

    const { data } = await admin
      .from("profiles")
      .select("fbclid, fbc, utm_source, utm_medium, utm_campaign")
      .eq("id", user.id)
      .single();

    expect(data!.utm_source).toBe("meta");
    expect(data!.utm_medium).toBe("paid");
    expect(data!.utm_campaign).toBe("persist_1");
    // fbc is what Meta actually matches on for a server-side event.
    expect(data!.fbc).toMatch(/^fb\.1\.\d+\.IwAR_persist$/);
  });

  test("a user who arrives with no attribution signs up fine", async ({ page }) => {
    // The overwhelming majority of organic traffic. No ad attribution must be a
    // non-event, not an error path.
    const user = await makeUser();

    await page.goto("/login");
    await login(page, user.email);
    await page.goto("/onboarding");

    /*
     * NO AD IDENTIFIERS — not "no cookie".
     *
     * This asserted the `sp_attr` cookie was absent entirely, which was only
     * ever true because no pixel was configured. With one live, Meta's pixel
     * sets `_fbp` for EVERY visitor, ad or not, and the proxy correctly carries
     * it — `fbp` is how Meta matches an organic signup back to a person, and
     * dropping it would throw away match quality on the majority of traffic.
     *
     * What must be absent is a click id and a campaign: those only exist if
     * this person came from an ad, and inventing them would attribute an
     * organic signup to a channel that did not pay for it.
     */
    const cookies = await page.context().cookies();
    const attribution = cookies.find((c) => c.name === "sp_attr");
    if (attribution !== undefined) {
      const parsed = JSON.parse(decodeURIComponent(attribution.value)) as Record<string, unknown>;
      expect(Object.keys(parsed).sort(), `unexpected keys in ${attribution.value}`).toEqual([
        "fbp",
      ]);
    }

    const { data } = await admin
      .from("profiles")
      .select("fbclid, utm_source")
      .eq("id", user.id)
      .single();
    expect(data!.fbclid).toBeNull();
    expect(data!.utm_source).toBeNull();
  });

  test("the CAPI route refuses to accept a client-reported Purchase", async ({ page }) => {
    // A client that could report its own purchases could report ones it never
    // made, and Meta would optimise for people who never paid.
    const user = await makeUser();
    await page.goto("/login");
    await login(page, user.email);

    const response = await page.request.post("/api/meta/capi", {
      data: { eventName: "Purchase", eventId: "forged_purchase", customData: { value: 119.99 } },
    });

    expect(response.status()).toBe(400);
  });

  /**
   * NOTHING BUT PRODUCTION MAY REACH THE LIVE DATASET.
   *
   * 1.5K events arrived from localhost before this gate existed, into the one
   * dataset the ad account optimises against — which cannot be cleaned, only
   * diluted. The pixel and the CAPI token ARE configured in .env.local, so this
   * is not passing because the pixel is switched off; it is passing because the
   * environment gate holds with a live pixel id sitting right there.
   */
  test("a non-production run reaches Meta zero times", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      if (/facebook\.(com|net)|fbcdn/.test(url)) requests.push(url);
    });

    const logs: string[] = [];
    page.on("console", (m) => {
      if (m.text().includes("[meta]")) logs.push(m.text());
    });

    await page.goto("/?fbclid=IwAR_e2e_gate&utm_source=meta");
    await page.waitForLoadState("networkidle");

    // `fbq('init')` fires a PageView the moment it runs, so gating only our own
    // track calls would still have shipped every dev page load. The script must
    // not be on the page at all.
    expect(await page.locator("script#meta-pixel").count()).toBe(0);
    expect(await page.evaluate(() => typeof (window as { fbq?: unknown }).fbq)).toBe("undefined");
    expect(requests).toEqual([]);

    // Suppressed, not merely absent. "Nothing happened" and "it was stopped"
    // have to be distinguishable or dev verification is impossible.
    expect(logs.some((l) => l.includes("SUPPRESSED") && l.includes("PageView"))).toBe(true);
  });

  test("the click id still becomes an fbc with the pixel switched off", async ({ page }) => {
    // The whole point of reconstructing fbc: it covers exactly the users whose
    // pixel never ran. Here nothing wrote _fbc, so ours is the only one.
    await page.goto("/?fbclid=IwAR_e2e_fbc_only");

    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "_fbc")).toBe(false);

    const raw = cookies.find((c) => c.name === "sp_attr")?.value ?? "";
    const attribution = JSON.parse(decodeURIComponent(raw)) as {
      fbclid?: string;
      fbc?: string;
    };

    expect(attribution.fbclid).toBe("IwAR_e2e_fbc_only");
    // Meta's exact format — `fb.1.<click time ms>.<click id>`. A malformed one
    // is accepted by the API and matches nobody.
    expect(attribution.fbc).toMatch(/^fb\.1\.\d{13}\.IwAR_e2e_fbc_only$/);
  });
});
