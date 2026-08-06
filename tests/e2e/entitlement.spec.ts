import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The four gating states from 1.3's acceptance criteria, driven through the
 * real middleware against a real Supabase project.
 *
 * DEV_BYPASS_ENTITLEMENT must be off for these to mean anything — the suite
 * checks that first and fails loudly rather than passing on a bypass.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const BYPASS_ON = process.env.DEV_BYPASS_ENTITLEMENT === "true";

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

function uniqueEmail(): string {
  return `e2e+ent${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
}

async function makeUser(): Promise<{ id: string; email: string }> {
  const email = uniqueEmail();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);
  return { id, email };
}

async function giveSubscription(userId: string, status: string, endsAt: Date): Promise<void> {
  const { error } = await admin.from("subscriptions").insert({
    user_id: userId,
    status,
    price_id: "price_e2e",
    current_period_end: endsAt.toISOString(),
  });
  if (error !== null) throw error;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
}

const future = (): Date => new Date(Date.now() + 30 * 24 * 3600 * 1000);
const past = (): Date => new Date(Date.now() - 24 * 3600 * 1000);

test.describe("entitlement gating", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    // A bypass left on would make every assertion below pass for the wrong
    // reason, so refuse to run rather than report a false green.
    expect(BYPASS_ON, "DEV_BYPASS_ENTITLEMENT must be false for this suite").toBe(false);

    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("STATE 1 — unauthenticated is sent to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test("STATE 2 — authenticated with no subscription is sent to /paywall", async ({ page }) => {
    const { email } = await makeUser();
    await login(page, email);
    await expect(page).toHaveURL(/\/paywall/);
    // Asserted on the plan cards rather than the headline: this test is about
    // the GATE, and tying it to marketing copy makes every copy edit a red
    // security test.
    await expect(page.locator("[data-plan=annual]")).toBeVisible();
    await expect(page.locator("[data-plan=monthly]")).toBeVisible();
  });

  test("STATE 3 — an active subscription is admitted", async ({ page }) => {
    const { id, email } = await makeUser();
    await giveSubscription(id, "active", future());

    await login(page, email);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("STATE 4 — 'active' with a PAST period end is NOT admitted", async ({ page }) => {
    // The subtle one. Stripe can lag on status, so the period end is what
    // actually decides.
    const { id, email } = await makeUser();
    await giveSubscription(id, "active", past());

    await login(page, email);
    await expect(page).toHaveURL(/\/paywall/);
  });

  test("a trialing subscription is admitted", async ({ page }) => {
    const { id, email } = await makeUser();
    await giveSubscription(id, "trialing", future());

    await login(page, email);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a cancelled subscription is not admitted", async ({ page }) => {
    const { id, email } = await makeUser();
    await giveSubscription(id, "canceled", future());

    await login(page, email);
    await expect(page).toHaveURL(/\/paywall/);
  });

  test("/onboarding and /welcome stay reachable without entitlement", async ({ page }) => {
    const { email } = await makeUser();
    await login(page, email);
    await expect(page).toHaveURL(/\/paywall/);

    // Gating onboarding would trap every new signup; gating /welcome would
    // bounce a user whose Stripe webhook has not landed yet.
    await page.goto("/onboarding");
    await expect(page.getByRole("button", { name: "Find my leak" })).toBeVisible();

    await page.goto("/welcome");
    await expect(page.getByRole("heading", { name: "You're in" })).toBeVisible();
  });

  test("an unentitled user still cannot reach a gated page directly", async ({ page }) => {
    const { email } = await makeUser();
    await login(page, email);
    // Wait for login to settle, or the next navigation races the session
    // cookie and gets bounced to /login instead of /paywall.
    await expect(page).toHaveURL(/\/paywall/);

    await page.goto("/drill");
    await expect(page).toHaveURL(/\/paywall/);
  });
});

test.describe("api guards", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("withAuth returns 401 to an anonymous caller", async ({ request }) => {
    const response = await request.get("/api/guard-probe/authed");
    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  test("withEntitlement returns 401 to an anonymous caller", async ({ request }) => {
    // Not 402 — an anonymous caller has not failed to pay, they have failed to
    // log in, and the client needs to show a different screen.
    const response = await request.get("/api/guard-probe/entitled");
    expect(response.status()).toBe(401);
  });

  test("withAuth admits a logged-in caller without a subscription", async ({ page }) => {
    const { id, email } = await makeUser();
    await login(page, email);
    await expect(page).toHaveURL(/\/paywall/);

    const response = await page.request.get("/api/guard-probe/authed");
    expect(response.status()).toBe(200);
    expect((await response.json()).userId).toBe(id);
  });

  test("withEntitlement returns 402 — not 401 or 403 — to an authed but unentitled caller", async ({
    page,
  }) => {
    const { email } = await makeUser();
    await login(page, email);
    await expect(page).toHaveURL(/\/paywall/);

    const response = await page.request.get("/api/guard-probe/entitled");
    expect(response.status()).toBe(402);
    expect((await response.json()).error).toBe("entitlement_required");
  });

  test("withEntitlement admits an entitled caller", async ({ page }) => {
    const { id, email } = await makeUser();
    await giveSubscription(id, "active", future());
    await login(page, email);
    await expect(page).toHaveURL(/\/dashboard/);

    const response = await page.request.get("/api/guard-probe/entitled");
    expect(response.status()).toBe(200);
  });
});
