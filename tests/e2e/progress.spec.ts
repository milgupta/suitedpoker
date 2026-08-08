import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * Progress owns the stats that used to live under the fold on Home.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+prog${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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

async function seedAttempts(
  userId: string,
  spec: { grade: string; evLoss: number; board: string | null; action: string; daysAgo: number }[],
): Promise<void> {
  const rows = spec.map((s) => ({
    user_id: userId,
    node_ref: "BTN:rfi",
    hero_hand: "AKs",
    board: s.board,
    chosen_action: s.action,
    grade: s.grade,
    ev_loss: s.evLoss.toFixed(3),
    time_ms: 6_000,
    source: "arena",
    created_at: new Date(Date.now() - s.daysAgo * 86_400_000).toISOString(),
  }));
  const { error } = await admin.from("drill_attempts").insert(rows);
  if (error !== null) throw error;
}

test.describe("progress", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("empty progress shows a path, never 0%", async ({ page }) => {
    const { email } = await makeUser("empty");
    await login(page, email);
    await page.goto("/progress");

    await expect(page.locator("[data-progress]")).toBeVisible();
    await expect(page.locator("[data-section='start-here']")).toBeVisible();
    await expect(page.locator("[data-section='numbers']")).toHaveCount(0);

    const text = await page.locator("[data-progress]").innerText();
    expect(text).not.toMatch(/\b0%/);
  });

  test("seeded numbers match on /progress", async ({ page }) => {
    const { id, email } = await makeUser("nums");
    await seedAttempts(id, [
      { grade: "best", evLoss: 0, board: null, action: "raise", daysAgo: 0 },
      { grade: "best", evLoss: 0, board: null, action: "call", daysAgo: 0 },
      { grade: "best", evLoss: 0, board: null, action: "fold", daysAgo: 0 },
      { grade: "sharp", evLoss: 0, board: "Ah Kd 2c", action: "raise", daysAgo: 0 },
      { grade: "solid", evLoss: 0.2, board: null, action: "call", daysAgo: 0 },
      { grade: "inaccuracy", evLoss: 0.8, board: null, action: "fold", daysAgo: 0 },
      { grade: "inaccuracy", evLoss: 0.9, board: "Ah Kd 2c", action: "call", daysAgo: 0 },
      { grade: "mistake", evLoss: 1.5, board: null, action: "fold", daysAgo: 0 },
      { grade: "mistake", evLoss: 1.6, board: "Ah Kd 2c 5s", action: "call", daysAgo: 0 },
      { grade: "blunder", evLoss: 4.0, board: "Ah Kd 2c 5s 9h", action: "fold", daysAgo: 0 },
    ]);

    await login(page, email);
    await page.goto("/progress");

    await expect(page.locator("[data-section='numbers']")).toBeVisible();
    await expect(page.locator("[data-section='start-here']")).toHaveCount(0);

    const numbers = await page.locator("[data-section='numbers']").innerText();
    console.log(`SEEDED PROGRESS NUMBERS:\n${numbers}`);
    expect(numbers).toContain("50");
    expect(numbers).toContain("90.0");

    const attemptsByStreet = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const el of Array.from(document.querySelectorAll("[data-street]"))) {
        out[el.getAttribute("data-street") ?? ""] = el.getAttribute("data-attempts") ?? "";
      }
      return out;
    });
    expect(attemptsByStreet.preflop).toBe("6");
    expect(attemptsByStreet.flop).toBe("2");
    expect(attemptsByStreet.turn).toBe("1");
    expect(attemptsByStreet.river).toBe("1");
  });

  test("30 days of data renders sparkline and week", async ({ page }) => {
    const { id, email } = await makeUser("thirty");
    const spread = Array.from({ length: 60 }, (_, i) => ({
      grade: i % 3 === 0 ? "best" : i % 3 === 1 ? "inaccuracy" : "mistake",
      evLoss: i % 3 === 0 ? 0 : 1,
      board: i % 2 === 0 ? null : "Ah Kd 2c",
      action: i % 2 === 0 ? "raise" : "call",
      daysAgo: i % 12,
    }));
    await seedAttempts(id, spread);

    await login(page, email);
    await page.goto("/progress");

    await expect(page.locator("[data-sparkline]")).toBeVisible();
    await expect(page.locator("[data-section='week']")).toBeVisible();

    const leaks = await page.locator("[data-section='leaks']").innerText();
    expect(leaks).not.toContain("Play 50 hands");
  });

  test("every stat tile opens a populated definition", async ({ page }) => {
    const { id, email } = await makeUser("stats");
    await seedAttempts(id, [
      { grade: "best", evLoss: 0, board: null, action: "raise", daysAgo: 0 },
    ]);
    await login(page, email);
    await page.goto("/progress");

    const tiles = page.locator("[data-section='numbers'] button");
    const count = await tiles.count();
    expect(count, "no stat tiles carry an (i)").toBeGreaterThanOrEqual(4);

    for (let i = 0; i < 4; i++) {
      await tiles.nth(i).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      const text = await sheet.innerText();
      expect(text.length, `stat ${i} opened an empty sheet`).toBeGreaterThan(80);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
  });
});
