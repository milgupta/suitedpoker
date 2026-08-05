import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";

/**
 * The hint endpoint over real HTTP.
 *
 * The rules that matter here cannot be checked in a unit test, because they are
 * about WHO is asking and WHEN: another user's spot, an already-answered spot,
 * a level jumped out of order, and the daily budget. Every one of those is a way
 * to get the answer for free, and free answers are the product.
 */

loadLocalEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CONFIGURED = SUPABASE_URL !== "" && SERVICE_KEY !== "";

const PASSWORD = "correct-horse-battery";
const ACTION_WORDS =
  /\b(fold|folds|folded|folding|call|calls|called|calling|check|checks|checked|checking|raise|raises|raised|raising|bet|bets|betting|shove|jam|all[- ]?in)\b/i;

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+hint${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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
  await expect(page).toHaveURL(/\/dashboard/);
}

async function nextSpotId(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/drills/next", {
    data: { config: { type: "preflop" } },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { spotId: string; spot: { legalActions: string[] } };
  return body.spotId;
}

async function hint(
  request: APIRequestContext,
  spotId: string,
  level: number,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await request.post("/api/coach/hint", { data: { spotId, level } });
  const raw = await response.text();
  return { status: response.status(), body: raw === "" ? {} : JSON.parse(raw) };
}

test.describe("pre-decision hints", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("escalates through three levels, and levels 1 and 2 name no action", async ({ page }) => {
    const { email } = await makeEntitledUser("esc");
    await login(page, email);
    const spotId = await nextSpotId(page.request);

    const first = await hint(page.request, spotId, 1);
    expect(first.status).toBe(200);
    expect(String(first.body.text)).not.toMatch(ACTION_WORDS);

    const second = await hint(page.request, spotId, 2);
    expect(second.status).toBe(200);
    expect(String(second.body.text)).not.toMatch(ACTION_WORDS);

    const third = await hint(page.request, spotId, 3);
    expect(third.status).toBe(200);
    // Level 3 may name the category, but never a size or a frequency.
    expect(String(third.body.text)).not.toMatch(/\d/);

    console.log(
      `HINTS OVER HTTP:\n  L1: ${String(first.body.text)}\n  L2: ${String(second.body.text)}\n  L3: ${String(third.body.text)}`,
    );

    // The counter comes down and is reported to the UI.
    expect(Number(first.body.hintsRemaining)).toBeGreaterThan(Number(third.body.hintsRemaining));
  });

  test("refuses a level jumped out of order", async ({ page }) => {
    const { email } = await makeEntitledUser("order");
    await login(page, email);
    const spotId = await nextSpotId(page.request);

    const jumped = await hint(page.request, spotId, 3);
    expect(jumped.status).toBe(400);
    expect(jumped.body.error).toBe("level_out_of_order");
  });

  test("a repeat of a level already served costs nothing", async ({ page }) => {
    const { email } = await makeEntitledUser("repeat");
    await login(page, email);
    const spotId = await nextSpotId(page.request);

    const first = await hint(page.request, spotId, 1);
    const repeat = await hint(page.request, spotId, 1);

    expect(repeat.body.text).toBe(first.body.text);
    expect(Number(repeat.body.hintsRemaining)).toBe(Number(first.body.hintsRemaining));
  });

  test("SECURITY — another user's spot is not hintable", async ({ page, browser }) => {
    const owner = await makeEntitledUser("owner");
    await login(page, owner.email);
    const spotId = await nextSpotId(page.request);

    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();
    const attacker = await makeEntitledUser("attacker");
    await login(attackerPage, attacker.email);

    const stolen = await hint(attackerPage.request, spotId, 1);
    // 404, not 403 — confirming the spot exists but is not yours is itself a
    // disclosure.
    expect(stolen.status).toBe(404);
    expect(stolen.body.error).toBe("spot_not_found");

    await attackerContext.close();
  });

  test("SECURITY — an answered spot is not hintable", async ({ page }) => {
    const { email } = await makeEntitledUser("answered");
    await login(page, email);

    const response = await page.request.post("/api/drills/next", {
      data: { config: { type: "preflop" } },
    });
    const body = (await response.json()) as {
      spotId: string;
      spot: { legalActions: string[] };
    };
    const action = body.spot.legalActions[0] ?? "fold";

    await page.request.post("/api/drills/answer", {
      data: { spotId: body.spotId, action, timeMs: 1200 },
    });

    const late = await hint(page.request, body.spotId, 1);
    expect(late.status).toBe(409);
    expect(late.body.error).toBe("already_answered");
  });

  test("the daily budget stops at exactly 20 and reports a friendly counter", async ({ page }) => {
    test.slow();
    const { email } = await makeEntitledUser("budget");
    await login(page, email);

    const remainings: number[] = [];

    // 20 spots, one hint each. The 21st must be refused.
    for (let i = 0; i < 21; i++) {
      const spotId = await nextSpotId(page.request);
      const result = await hint(page.request, spotId, 1);
      expect(result.status).toBe(200);

      if (i < 20) {
        expect(result.body.exhausted, `hint ${i + 1} was refused early`).toBeUndefined();
        remainings.push(Number(result.body.hintsRemaining));
      } else {
        // Not an error — a counter. Running out of hints is a normal day.
        expect(result.body.exhausted).toBe(true);
        expect(Number(result.body.hintsRemaining)).toBe(0);
        expect(String(result.body.text)).toContain("20 hints");
        expect(result.body.resetAt).toBeDefined();
      }
    }

    // The counter counts down truthfully: 19, 18, ... 0.
    expect(remainings[0]).toBe(19);
    expect(remainings[19]).toBe(0);
  });

  test("SECURITY — the hint level comes from the server, not the client", async ({ page }) => {
    // The rating penalty is computed from this number. A client that reports its
    // own hint usage will eventually report zero, so the session is the only
    // acceptable source.
    const { id, email } = await makeEntitledUser("rating");
    await login(page, email);
    await admin.from("profiles").update({ rating: 1200, rating_deviation: 200 }).eq("id", id);

    const response = await page.request.post("/api/drills/next", {
      data: { config: { type: "preflop" } },
    });
    const body = (await response.json()) as { spotId: string; spot: { legalActions: string[] } };

    for (const level of [1, 2, 3]) await hint(page.request, body.spotId, level);

    const answer = await page.request.post("/api/drills/answer", {
      data: {
        spotId: body.spotId,
        action: body.spot.legalActions[0] ?? "fold",
        timeMs: 1000,
        // The lie.
        hintsUsed: 0,
      },
    });
    const graded = (await answer.json()) as { ratingDelta: number; hintsUsed: number };

    expect(graded.hintsUsed, "the client's claim of zero hints was believed").toBe(3);
  });
});
