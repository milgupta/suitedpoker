import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * THE POST-CHECKOUT RACE.
 *
 * Stripe redirects to /welcome the instant the card clears, but the webhook
 * that writes the subscription row arrives separately. For that window the user
 * has paid and the database does not know it. Bouncing them to /paywall there
 * is the single most damaging bug in the payment flow — it reads as "it took my
 * money and it is still asking me to subscribe", and it produces a refund
 * request from someone who was about to become a customer.
 *
 * This drives the real race: land on /welcome with NO subscription row, then
 * write one mid-poll the way the webhook would, and watch the page let them in.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const BYPASS_ON = process.env.DEV_BYPASS_ENTITLEMENT === "true";

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeUser(): Promise<{ id: string; email: string }> {
  const email = `e2e+welcome${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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

/** What the Stripe webhook does, reduced to the one row that matters. */
async function webhookLands(userId: string): Promise<void> {
  const { error } = await admin.from("subscriptions").insert({
    user_id: userId,
    status: "active",
    price_id: "price_e2e_welcome",
    stripe_subscription_id: `sub_e2e_${userId.slice(0, 8)}_${Date.now()}`,
    current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  });
  if (error !== null) throw error;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(practice|paywall|onboarding)/, { timeout: 20_000 });
}

test.describe("the /welcome race", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    // With the bypass on, everyone is entitled and this suite would pass
    // without testing anything.
    expect(BYPASS_ON, "DEV_BYPASS_ENTITLEMENT must be false for this suite").toBe(false);
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.from("subscriptions").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("a user who just paid is NOT bounced to the paywall", async ({ page }) => {
    const user = await makeUser();
    await login(page, user.email);

    await page.goto("/welcome?session_id=cs_test_pending");

    // The gate must let them through even with no subscription row at all.
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole("heading", { name: "Setting up your account" })).toBeVisible();
    await expect(page.locator("[data-welcome-state='checking']")).toBeVisible();

    // And it must not move them on before the payment is actually recorded.
    await expect(page.getByTestId("welcome-continue")).toBeDisabled();
  });

  test("admits the user within seconds of the webhook landing", async ({ page }) => {
    const user = await makeUser();
    await login(page, user.email);
    await page.goto("/welcome?session_id=cs_test_pending");

    await expect(page.locator("[data-welcome-state='checking']")).toBeVisible();

    // The webhook arrives, mid-poll.
    const landedAt = Date.now();
    await webhookLands(user.id);

    await expect(page.getByRole("heading", { name: "You're in" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("welcome-continue")).toBeEnabled();

    const elapsed = Date.now() - landedAt;
    expect(elapsed, "must be admitted within 10s of the webhook").toBeLessThan(10_000);
    console.log(`  admitted ${elapsed}ms after the webhook landed`);
  });

  test("the entitled user can then reach the paid product", async ({ page }) => {
    const user = await makeUser();
    await webhookLands(user.id);
    await login(page, user.email);

    await page.goto("/welcome");
    await expect(page.getByRole("heading", { name: "You're in" })).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("welcome-continue").click();
    // Not /paywall, which is the failure this whole page exists to prevent.
    await expect(page).not.toHaveURL(/\/paywall/);
  });

  test("an unpaid user reaching a gated page still hits the paywall", async ({ page }) => {
    // /welcome being exempt must not have opened a hole in the gate itself.
    const user = await makeUser();
    await login(page, user.email);

    await page.goto("/drill");
    await expect(page).toHaveURL(/\/paywall/);
  });

  test("the status endpoint never leaks subscription detail", async ({ page }) => {
    const user = await makeUser();
    await webhookLands(user.id);
    await login(page, user.email);

    const body = await page.evaluate(async () => {
      const response = await fetch("/api/entitlement/status", { method: "POST" });
      return (await response.json()) as Record<string, unknown>;
    });

    // One boolean and nothing else. A price id or a period end here would be a
    // gratuitous disclosure on a route that is reachable by an unpaid user.
    expect(Object.keys(body).sort()).toEqual(["entitled"]);
    expect(body.entitled).toBe(true);
  });
});
