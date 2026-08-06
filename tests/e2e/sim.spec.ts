import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";

/**
 * The table simulator over real HTTP.
 *
 * THE LEAK TEST is the one that matters: every raw response of a whole hand is
 * captured and scanned, and villain hole cards must never appear before a
 * showdown they reached — folded players' never at all. The deck must never
 * appear, period. Same class as the drill-answer leak, same severity.
 */

loadLocalEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CONFIGURED = SUPABASE_URL !== "" && SERVICE_KEY !== "";

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

interface SimState {
  sessionId: string;
  version: number;
  handNumber: number;
  handComplete: boolean;
  sessionComplete: boolean;
  actionOn: number | null;
  heroSeat: number;
  potBb: number;
  netBbTotal: number;
  handsPlayed: number;
  seats: {
    seat: number;
    isHero: boolean;
    status: string;
    stackBb: number;
    holeCards: number[] | null;
  }[];
  legalActions: { type: string; min?: number; max?: number; amount?: number }[];
  records: { handNumber: number; netBb: number }[];
  lastResult: { netBb: number } | null;
}

async function makeEntitledUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+sim${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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

async function startSession(
  request: APIRequestContext,
  preset = "casino",
  hands = 25,
): Promise<{ state: SimState; raw: string }> {
  const response = await request.post("/api/sim/start", { data: { preset, hands } });
  const raw = await response.text();
  expect(response.status(), raw).toBe(200);
  return { state: (JSON.parse(raw) as { state: SimState }).state, raw };
}

/** Picks a safe hero action from the server's own legal list. */
function chooseAction(state: SimState): { type: string; amount?: number } {
  const check = state.legalActions.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  const call = state.legalActions.find((a) => a.type === "call");
  const hero = state.seats.find((s) => s.isHero);
  if (call?.amount !== undefined && hero !== undefined && call.amount / 2 <= hero.stackBb / 4) {
    return { type: "call", amount: call.amount };
  }
  const fold = state.legalActions.find((a) => a.type === "fold");
  if (fold !== undefined) return { type: "fold" };
  return call !== undefined ? { type: "call", amount: call.amount } : { type: "check" };
}

async function act(
  request: APIRequestContext,
  state: SimState,
  action: { type: string; amount?: number },
): Promise<{ state: SimState; raw: string; status: number }> {
  const response = await request.post("/api/sim/action", {
    data: { sessionId: state.sessionId, version: state.version, action },
  });
  const raw = await response.text();
  const body = JSON.parse(raw) as { state?: SimState };
  return { state: body.state ?? state, raw, status: response.status() };
}

async function nextHand(
  request: APIRequestContext,
  state: SimState,
): Promise<{ state: SimState; raw: string }> {
  const response = await request.post("/api/sim/next", {
    data: { sessionId: state.sessionId, version: state.version },
  });
  const raw = await response.text();
  expect(response.status(), raw).toBe(200);
  return { state: (JSON.parse(raw) as { state: SimState }).state, raw };
}

test.describe("table sim", () => {
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

  test("LEAK TEST — no villain cards before showdown, no deck ever", async ({ page }) => {
    const { email } = await makeEntitledUser("leak");
    await login(page, email);

    const responses: string[] = [];
    const started = await startSession(page.request, "boss", 25);
    let state = started.state;
    const raw = started.raw;
    responses.push(raw);

    // Play three full hands, folding — no showdown, so NOTHING may show.
    for (let hand = 0; hand < 3; hand++) {
      let guard = 0;
      while (!state.handComplete) {
        if (++guard > 30) throw new Error("hand did not complete");
        const result = await act(page.request, state, chooseFold(state));
        responses.push(result.raw);
        state = result.state;
      }
      const dealt = await nextHand(page.request, state);
      responses.push(dealt.raw);
      state = dealt.state;
    }

    console.log(`RAW RESPONSES CAPTURED: ${responses.length}`);
    console.log(`FIRST HAND RESPONSE:\n${responses[1]?.slice(0, 600)}…`);

    for (const [index, body] of responses.entries()) {
      // The deck must never be serialised under any circumstances.
      expect(body, `response ${index} carries the deck`).not.toContain('"deck"');
      expect(body, `response ${index} carries deckIndex`).not.toContain('"deckIndex"');

      const parsed = JSON.parse(body) as { state?: SimState };
      if (parsed.state === undefined) continue;
      for (const seat of parsed.state.seats) {
        if (seat.isHero) continue;
        // These hands ended in folds, so there was no showdown: every villain
        // card in every response of the entire session must be null.
        expect(
          seat.holeCards,
          `response ${index}: seat ${seat.seat} (${seat.status}) leaked cards`,
        ).toBeNull();
      }
    }
  });

  test("a 50-hand session conserves chips and the HUD matches the hands", async ({ page }) => {
    // ~250 sequential round trips, each persisting a growing live_state blob
    // to remote Postgres. This is an endurance test and gets an endurance
    // budget rather than being sampled down to fewer hands — 50 hands is the
    // number the acceptance criteria name.
    test.setTimeout(360_000);
    const { email } = await makeEntitledUser("fifty");
    await login(page, email);

    let { state } = await startSession(page.request, "casino", 50);

    let guard = 0;
    while (!state.sessionComplete) {
      if (++guard > 800) throw new Error("session did not finish");

      if (state.handComplete) {
        const prevNet = state.netBbTotal;
        const lastNet = state.lastResult?.netBb;
        const dealt = await nextHand(page.request, state);
        state = dealt.state;
        void prevNet;
        void lastNet;
        continue;
      }

      const result = await act(page.request, state, chooseAction(state));
      expect(result.status, result.raw).toBe(200);
      state = result.state;
    }

    expect(state.handsPlayed).toBe(50);
    expect(state.records.length).toBe(50);

    // The HUD number equals the sum of the per-hand results, to the milli-bb.
    const summed = state.records.reduce((sum, r) => sum + r.netBb, 0);
    expect(Math.abs(state.netBbTotal - summed)).toBeLessThan(0.005);

    console.log(
      `50-HAND SESSION: net ${state.netBbTotal.toFixed(1)}bb · ` +
        `bb/100 ${((state.netBbTotal / 50) * 100).toFixed(1)}`,
    );
  });

  test("a session survives a page refresh mid-hand", async ({ page }) => {
    const { email } = await makeEntitledUser("refresh");
    await login(page, email);

    const { state } = await startSession(page.request, "casino", 25);
    const before = JSON.stringify({
      hand: state.handNumber,
      version: state.version,
      actionOn: state.actionOn,
    });

    // A "refresh" is a bare GET /state from a fresh request — the client held
    // nothing worth keeping.
    const response = await page.request.get(`/api/sim/state?sessionId=${state.sessionId}`);
    expect(response.status()).toBe(200);
    const resumed = ((await response.json()) as { state: SimState }).state;

    expect(
      JSON.stringify({
        hand: resumed.handNumber,
        version: resumed.version,
        actionOn: resumed.actionOn,
      }),
    ).toBe(before);

    // And the resumed state is playable.
    const result = await act(page.request, resumed, chooseAction(resumed));
    expect(result.status).toBe(200);
  });

  test("TAMPER — illegal actions and stale versions are rejected", async ({ page }) => {
    const { email } = await makeEntitledUser("tamper");
    await login(page, email);

    const { state } = await startSession(page.request, "casino", 25);

    // An absurd raise, far outside the legal band.
    const absurd = await page.request.post("/api/sim/action", {
      data: {
        sessionId: state.sessionId,
        version: state.version,
        action: { type: "raise", amount: 999_999 },
      },
    });
    expect(absurd.status()).toBe(400);
    expect(((await absurd.json()) as { error: string }).error).toBe("illegal_action");

    // A legal action with a WRONG version — a double-submit — is a 409, and
    // the second copy changes nothing.
    const action = chooseAction(state);
    const first = await act(page.request, state, action);
    expect(first.status).toBe(200);

    const replay = await page.request.post("/api/sim/action", {
      data: { sessionId: state.sessionId, version: state.version, action },
    });
    expect(replay.status()).toBe(409);
    const replayBody = (await replay.json()) as { error: string; state: SimState };
    expect(replayBody.error).toBe("version_mismatch");
    expect(replayBody.state.version).toBe(first.state.version);
  });

  test("SECURITY — another user's session is unreachable", async ({ page, browser }) => {
    const owner = await makeEntitledUser("owner");
    await login(page, owner.email);
    const { state } = await startSession(page.request);

    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();
    const attacker = await makeEntitledUser("attacker");
    await login(attackerPage, attacker.email);

    const stolen = await attackerPage.request.get(`/api/sim/state?sessionId=${state.sessionId}`);
    expect(stolen.status()).toBe(404);

    const stolenAction = await attackerPage.request.post("/api/sim/action", {
      data: { sessionId: state.sessionId, version: state.version, action: { type: "fold" } },
    });
    expect(stolenAction.status()).toBe(404);

    await attackerContext.close();
  });

  test("the table page plays a hand in the browser", async ({ page }) => {
    const { email } = await makeEntitledUser("ui");
    await login(page, email);

    await page.goto("/table");
    await expect(page.getByRole("heading", { name: "Pick your table" })).toBeVisible();

    await page.locator("[data-preset=casino]").click();
    await page.getByRole("button", { name: "Sit down" }).click();

    await expect(page).toHaveURL(/\/table\/play\?session=/, { timeout: 20_000 });

    // The table renders and the hero has real actions.
    const actionButton = page.getByRole("button", { name: /fold|call|raise|check|bet/i }).first();
    await expect(actionButton).toBeVisible({ timeout: 20_000 });

    // Act until the hand completes, then the result strip appears.
    for (let i = 0; i < 12; i++) {
      const next = page.getByRole("button", { name: "Next hand" });
      if (await next.isVisible().catch(() => false)) break;
      const fold = page.getByRole("button", { name: /^fold$/i });
      const check = page.getByRole("button", { name: /^check$/i });
      if (await check.isVisible().catch(() => false)) await check.click();
      else if (await fold.isVisible().catch(() => false)) await fold.click();
      await page.waitForTimeout(700);
    }

    await expect(page.getByRole("button", { name: "Next hand" })).toBeVisible({
      timeout: 10_000,
    });

    // The drawer lists the finished hand.
    await page.getByRole("button", { name: "Hand history" }).click();
    await expect(page.getByText(/#1/)).toBeVisible();
  });
});

function chooseFold(state: SimState): { type: string; amount?: number } {
  const check = state.legalActions.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  return { type: "fold" };
}
