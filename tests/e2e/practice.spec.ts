import { expect, test } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

test.describe("practice hub", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("separates daily, arena, and table", async ({ page }) => {
    const email = `e2e+prac${Date.now()}@suitedpoker.com`;
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

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/practice/, { timeout: 30_000 });

    await page.goto("/practice");
    await expect(page.locator("[data-practice]")).toBeVisible();
    await expect(page.locator("[data-quick='Daily']")).toHaveAttribute("href", "/daily");
    await expect(page.locator("[data-quick='Arena']")).toHaveAttribute("href", "/arena");
    await expect(page.locator("[data-quick='Table sim']")).toHaveAttribute("href", "/table");
  });
});
