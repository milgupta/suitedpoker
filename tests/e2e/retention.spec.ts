import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * Smoke for the advanced retention layer: Arena mix by rating, Go deeper hub
 * links, and the advanced module staying locked until prior progress.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+ret${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);

  const { error: subError } = await admin.from("subscriptions").insert({
    user_id: id,
    status: "active",
    price_id: "price_e2e",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (subError !== null) throw subError;

  return { id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/practice/, { timeout: 30_000 });
}

function boardLen(spot: Record<string, unknown>): number {
  const board = spot.board;
  if (typeof board === "string") return board.trim() === "" ? 0 : board.split(/\s+/).length;
  if (Array.isArray(board)) return board.length;
  return 0;
}

test.describe("retention layer", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("Arena below Rec stays preflop on the open grind", async ({ page }) => {
    const { id, email } = await makeEntitledUser("low");
    await admin.from("profiles").update({ rating: 900, rating_deviation: 200 }).eq("id", id);
    await login(page, email);

    for (let i = 0; i < 12; i++) {
      const response = await page.request.post("/api/drills/next", {
        data: { config: { type: "preflop" } },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { spot: Record<string, unknown>; leakTag?: string };
      // Leak targeting can request postflop; when the chip is absent the mix
      // must leave beginners on preflop.
      if (body.leakTag == null || body.leakTag === "") {
        expect(boardLen(body.spot), `deal ${i} dealt a board below Rec`).toBe(0);
      }
    }
  });

  test("high rating open Arena can deal postflop", async ({ page }) => {
    const { id, email } = await makeEntitledUser("high");
    await admin
      .from("profiles")
      .update({ rating: 1450, rating_deviation: 150, primary_leak_key: null })
      .eq("id", id);
    await login(page, email);

    let sawPostflop = false;
    for (let i = 0; i < 40; i++) {
      const response = await page.request.post("/api/drills/next", {
        data: { config: { type: "preflop" } },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { spot: Record<string, unknown>; leakTag?: string };
      if (body.leakTag) continue;
      if (boardLen(body.spot) >= 3) {
        sawPostflop = true;
        break;
      }
    }
    expect(sawPostflop, "40 open deals at 1450 never produced a postflop board").toBe(true);
  });

  test("Practice hub surfaces Go deeper presets", async ({ page }) => {
    const { email } = await makeEntitledUser("hub");
    await login(page, email);
    await page.goto("/practice");
    await expect(page.locator("[data-section='go-deeper']")).toBeVisible();
    await expect(page.locator("[data-cta='postflop-focus']")).toBeVisible();
    await expect(page.locator("[data-cta='threebet-focus']")).toBeVisible();
    await expect(page.locator("[data-cta='advanced-module']")).toBeVisible();
  });

  test("advanced module stays locked until prior module progress", async ({ page }) => {
    const { email } = await makeEntitledUser("advlock");
    await login(page, email);

    await page.goto("/learn/playing-harder-spots/three-bet-pots");
    await expect(page).toHaveURL(/\/learn$/, { timeout: 30_000 });

    const forced = await page.request.post("/api/learn/progress", {
      data: { slug: "three-bet-pots", accuracy: 0.9 },
    });
    expect(forced.status()).toBe(403);
    expect(((await forced.json()) as { error: string }).error).toBe("lesson_locked");
  });

  test("overcalling leak chip coincides with a defense-family spot", async ({ page }) => {
    const { id, email } = await makeEntitledUser("leak");
    await admin
      .from("profiles")
      .update({
        rating: 1100,
        rating_deviation: 200,
        primary_leak_key: "overcalling",
      })
      .eq("id", id);
    await login(page, email);

    let tagged = 0;
    for (let i = 0; i < 50 && tagged < 3; i++) {
      const response = await page.request.post("/api/drills/next", {
        data: { config: { type: "preflop" } },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        leakTag?: string | null;
        spot: { type?: string; actionHistory?: unknown[]; board?: unknown };
      };
      if (body.leakTag !== "overcalling") continue;
      tagged += 1;
      // Defense vs open is preflop with prior action in the history, never a
      // bare RFI with an empty board.
      expect(boardLen(body.spot as Record<string, unknown>)).toBe(0);
      const history = body.spot.actionHistory;
      expect(
        Array.isArray(history) && history.length > 0,
        "tagged defense spot had no history",
      ).toBe(true);
    }
    expect(tagged, "leak targeting never fired in 50 deals").toBeGreaterThan(0);
  });
});
