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
  await page.waitForURL(/\/(dashboard|onboarding|paywall)/, { timeout: 25_000 });
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
    // The overwhelming majority of organic traffic. A missing cookie must be a
    // non-event, not an error path.
    const user = await makeUser();

    await page.goto("/login");
    await login(page, user.email);
    await page.goto("/onboarding");

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "sp_attr")).toBeUndefined();

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
      data: { eventName: "Purchase", eventId: "forged_purchase", customData: { value: 149.99 } },
    });

    expect(response.status()).toBe(400);
  });
});
