import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The one hand before the wall.
 *
 * Two things need a real server to prove. First, the ABUSE SURFACE: this is the
 * only drill in the product reachable without paying, so "exactly one hand" has
 * to hold against a client that simply asks again. Second, the CARRY-FORWARD:
 * the diagnosis must open with the hand actually played, with numbers matching
 * the stored record — that is the entire reason the screen exists, and a
 * mismatch would make it another horoscope.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

/** A user who has finished the quiz — the demo hand comes straight after. */
async function makeQuizzedUser(tier = "videos"): Promise<{ id: string; email: string }> {
  const email = `e2e+demo${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null || data.user === null) throw error ?? new Error("no user");
  created.push(data.user.id);

  await admin
    .from("profiles")
    .update({
      skill_tier: tier,
      rating: 1000,
      primary_leak_key: "overfolds_bb",
      // Every QUESTION_ID must be present, or the diagnosis page sends them
      // back to /onboarding — a partial diagnosis reads as broken.
      onboarding: {
        venue: "live_1_2",
        pain: "bleeding_blinds",
        frequency: "weekly",
        goal: "beat_friends",
        study: tier,
        leaks: ["overfolds_bb"],
        minutes: "15",
        hand: "",
        derived: { skillTier: tier, primaryLeakKey: "overfolds_bb", rating: 1000 },
        completedAt: new Date().toISOString(),
      },
    })
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

test.describe("the demo hand", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.from("drill_attempts").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("an UNPAID user can play exactly one hand", async ({ page }) => {
    // The abuse surface, stated plainly: this route is reachable without a
    // subscription by design, so "exactly one" has to hold against a client
    // that just asks again.
    const user = await makeQuizzedUser();
    await login(page, user.email);

    const first = await page.request.post("/api/onboarding/hand");
    expect(first.status(), "an unpaid user must be able to play one").toBe(200);

    const dealt = (await first.json()) as {
      spotId: string;
      spot: { legalActions: string[] };
    };
    expect(dealt.spot.legalActions.length).toBeGreaterThan(1);

    // Answering it burns it.
    const answered = await page.request.post("/api/onboarding/hand/answer", {
      data: { spotId: dealt.spotId, action: dealt.spot.legalActions[0], timeMs: 4_000 },
    });
    expect(answered.status()).toBe(200);

    // A second deal is refused — this is the free-access hole if it is not.
    const second = await page.request.post("/api/onboarding/hand");
    expect(second.status(), "a second hand would be free access to the product").toBe(409);

    // And a second answer is refused too.
    const twice = await page.request.post("/api/onboarding/hand/answer", {
      data: { spotId: dealt.spotId, action: dealt.spot.legalActions[0], timeMs: 4_000 },
    });
    expect(twice.status()).toBe(409);
  });

  test("the dealt spot leaks no solution data", async ({ page }) => {
    // Same contract as the paid drill route. An unpaid surface is the last
    // place to relax it.
    const user = await makeQuizzedUser();
    await login(page, user.email);

    const response = await page.request.post("/api/onboarding/hand");
    const raw = await response.text();

    for (const forbidden of ['"strategy"', '"nodeRef"', '"ev"', '"bestAction"', '"frequencies"']) {
      expect(raw, `the deal payload carries ${forbidden}`).not.toContain(forbidden);
    }
  });

  test("refuses to grade a PAID drill spot through the unpaid route", async ({ page }) => {
    // Otherwise the demo route becomes a free grader for the whole product.
    const user = await makeQuizzedUser();
    await login(page, user.email);

    const response = await page.request.post("/api/onboarding/hand/answer", {
      data: { spotId: "00000000-0000-0000-0000-000000000000", action: "fold", timeMs: 1000 },
    });
    expect([400, 404]).toContain(response.status());
  });

  test("refreshing deals the SAME hand, not a new one", async ({ page }) => {
    const user = await makeQuizzedUser();
    await login(page, user.email);

    const a = (await (await page.request.post("/api/onboarding/hand")).json()) as {
      spot: { heroCards: number[]; heroPos: string };
    };
    const b = (await (await page.request.post("/api/onboarding/hand")).json()) as {
      spot: { heroCards: number[]; heroPos: string };
    };

    // Deterministic in the user id — otherwise the hand is shoppable.
    expect(b.spot.heroCards).toEqual(a.spot.heroCards);
    expect(b.spot.heroPos).toBe(a.spot.heroPos);
  });

  test("THE CARRY-FORWARD — the diagnosis opens with the hand actually played", async ({
    page,
  }) => {
    const user = await makeQuizzedUser();
    await login(page, user.email);

    const dealt = (await (await page.request.post("/api/onboarding/hand")).json()) as {
      spotId: string;
      spot: { legalActions: string[] };
    };
    const action = dealt.spot.legalActions[0]!;

    await page.request.post("/api/onboarding/hand/answer", {
      data: { spotId: dealt.spotId, action, timeMs: 5_000 },
    });

    // What was stored is what the diagnosis must say.
    const { data: row } = await admin
      .from("profiles")
      .select("onboarding")
      .eq("id", user.id)
      .single();

    const stored = (row!.onboarding as { demoHand?: Record<string, unknown> }).demoHand;
    expect(stored, "the hand was never persisted").toBeDefined();

    await page.goto("/diagnosis");
    // The reveal is stage-delayed opacity (7.2); Playwright counts opacity 0 as
    // visible, so wait it out rather than trusting the selector.
    await page.waitForTimeout(3_500);

    const headline = await page.locator("[data-demo-headline]").innerText();
    const detail = await page.locator("[data-demo-detail]").innerText();

    // Specific about what they did — not a horoscope.
    expect(headline).toContain(String(stored!.handKey));
    expect(headline.toLowerCase()).toContain(pastTense(String(stored!.chosenAction)));

    // And the numbers match the record exactly.
    const percent = Math.round(Number(stored!.topFreq) * 100);
    expect(detail).toContain(`${percent}%`);
    if (Number(stored!.evLoss) > 0) {
      expect(detail).toContain(`${Number(stored!.evLoss).toFixed(1)}bb`);
    }

    console.log(`\n  DIAGNOSIS OPENS WITH:\n    ${headline}\n    ${detail}\n`);

    /*
     * The demo must never be a PURE spot. A first version shipped saying "a
     * solver raises it 100% of the time", which demonstrates a right/wrong app
     * — the thing this whole screen exists to disprove.
     */
    expect(Number(stored!.topFreq), "the demo served a pure spot").toBeLessThanOrEqual(0.8);
    expect(detail, "the demo served a pure spot").not.toContain("100% of the time");

    // And it reads as English.
    expect(detail).not.toMatch(/that (folded|called|raised|checked|shoved) costs/);

    // Rule 5, on the highest-traffic pre-purchase screen in the product.
    expect(`${headline} ${detail}`).not.toMatch(/\$/);
  });

  test("the diagnosis still renders for someone who never played a hand", async ({ page }) => {
    // A user who dropped out mid-funnel and came back. The screen degrades to
    // the questionnaire-only version rather than breaking.
    const user = await makeQuizzedUser();
    await login(page, user.email);

    await page.goto("/diagnosis");
    await page.waitForTimeout(3_500);

    await expect(page.locator("[data-demo-hand]")).toHaveCount(0);
    // The questionnaire diagnosis is still there (rating + path).
    await expect(page.getByText(/Where you stand/i)).toBeVisible();
    await expect(page.locator("[data-path]")).toBeVisible();
  });

  test("the whole screen fits the funnel budget", async ({ page }) => {
    const user = await makeQuizzedUser();
    await login(page, user.email);

    const startedAt = Date.now();
    await page.goto("/onboarding/hand");
    await page.getByTestId("deal-me-in").click();
    await page.waitForSelector("[data-action]", { timeout: 30_000 });
    await page.locator("[data-action]").first().click();
    await page.getByRole("button", { name: /See what this says/i }).waitFor({ timeout: 25_000 });
    const elapsed = (Date.now() - startedAt) / 1000;

    console.log(`  demo hand added ${elapsed.toFixed(1)}s to the funnel (budget 45s)`);
    expect(elapsed, "the demo hand costs more than its 45s budget").toBeLessThan(45);
  });
});

function pastTense(action: string): string {
  const map: Record<string, string> = {
    fold: "folded",
    call: "called",
    raise: "raised",
    check: "checked",
    bet: "bet",
    allin: "shoved",
  };
  return map[action] ?? action;
}
