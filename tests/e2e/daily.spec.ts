import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The daily challenge against the real stack.
 *
 * The check that matters most here is one-attempt enforcement: it has to be a
 * database constraint, not an application check, or two concurrent requests
 * slip past it and the leaderboard stops meaning anything.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(timezone = "UTC"): Promise<{ id: string; email: string }> {
  const email = `e2e+daily${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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
  await admin.from("profiles").update({ timezone }).eq("id", id);

  return { id, email };
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

test.describe("daily challenge", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("serves five spots and leaks no solution data", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const response = await page.request.get("/api/daily/today");
    expect(response.status()).toBe(200);

    const raw = await response.text();
    const body = JSON.parse(raw) as { spots: unknown[]; dayNumber: number };

    expect(body.spots).toHaveLength(5);
    expect(body.dayNumber).toBeGreaterThan(0);

    // Same rule as the arena: no answer in the payload.
    for (const forbidden of ["nodeRef", '"strategy"', '"ev"', "handKey", '"seed"']) {
      expect(raw, `${forbidden} leaked into the daily payload`).not.toContain(forbidden);
    }
  });

  test("is IDENTICAL for two different users on the same day", async ({ browser }) => {
    // The property the leaderboard depends on.
    const a = await makeEntitledUser();
    const b = await makeEntitledUser();

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, a.email);
    const bodyA = await (await pageA.request.get("/api/daily/today")).json();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await login(pageB, b.email);
    const bodyB = await (await pageB.request.get("/api/daily/today")).json();

    expect(JSON.stringify(bodyA.spots)).toBe(JSON.stringify(bodyB.spots));
    expect(bodyA.challengeId).toBe(bodyB.challengeId);

    await contextA.close();
    await contextB.close();
  });

  test("ONE ATTEMPT — a second answer for the same spot is rejected server-side", async ({
    page,
  }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const today = await (await page.request.get("/api/daily/today")).json();
    const action = (today.spots[0] as { legalActions: string[] }).legalActions[0] ?? "fold";

    const first = await page.request.post("/api/daily/answer", {
      data: { spotIndex: 0, action, timeMs: 1000 },
    });
    expect(first.status()).toBe(200);

    // Rejected by the UNIQUE(result_id, spot_index) index, not by the UI hiding
    // the button.
    const second = await page.request.post("/api/daily/answer", {
      data: { spotIndex: 0, action, timeMs: 1000 },
    });
    expect(second.status(), "a daily spot was answered twice").toBe(409);
  });

  test("two concurrent answers for the same spot produce exactly one row", async ({ page }) => {
    const { id, email } = await makeEntitledUser();
    await login(page, email);

    const today = await (await page.request.get("/api/daily/today")).json();
    const action = (today.spots[1] as { legalActions: string[] }).legalActions[0] ?? "fold";

    // An application-level check loses this race; a database constraint does not.
    const [a, b] = await Promise.all([
      page.request.post("/api/daily/answer", { data: { spotIndex: 1, action, timeMs: 1000 } }),
      page.request.post("/api/daily/answer", { data: { spotIndex: 1, action, timeMs: 1000 } }),
    ]);

    const statuses = [a.status(), b.status()].sort();
    expect(statuses).toEqual([200, 409]);

    const { data: results } = await admin
      .from("daily_results")
      .select("id")
      .eq("user_id", id)
      .limit(1);

    const resultId = results?.[0]?.id;
    expect(resultId).toBeDefined();

    const { data: rows } = await admin
      .from("daily_spot_results")
      .select("spot_index")
      .eq("result_id", resultId)
      .eq("spot_index", 1);

    expect(rows?.length, "the unique constraint did not hold").toBe(1);
  });

  test("completing all five finishes the challenge and sets a streak", async ({ page }) => {
    const { id, email } = await makeEntitledUser();
    await login(page, email);

    const today = await (await page.request.get("/api/daily/today")).json();

    let last: { finished: boolean; score: number; streak: { count: number } | null } | null = null;
    for (let i = 0; i < 5; i++) {
      const action = (today.spots[i] as { legalActions: string[] }).legalActions[0] ?? "fold";
      const response = await page.request.post("/api/daily/answer", {
        data: { spotIndex: i, action, timeMs: 1000 },
      });
      expect(response.status()).toBe(200);
      last = await response.json();
    }

    expect(last?.finished).toBe(true);
    expect(last?.streak?.count).toBe(1);

    const { data: profile } = await admin
      .from("profiles")
      .select("streak_count, last_daily_at")
      .eq("id", id)
      .single();

    expect(profile?.streak_count).toBe(1);
    expect(profile?.last_daily_at).not.toBeNull();
  });

  test("the leaderboard pins the caller's own rank", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const today = await (await page.request.get("/api/daily/today")).json();
    for (let i = 0; i < 5; i++) {
      const action = (today.spots[i] as { legalActions: string[] }).legalActions[0] ?? "fold";
      await page.request.post("/api/daily/answer", {
        data: { spotIndex: i, action, timeMs: 1000 },
      });
    }

    const response = await page.request.get("/api/daily/leaderboard");
    expect(response.status()).toBe(200);

    const board = (await response.json()) as {
      me: { rank: number; score: number } | null;
      top: { rank: number; isMe: boolean }[];
    };

    // Always present, even for a user outside the top 100 — a leaderboard that
    // shows a beginner nothing about themselves is one they never revisit.
    expect(board.me, "the caller's own rank was not returned").not.toBeNull();
    expect(board.me?.rank).toBeGreaterThan(0);
  });

  test("an unentitled user cannot play the daily", async ({ page }) => {
    const email = `e2e+dailynoent${Date.now()}@suitedpoker.com`;
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

    expect((await page.request.get("/api/daily/today")).status()).toBe(402);
  });
});
