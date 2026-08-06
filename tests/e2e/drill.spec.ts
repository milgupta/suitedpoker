import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The drill loop against the real stack.
 *
 * Covers the checks that can only be made over HTTP: the raw /next response
 * body, cross-user tampering, replay, and ten complete drills persisting.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(): Promise<{ id: string; email: string }> {
  const email = `e2e+drill${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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
  // Generous on purpose. Under a loaded dev server with parallel workers this
  // redirect chain — middleware, entitlement check, render — regularly takes
  // ten seconds, and a 5s default turns that into a fake product failure.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function nextSpot(request: APIRequestContext): Promise<{
  status: number;
  body: Record<string, unknown>;
  raw: string;
}> {
  const response = await request.post("/api/drills/next", {
    data: { config: { type: "preflop" } },
  });
  const raw = await response.text();
  return {
    status: response.status(),
    body: raw === "" ? {} : (JSON.parse(raw) as Record<string, unknown>),
    raw,
  };
}

test.describe("drill loop", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("SECURITY — the raw /next response carries no solution data", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const { status, body, raw } = await nextSpot(page.request);
    expect(status).toBe(200);

    // Printed in full so it can be read rather than trusted.
    console.log("RAW /api/drills/next RESPONSE:\n" + raw);

    const allowed = new Set([
      "spotId",
      "spot",
      // A UI hint naming a category the user is weak in — never anything about
      // THIS spot's answer.
      "leakTag",
      "id",
      "type",
      "heroPos",
      "heroCards",
      "board",
      "potBb",
      "effStackBb",
      "actionHistory",
      "legalActions",
      "seats",
      "difficulty",
      "seat",
      "position",
      "stackBb",
      "isHero",
    ]);

    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(body);

    const unexpected = [...keys].filter((k) => !allowed.has(k));
    expect(unexpected, `unexpected keys: ${unexpected.join(", ")}`).toEqual([]);

    // (c) nodeRef, and the rest of the answer, must be absent by name too.
    for (const forbidden of ["nodeRef", "strategy", "ev", "handKey", "seed", "frequencies"]) {
      expect(raw, `${forbidden} appears in the raw response`).not.toContain(`"${forbidden}"`);
    }
  });

  test("the arena actually renders a hand rather than an error boundary", async ({ page }) => {
    /**
     * The security tests below scrape the page for solution data — and a page
     * that has CRASHED contains none of it, so they pass on a broken arena.
     * This asserts the opposite thing: that a hand is really on screen.
     *
     * It exists because the arena spent three substages crashing on every load.
     * `Card` is a branded number, and SpotView stringified each one and fed it
     * back through `cardsFromString`, which threw "not a card: 36".
     */
    const { email } = await makeEntitledUser();
    await login(page, email);

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/arena");
    await page.waitForTimeout(2500);

    expect(errors, `the arena threw: ${errors.join(" | ")}`).toEqual([]);
    await expect(page.getByText(/couldn.t load/i)).toHaveCount(0);

    // Two hole cards, and a decision to make.
    const cards = await page.getByRole("img").count();
    expect(cards, "no hero cards rendered").toBeGreaterThanOrEqual(2);
    expect(
      await page.getByRole("button", { name: /fold|call|raise|check|bet/i }).count(),
      "no action buttons rendered",
    ).toBeGreaterThan(0);
  });

  test("SECURITY — the rendered page exposes no solution data either", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    await page.goto("/arena");
    await page.waitForTimeout(2500);

    const html = await page.content();
    for (const forbidden of ["nodeRef", "handKey", '"strategy"', '"frequencies"']) {
      expect(html, `${forbidden} rendered into the page`).not.toContain(forbidden);
    }
  });

  test("TAMPER — another user's spotId is rejected", async ({ browser }) => {
    const a = await makeEntitledUser();
    const b = await makeEntitledUser();

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await login(pageA, a.email);
    const spot = await nextSpot(pageA.request);
    const spotId = spot.body["spotId"] as string;

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await login(pageB, b.email);

    const stolen = await pageB.request.post("/api/drills/answer", {
      data: { spotId, action: "fold", timeMs: 1000 },
    });
    expect(stolen.status(), "user B graded user A's spot").toBe(404);

    await contextA.close();
    await contextB.close();
  });

  test("TAMPER — the same spotId cannot be answered twice", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const spot = await nextSpot(page.request);
    const spotId = spot.body["spotId"] as string;
    const legal = (spot.body["spot"] as { legalActions: string[] }).legalActions;
    const action = legal[0] ?? "fold";

    const first = await page.request.post("/api/drills/answer", {
      data: { spotId, action, timeMs: 900 },
    });
    expect(first.status()).toBe(200);

    // Otherwise a user resubmits until the rating moves the right way.
    const second = await page.request.post("/api/drills/answer", {
      data: { spotId, action, timeMs: 900 },
    });
    expect(second.status(), "a spot was graded twice").toBe(409);
  });

  test("TAMPER — an illegal action is rejected", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const spot = await nextSpot(page.request);
    const spotId = spot.body["spotId"] as string;

    const response = await page.request.post("/api/drills/answer", {
      data: { spotId, action: "teleport", timeMs: 900 },
    });
    expect(response.status()).toBe(400);
  });

  test("an unentitled user cannot draw a spot", async ({ page }) => {
    const email = `e2e+noent${Date.now()}@suitedpoker.com`;
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

    const response = await page.request.post("/api/drills/next", {
      data: { config: { type: "preflop" } },
    });
    expect(response.status()).toBe(402);
  });

  test("ten drills persist ten attempts with matching grades", async ({ page }) => {
    const { id, email } = await makeEntitledUser();
    await login(page, email);

    const graded: { grade: string; evLoss: number }[] = [];

    for (let i = 0; i < 10; i++) {
      const spot = await nextSpot(page.request);
      const spotId = spot.body["spotId"] as string;
      const legal = (spot.body["spot"] as { legalActions: string[] }).legalActions;
      const action = legal[i % legal.length] ?? "fold";

      const response = await page.request.post("/api/drills/answer", {
        data: { spotId, action, timeMs: 1200 },
      });
      expect(response.status()).toBe(200);

      const result = (await response.json()) as { grade: string; evLoss: number };
      graded.push(result);
    }

    const { data: rows, error } = await admin
      .from("drill_attempts")
      .select("grade, ev_loss")
      .eq("user_id", id);

    expect(error).toBeNull();
    expect(rows?.length, "ten drills did not produce ten rows").toBe(10);

    // The summary maths must reconcile with the individual attempts.
    const persistedLoss = (rows ?? []).reduce((sum, r) => sum + Number(r.ev_loss), 0);
    const returnedLoss = graded.reduce((sum, g) => sum + g.evLoss, 0);
    expect(persistedLoss).toBeCloseTo(returnedLoss, 2);

    const persistedGrades = (rows ?? []).map((r) => r.grade as string).sort();
    expect(persistedGrades).toEqual(graded.map((g) => g.grade).sort());
  });
});
