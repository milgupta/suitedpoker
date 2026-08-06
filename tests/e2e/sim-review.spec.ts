import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The review over real HTTP: a short session is actually played, then the
 * review must be theirs — computed stats, replays without villain cards, and
 * a summary that exists whether or not a model is configured.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+rev${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

interface SimState {
  sessionId: string;
  version: number;
  handComplete: boolean;
  sessionComplete: boolean;
  legalActions: { type: string; amount?: number }[];
}

/** Plays a 3-hand session to the end, folding everything. */
async function playTinySession(request: APIRequestContext): Promise<string> {
  const started = await request.post("/api/sim/start", {
    data: { preset: "cardroom", hands: 25 },
  });
  let state = ((await started.json()) as { state: SimState }).state;
  const sessionId = state.sessionId;

  // Three hands is enough for the review; the session need not be complete.
  for (let hand = 0; hand < 3; hand++) {
    let guard = 0;
    while (!state.handComplete) {
      if (++guard > 30) throw new Error("hand did not complete");
      const check = state.legalActions.find((a) => a.type === "check");
      const response = await request.post("/api/sim/action", {
        data: {
          sessionId,
          version: state.version,
          action: check !== undefined ? { type: "check" } : { type: "fold" },
        },
      });
      state = ((await response.json()) as { state: SimState }).state;
    }
    const dealt = await request.post("/api/sim/next", {
      data: { sessionId, version: state.version },
    });
    state = ((await dealt.json()) as { state: SimState }).state;
  }

  return sessionId;
}

test.describe("session review", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("computes the review from the played hands, with no villain cards", async ({ page }) => {
    const { email } = await makeEntitledUser("api");
    await login(page, email);
    const sessionId = await playTinySession(page.request);

    const response = await page.request.get(`/api/sim/review?sessionId=${sessionId}`);
    expect(response.status()).toBe(200);
    const raw = await response.text();
    const review = JSON.parse(raw) as {
      stats: { hands: number; vpip: number; pfr: number };
      summary: { text: string; source: string };
      replays: Record<string, { seats: { seat: number; cards: string | null }[] }[]>;
    };

    console.log(
      `REVIEW: ${review.stats.hands} hands · VPIP ${review.stats.vpip}% · ` +
        `summary (${review.summary.source}): ${review.summary.text}`,
    );

    expect(review.stats.hands).toBeGreaterThanOrEqual(3);
    // A fold-everything session: VPIP 0 is the honest number.
    expect(review.stats.vpip).toBe(0);
    expect(review.summary.text.length).toBeGreaterThan(40);

    // Mucked cards stay mucked, even in the review payload.
    for (const steps of Object.values(review.replays)) {
      for (const step of steps) {
        for (const seat of step.seats) {
          if (seat.seat === 0) continue; // hero
          expect(seat.cards, "a villain's cards reached the review").toBeNull();
        }
      }
    }
    expect(raw).not.toContain('"deck"');
  });

  test("SECURITY — another user's review is unreachable", async ({ page, browser }) => {
    const owner = await makeEntitledUser("owner");
    await login(page, owner.email);
    const sessionId = await playTinySession(page.request);

    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();
    const attacker = await makeEntitledUser("attacker");
    await login(attackerPage, attacker.email);

    const stolen = await attackerPage.request.get(`/api/sim/review?sessionId=${sessionId}`);
    expect(stolen.status()).toBe(404);
    await attackerContext.close();
  });

  test("the review page renders the stats and a replay steps forward", async ({ page }) => {
    const { email } = await makeEntitledUser("ui");
    await login(page, email);
    const sessionId = await playTinySession(page.request);

    await page.goto(`/table/review?session=${sessionId}`);

    await expect(page.getByRole("heading", { name: "Session review" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("VPIP", { exact: true })).toBeVisible();
    await expect(page.locator("[data-summary]")).toBeVisible();

    // If any decision was expensive enough to list, its replay must step.
    const first = page.locator("[data-review] button[aria-expanded]").first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      await expect(page.locator("[data-replay-step='0']")).toBeVisible();
      await page.getByRole("button", { name: "Next →" }).click();
      await expect(page.locator("[data-replay-step='1']")).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator("[data-replay-step='2']")).toBeVisible();
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator("[data-replay-step='1']")).toBeVisible();
    }
  });
});
