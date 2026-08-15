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
 * the paywall must open with the hand actually played, with numbers matching
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
      // Every QUESTION_ID must be present, or the plan band is withheld —
      // a half-answered questionnaire would have to guess at a plan.
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

  test("THE FIXED HAND — every tier is dealt T9o in the big blind vs a button open", async ({
    page,
  }) => {
    /*
     * The hand is fixed so the words under it can be WRITTEN rather than
     * generated. If tier selection ever crept back in, the verdict copy would
     * start describing a hand nobody was dealt — and it would still render,
     * because nothing about a wrong explanation looks like an error.
     */
    for (const tier of ["never", "videos", "charts", "solver"]) {
      const user = await makeQuizzedUser(tier);
      // A signed-in visitor to /login is redirected straight back out, so the
      // second iteration would wait forever on an email field that never
      // renders. Each tier needs a clean session.
      await page.context().clearCookies();
      await login(page, user.email);

      const dealt = (await (await page.request.post("/api/onboarding/hand")).json()) as {
        spot: { heroPos: string; actionHistory: string[] };
        scripted?: boolean;
      };

      expect(dealt.scripted, `${tier} was not served the scripted hand`).toBe(true);
      expect(dealt.spot.heroPos, tier).toBe("BB");
      expect(dealt.spot.actionHistory.join(" "), tier).toContain("BTN opens");
    }
  });

  test("THE MINI CHAT answers in writing, and never leaks the strategy early", async ({ page }) => {
    const user = await makeQuizzedUser();
    await login(page, user.email);

    await page.goto("/onboarding/hand");
    await page.getByTestId("deal-me-in").click();
    await page.locator("[data-action]").first().waitFor({ timeout: 30_000 });

    /*
     * BEFORE answering, the page must not contain the verdict for any action.
     * The written table names which line the solver never takes, so shipping
     * the whole table to the client would hand over the answer — the same leak
     * the drill payload exists to prevent, reintroduced as copy.
     */
    const beforeAnswer = await page.content();
    expect(beforeAnswer).not.toContain("Raising is the one thing this hand");
    expect(beforeAnswer).not.toContain("four times out of five");

    await page.locator("[data-action='fold']").click();
    await expect(page.locator("[data-demo-coach]")).toBeVisible({ timeout: 30_000 });

    // The verdict is the one for what they actually pressed.
    await expect(page.locator("[data-verdict-headline]")).toContainText("Folding is fine");

    // A written question, answered from the written table.
    await page.locator("[data-chat-chip='why-not-always']").click();
    const answer = page.locator("[data-chat-answer]").first();
    await expect(answer).toBeVisible();
    await expect(answer).toHaveAttribute("data-matched", "true");

    // Anything off-topic falls back rather than inventing.
    await page.locator("[data-chat-input]").fill("what stakes should I play?");
    await page.getByRole("button", { name: "Ask" }).click();
    const last = page.locator("[data-chat-answer]").last();
    await expect(last).toHaveAttribute("data-matched", "false");

    const texts = await page.locator("[data-chat-answer]").allInnerTexts();
    console.log(`\n  DEMO CHAT:\n${texts.map((t) => `    - ${t}`).join("\n")}\n`);

    // Rule 5 holds on the unpaid surface too.
    for (const text of texts) expect(text).not.toMatch(/\$/);
  });

  test("THE RECORD — the hand played is persisted, and it is never a pure spot", async ({
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

    const { data: row } = await admin
      .from("profiles")
      .select("onboarding")
      .eq("id", user.id)
      .single();

    const stored = (row!.onboarding as { demoHand?: Record<string, unknown> }).demoHand;
    expect(stored, "the hand was never persisted").toBeDefined();
    expect(String(stored!.chosenAction)).toBe(action);

    /*
     * The paywall no longer RENDERS this record — the "hand you just played"
     * recap was removed from the plan band. The record itself still has to be
     * right: it is what proves the graded hand happened, and it is one prop
     * away from being shown again.
     *
     * The demo must never be a PURE spot. A first version shipped saying "a
     * solver raises it 100% of the time", which demonstrates a right/wrong app
     * — the thing the demo hand exists to disprove.
     */
    expect(Number(stored!.topFreq), "the demo served a pure spot").toBeLessThanOrEqual(0.8);

    console.log(
      `\n  STORED: ${String(stored!.handKey)} · ${String(stored!.chosenAction)} · topFreq ${String(stored!.topFreq)}\n`,
    );
  });

  test("the plan band still renders for someone who never played a hand", async ({ page }) => {
    // A user who dropped out mid-funnel and came back. The band degrades to
    // the questionnaire-only version rather than breaking.
    const user = await makeQuizzedUser();
    await login(page, user.email);

    await page.goto("/paywall");

    // The questionnaire half is still there.
    // The plan band was removed; the showcase is what the paywall opens with now.
    await expect(page.locator("[data-showcase]")).toBeVisible();
  });

  test("the whole screen fits the funnel budget", async ({ page }) => {
    const user = await makeQuizzedUser();
    await login(page, user.email);

    const startedAt = Date.now();
    await page.goto("/onboarding/hand");
    await page.getByTestId("deal-me-in").click();
    await page.waitForSelector("[data-action]", { timeout: 30_000 });
    await page.locator("[data-action]").first().click();
    /*
     * The real CTA, which is grade-dependent — `demoOutroCta()` returns "See my
     * plan →" when they found the line and "See how to fix it →" when they did
     * not. This waited on `DEMO_OUTRO_CTA`, a constant nothing had rendered
     * since the diagnosis page was removed, so the test could only ever time
     * out. `tests/unit/e2e-selectors.test.ts` did not catch it because it scans
     * string names and this one was a regex.
     */
    await page
      .getByRole("button", { name: /See my plan|See how to fix it/i })
      .waitFor({ timeout: 25_000 });
    const elapsed = (Date.now() - startedAt) / 1000;

    console.log(`  demo hand added ${elapsed.toFixed(1)}s to the funnel (budget 45s)`);
    expect(elapsed, "the demo hand costs more than its 45s budget").toBeLessThan(45);
  });
});
