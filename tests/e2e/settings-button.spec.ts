import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * THE SETTINGS GEAR, ON EVERY ROUTE THAT SHOULD CARRY IT.
 *
 * `chromeMode` is unit-tested, but that only pins which MODE a path resolves
 * to — nothing asserted that the gear itself renders, points at /account, or
 * can be hit with a thumb. The bar has two shapes (full on hubs, compact
 * mid-session) and the gear lives outside that branch, so a refactor that moved
 * it inside would silently strip it from every game screen and no test would
 * have noticed.
 *
 * The funnel routes (/onboarding, /diagnosis, /paywall, /welcome) render no
 * chrome by design; that decision stays covered by tests/unit/app-chrome.test.ts.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

/** Every entitled route, spanning both chrome modes: /arena and /daily are compact. */
const CHROME_ROUTES = [
  "/practice",
  "/progress",
  "/arena",
  "/ranges",
  "/learn",
  "/daily",
  "/account",
  "/table",
] as const;

let admin: SupabaseClient;
const created: string[] = [];

async function makeSubscriber(): Promise<{ id: string; email: string }> {
  const email = `e2e+gear${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null || data.user === null) throw error ?? new Error("no user");
  created.push(data.user.id);

  await admin.from("subscriptions").insert({
    user_id: data.user.id,
    status: "active",
    price_id: "price_gear",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  await admin
    .from("profiles")
    .update({ rating: 1100, onboarding: { goal: "move_up", complete: true } })
    .eq("id", data.user.id);

  return { id: data.user.id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(practice|onboarding|paywall)/, { timeout: 30_000 });
}

test.describe("the settings gear", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.from("subscriptions").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("is present and points at /account on every route with chrome", async ({ page }) => {
    const { email } = await makeSubscriber();
    await login(page, email);

    const missing: string[] = [];
    for (const route of CHROME_ROUTES) {
      await page.goto(route);
      const gear = page.getByRole("link", { name: "Account and settings" });

      if ((await gear.count()) === 0) {
        missing.push(`${route} — no gear`);
        continue;
      }
      const href = await gear.first().getAttribute("href");
      if (href !== "/account") missing.push(`${route} — href ${String(href)}`);
    }

    expect(missing, `routes without a working settings gear: ${missing.join(", ")}`).toEqual([]);
  });

  test("actually navigates when clicked, from a compact game screen", async ({ page }) => {
    const { email } = await makeSubscriber();
    await login(page, email);

    // /arena is compact chrome — the branch where the bar is rebuilt around a
    // breadcrumb, and so the one most likely to lose the gear in a refactor.
    await page.goto("/arena");
    await page.getByRole("link", { name: "Account and settings" }).first().click();
    await page.waitForURL(/\/account$/, { timeout: 30_000 });

    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  });

  test("carries a 44px hit area at 390px", async ({ page }) => {
    const { email } = await makeSubscriber();
    await login(page, email);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/practice");

    // The gear is a 40px circle wearing `.tap-target`, whose ::before supplies
    // the thumb-sized area. Measuring the element box would read 40 and fail a
    // control that is genuinely fine.
    const box = await page
      .getByRole("link", { name: "Account and settings" })
      .first()
      .evaluate((el) => {
        const pseudo = window.getComputedStyle(el, "::before");
        const own = el.getBoundingClientRect();
        return {
          width: Math.max(parseFloat(pseudo.width) || 0, own.width),
          height: Math.max(parseFloat(pseudo.height) || 0, own.height),
        };
      });

    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
