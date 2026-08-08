import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * Practice is the product home. /dashboard only redirects here.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+home${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);

  await admin.from("subscriptions").insert({
    user_id: id,
    status: "active",
    price_id: "price_e2e",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });

  return { id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/practice/, { timeout: 30_000 });
}

test.describe("app home", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("login lands on Practice, not a Home hub", async ({ page }) => {
    const { email } = await makeUser("login");
    await login(page, email);
    await expect(page.locator("[data-practice]")).toBeVisible();
    await expect(page.locator("[data-nav='Home']")).toHaveCount(0);
    await expect(page.locator("[data-nav='Practice']").first()).toBeVisible();
  });

  test("/dashboard redirects to /practice", async ({ page }) => {
    const { email } = await makeUser("redir");
    await login(page, email);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/practice/);
    await expect(page.locator("[data-practice]")).toBeVisible();
  });

  test("chrome shows logo, nav, and account on Practice", async ({ page }) => {
    const { email } = await makeUser("chrome");
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, email);

    await expect(page.locator("[data-app-chrome='full']")).toBeVisible();
    await expect(page.getByRole("link", { name: "SuitedPoker home" })).toBeVisible();
    await expect(page.locator("[data-nav='Practice']")).toBeVisible();
    await expect(page.locator("[data-nav='Progress']")).toBeVisible();
    await expect(page.locator("[data-cta='account']")).toHaveAttribute("href", "/account");
  });

  test("mobile chrome uses a menu instead of overflowing capsules", async ({ page }) => {
    const { email } = await makeUser("menumob");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);

    await expect(page.locator("[data-nav-menu]")).toBeVisible();
    await page.locator("[data-nav-menu]").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator("[data-nav='Progress']")).toBeVisible();
    await sheet.locator("[data-nav='Progress']").click();
    await expect(page).toHaveURL(/\/progress/);
  });
});
