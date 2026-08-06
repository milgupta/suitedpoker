import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(): Promise<string> {
  const email = `e2e+ranges${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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

  return email;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  // Generous on purpose. Under a loaded dev server with parallel workers this
  // redirect chain — middleware, entitlement check, render — regularly takes
  // ten seconds, and a 5s default turns that into a fake product failure.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("range grid", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  for (const { name, width, height } of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`renders 169 cells with no overflow at ${width}px (${name})`, async ({ page }) => {
      const email = await makeEntitledUser();
      await login(page, email);

      await page.setViewportSize({ width, height });
      await page.goto("/ranges");
      await expect(page.getByRole("heading", { name: "Ranges" })).toBeVisible();
      await page.waitForTimeout(1200);

      const cells = page.getByRole("gridcell");
      await expect(cells).toHaveCount(169);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, `page scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);

      // Every cell must be a real, tappable square rather than collapsing.
      const smallest = await page.evaluate(() => {
        let min = Infinity;
        for (const el of Array.from(document.querySelectorAll("[role=gridcell]"))) {
          min = Math.min(min, el.getBoundingClientRect().width);
        }
        return min;
      });
      expect(smallest, `smallest cell is ${smallest}px`).toBeGreaterThan(10);
    });
  }

  test("labels appear only above 500px", async ({ page }) => {
    const email = await makeEntitledUser();
    await login(page, email);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ranges");
    await page.waitForTimeout(1000);

    // At 390 the grid is purely visual; a 13-wide grid of labels is unreadable.
    const labelVisibleNarrow = await page
      .getByRole("gridcell", { name: "AA" })
      .locator("span")
      .last()
      .isVisible();
    expect(labelVisibleNarrow).toBe(false);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(600);
    const labelVisibleWide = await page
      .getByRole("gridcell", { name: "AA" })
      .locator("span")
      .last()
      .isVisible();
    expect(labelVisibleWide).toBe(true);
  });

  test("the whole 169-cell reveal finishes under 400ms", async ({ page }) => {
    const email = await makeEntitledUser();
    await login(page, email);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ranges");
    await page.waitForTimeout(1500);

    const worst = await page.evaluate(() => {
      let max = 0;
      for (const el of Array.from(document.querySelectorAll("[role=gridcell]"))) {
        for (const animation of el.getAnimations()) {
          const timing = animation.effect?.getComputedTiming();
          const total = (timing?.delay ?? 0) + (Number(timing?.duration) || 0);
          if (Number.isFinite(total)) max = Math.max(max, total);
        }
      }
      return max;
    });

    // 169 cells at 10ms each would be 1.7s and read as broken.
    expect(worst, `slowest cell finishes at ${worst}ms`).toBeLessThanOrEqual(400);
  });

  test("tapping a cell reveals its exact frequencies", async ({ page }) => {
    const email = await makeEntitledUser();
    await login(page, email);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ranges");
    await page.waitForTimeout(1200);

    // Below 500px the grid has no labels, so tap-for-detail is the only way in.
    await page.getByRole("gridcell", { name: "AA" }).click();

    const detail = page.getByRole("status");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("AA");
    await expect(detail).toContainText("%");
  });

  test("'practise this spot' launches a pre-configured arena session", async ({ page }) => {
    const email = await makeEntitledUser();
    await login(page, email);

    await page.goto("/ranges");
    await page.waitForTimeout(1200);

    await page.getByRole("link", { name: "Practise this spot" }).click();
    await expect(page).toHaveURL(/\/arena\?preset=/);
    // The label chip proves the preset decoded rather than silently falling
    // back to the default endless session.
    await expect(page.getByText(/Practising:/)).toBeVisible({ timeout: 15_000 });
  });

  test("an unentitled user cannot read the ranges", async ({ page }) => {
    const email = `e2e+rangesnoent${Date.now()}@suitedpoker.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (data.user !== null) created.push(data.user.id);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/paywall/);

    expect((await page.request.get("/api/ranges")).status()).toBe(402);
  });
});
