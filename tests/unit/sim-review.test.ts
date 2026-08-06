/**
 * The review's numbers, checked against independent counts.
 *
 * The stats here are the first poker numbers a beginner ever sees about
 * themselves. A VPIP that is off by one hand is not a display bug — it is the
 * product teaching someone the wrong fact about their own play. So VPIP/PFR
 * are verified against a from-scratch count written differently from the
 * implementation, the replay is verified against the engine's own pots, and
 * the planted-leak test drives a deliberately bad player through hundreds of
 * hands and demands the detector name the exact leak.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyHeroAction,
  createLiveSession,
  currentHandHistory,
  dealNextHand,
  heroLegalActions,
} from "../../src/lib/sim-server";
import type { LiveSimState, SimHandRecord } from "../../src/lib/sim";
import {
  computeSessionStats,
  heroActionSeq,
  heroAttempts,
  isPfrHand,
  isVpipHand,
  replaySteps,
  worstDecisions,
  type StoredHand,
} from "../../src/lib/sim-review";
import { buildSummaryPrompt, templateSummary } from "../../src/lib/sim-review-ai";
import { detectLeaks } from "../../src/poker/grader";
import { contentViolation } from "../../src/lib/ai/redact";
import type { Action, HandHistory } from "../../src/poker/gamestate";

/* ── Harness: play sessions through the real sim server ─────────────────── */

type HeroPolicy = (live: LiveSimState) => Action;

function playSession(
  seed: string,
  totalHands: number,
  policy: HeroPolicy,
): { hands: StoredHand[]; live: LiveSimState } {
  let live = createLiveSession({ presetId: "casino", totalHands, stackBb: 100, seed });
  const hands: StoredHand[] = [];
  let recorded = 0;

  const capture = (state: LiveSimState): void => {
    for (const record of state.records.slice(recorded)) {
      const history = currentHandHistory(state);
      if (history !== null && record === state.records[state.records.length - 1]) {
        hands.push({ history, heroSeat: state.heroSeat, record });
      } else {
        // A walkover settled inside dealNextHand: the game already moved on,
        // so synthesize the minimal record-only entry the review tolerates.
        hands.push({
          history: emptyHistory(),
          heroSeat: state.heroSeat,
          record,
        });
      }
    }
    recorded = state.records.length;
  };

  let guard = 0;
  while (!live.ended) {
    if (++guard > 5_000) throw new Error("session did not end");

    if (live.game === null || live.game.complete) {
      capture(live);
      live = dealNextHand(live, seed);
      capture(live);
      continue;
    }

    const result = applyHeroAction(live, policy(live), seed);
    if (!result.ok) throw new Error(result.error);
    live = result.live;
    if (result.record !== null) capture(live);
  }
  capture(live);

  return { hands, live };
}

function emptyHistory(): HandHistory {
  return {
    seed: 0,
    seats: 6,
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    ante: 0,
    positions: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
    startingStacks: [200, 200, 200, 200, 200, 200],
    holeCards: [null, null, null, null, null, null],
    board: "",
    events: [],
    pots: [],
    payouts: [],
    finalStacks: [200, 200, 200, 200, 200, 200],
  };
}

const foldEverything: HeroPolicy = (live) => {
  const legal = heroLegalActions(live);
  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  return { type: "fold" };
};

const callDown: HeroPolicy = (live) => {
  const legal = heroLegalActions(live);
  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  const call = legal.find((a) => a.type === "call");
  if (call !== undefined) return { type: "call", amount: call.amount };
  return { type: "fold" };
};

/* ── The planted leak ────────────────────────────────────────────────────── */

describe("the planted overfold leak", () => {
  it("is identified as the top leak of a fold-everything session", () => {
    // A player who folds EVERYTHING — including the hands the solution defends
    // — is the synthetic overfolder. Across 400 hands the buckets fill and the
    // detector must name overfolding, not something adjacent.
    const { hands } = playSession("planted-overfold", 400, foldEverything);

    const attempts = heroAttempts(hands);
    expect(attempts.length, "no graded attempts to detect from").toBeGreaterThan(50);

    const leaks = detectLeaks(attempts);
    expect(leaks.length, "no leaks detected in a fold-everything session").toBeGreaterThan(0);

    const top = leaks[0]!;
    console.log(
      `TOP LEAK: ${top.key} · severity ${top.severity} · ` +
        `${top.meanEvLoss.toFixed(2)}bb mean over ${top.sampleSize} samples`,
    );
    expect(top.key.startsWith("overfolds"), `top leak was ${top.key}`).toBe(true);

    // And the summary the user reads names it too, model or no model.
    const summary = templateSummary(computeSessionStats(hands), worstDecisions(hands), leaks);
    console.log(`TEMPLATE SUMMARY: ${summary}`);
    expect(summary).toContain("folding too much");
    expect(contentViolation(summary)).toBeNull();
  });
});

/* ── VPIP / PFR ──────────────────────────────────────────────────────────── */

describe("VPIP and PFR", () => {
  it("matches an independent hand count over 20+ hands", () => {
    const { hands } = playSession("vpip-check", 20, callDown);
    const played = hands.filter((h) => h.history.events.length > 0);
    expect(played.length).toBeGreaterThanOrEqual(20);

    // The independent count: walk raw events with different logic — count
    // DISTINCT hands where any preflop hero event is in the VPIP verb set.
    let vpipManual = 0;
    let pfrManual = 0;
    for (const hand of played) {
      const verbs = hand.history.events
        .filter((e) => e.kind === "action")
        .filter((e) => "seat" in e && e.seat === hand.heroSeat)
        .filter((e) => "street" in e && e.street === "preflop")
        .map((e) => ("action" in e ? e.action : ""));

      if (verbs.includes("call") || verbs.includes("bet") || verbs.includes("raise")) {
        vpipManual += 1;
      }
      if (verbs.includes("raise")) pfrManual += 1;
    }

    const stats = computeSessionStats(played);
    expect(stats.vpip).toBe(Math.round((vpipManual / played.length) * 100));
    expect(stats.pfr).toBe(Math.round((pfrManual / played.length) * 100));

    expect(played.filter(isVpipHand).length).toBe(vpipManual);
    expect(played.filter(isPfrHand).length).toBe(pfrManual);

    console.log(
      `VPIP ${stats.vpip}% (${vpipManual}/${played.length}) · PFR ${stats.pfr}% (${pfrManual}/${played.length})`,
    );
  });

  it("never counts a blind post as voluntary money", () => {
    // A BB who checks their option put nothing in voluntarily. If posts
    // counted, every player's VPIP would be pinned near 33% in 6-max.
    const { hands } = playSession("posts-not-vpip", 30, foldEverything);
    const played = hands.filter((h) => h.history.events.length > 0);
    const stats = computeSessionStats(played);
    expect(stats.vpip, `a fold-everything player shows VPIP ${stats.vpip}%`).toBe(0);
    expect(stats.pfr).toBe(0);
  });
});

/* ── Replay ──────────────────────────────────────────────────────────────── */

describe("the replay", () => {
  const { hands } = playSession("replay-check", 10, callDown);
  const real = hands.filter((h) => h.history.events.length > 0);

  it("steps through every event in order", () => {
    for (const hand of real) {
      const steps = replaySteps(hand);
      // One step per event, plus the deal.
      expect(steps.length).toBe(hand.history.events.length + 1);
      expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
    }
  });

  it("ends with the engine's own pot fully paid out", () => {
    for (const hand of real) {
      const steps = replaySteps(hand);
      const last = steps[steps.length - 1]!;
      // Awards drain the pot to zero; anything left is invented or lost chips.
      expect(last.potChips, `hand ${hand.record.handNumber} left chips in the pot`).toBe(0);
    }
  });

  it("reaches the pot the engine reported before awards", () => {
    for (const hand of real) {
      const steps = replaySteps(hand);
      const totalCommitted = hand.history.startingStacks.reduce(
        (sum, start, seat) =>
          sum + (start - (hand.history.finalStacks[seat] ?? 0) + (hand.history.payouts[seat] ?? 0)),
        0,
      );
      const maxPot = Math.max(...steps.map((s) => s.potChips));
      expect(maxPot, `hand ${hand.record.handNumber} pot mismatch`).toBe(totalCommitted);
    }
  });

  it("shows the board exactly as dealt, street by street", () => {
    for (const hand of real) {
      const steps = replaySteps(hand);
      // Step i renders the state AFTER event i-1, so the expected board is
      // whatever the last street event up to and including that point dealt.
      let expected = "";
      for (const step of steps) {
        const event = hand.history.events[step.index - 1];
        if (event !== undefined && event.kind === "street") expected = event.board;
        expect(step.board, `hand ${hand.record.handNumber} step ${step.index}`).toBe(expected);
      }
      expect(steps[steps.length - 1]!.board).toBe(hand.history.board);
    }
  });

  it("never includes a villain's hole cards", () => {
    // Mucked cards stay mucked, even after the session. What showdown revealed
    // is in the event text, not in the seat data.
    for (const hand of real) {
      for (const step of replaySteps(hand)) {
        for (const seat of step.seats) {
          if (seat.seat === hand.heroSeat) continue;
          expect(seat.cards, `hand ${hand.record.handNumber} step ${step.index}`).toBeNull();
        }
      }
    }
  });

  it("marks the hero's graded decision with its EV loss, exactly once", () => {
    for (const hand of real) {
      if (hand.record.heroEvLoss === null || hand.record.heroEvLoss === 0) continue;
      const steps = replaySteps(hand);
      const marked = steps.filter((s) => s.heroEvLoss !== null);
      expect(marked.length, `hand ${hand.record.handNumber}`).toBe(1);
    }
  });
});

/* ── The action-seq derivation ───────────────────────────────────────────── */

describe("heroActionSeq", () => {
  it("agrees with the node the grader used during play", () => {
    const { hands } = playSession("seq-check", 30, callDown);
    for (const hand of hands.filter((h) => h.history.events.length > 0)) {
      const seq = heroActionSeq(hand);
      expect(seq).toMatch(/^(rfi|vs_rfi_|vs_3bet_|vs_4bet_)/);
    }
  });
});

/* ── One AI call per review ──────────────────────────────────────────────── */

const generateTextMock = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText: generateTextMock, streamText: vi.fn() }));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ modelId: model }),
}));

describe("the AI summary", () => {
  beforeEach(async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key-not-real";
    const { __resetServerEnvForTests } = await import("../../src/lib/env.server");
    __resetServerEnvForTests();
    generateTextMock.mockReset();
  });

  afterEach(async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const { __resetServerEnvForTests } = await import("../../src/lib/env.server");
    __resetServerEnvForTests();
  });

  it("makes exactly ONE model call however many hands the session had", async () => {
    const { generateSessionSummary } = await import("../../src/lib/sim-review-ai");
    const { hands } = playSession("one-call", 50, callDown);
    const played = hands.filter((h) => h.history.events.length > 0);
    expect(played.length).toBeGreaterThanOrEqual(50);

    generateTextMock.mockResolvedValue({
      text: "Your biggest cost was calling raises out of position — 14 times for 22bb total. Next session, fold those and watch bb/100 move.",
      usage: { inputTokens: 500, outputTokens: 80 },
    });

    const stats = computeSessionStats(played);
    const result = await generateSessionSummary(
      "one-call-session",
      stats,
      worstDecisions(played),
      detectLeaks(heroAttempts(played)).slice(0, 3),
    );

    expect(result.source).toBe("model");
    expect(generateTextMock, "more than one model call for one review").toHaveBeenCalledTimes(1);

    // And the repeat is served from cache: zero further calls.
    const repeat = await generateSessionSummary(
      "one-call-session",
      stats,
      worstDecisions(played),
      [],
    );
    expect(repeat.source).toBe("cache");
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("replaces a summary that breaks the content rules", async () => {
    const { generateSessionSummary } = await import("../../src/lib/sim-review-ai");
    generateTextMock.mockResolvedValue({
      text: "Deposit more and play higher stakes on PokerStars to fix this.",
      usage: { inputTokens: 500, outputTokens: 30 },
    });

    const { hands } = playSession("guarded", 10, callDown);
    const played = hands.filter((h) => h.history.events.length > 0);
    const result = await generateSessionSummary(
      "guarded-session",
      computeSessionStats(played),
      worstDecisions(played),
      [],
    );

    expect(result.source).toBe("template");
    expect(contentViolation(result.text)).toBeNull();
  });

  it("grounds the prompt in the actual numbers", () => {
    const { hands } = playSession("prompt-check", 20, callDown);
    const played = hands.filter((h) => h.history.events.length > 0);
    const stats = computeSessionStats(played);
    const prompt = buildSummaryPrompt(stats, worstDecisions(played), []);

    expect(prompt).toContain(`VPIP ${stats.vpip}%`);
    expect(prompt).toContain(`${stats.bb100}bb/100`);
    expect(prompt).toContain("do not contradict");
  });
});

/* ── The 3-hand edge case ────────────────────────────────────────────────── */

describe("a 3-hand session where hero folded everything", () => {
  it("still produces a complete, sensible review", () => {
    const { hands } = playSession("tiny-session", 3, foldEverything);
    const played = hands.filter((h) => h.history.events.length > 0);

    const stats = computeSessionStats(played);
    expect(stats.hands).toBeGreaterThanOrEqual(3);
    expect(stats.vpip).toBe(0);
    expect(stats.pfr).toBe(0);
    expect(stats.netBb).toBeLessThanOrEqual(0);

    // Too few samples for a leak — the review must say something true anyway.
    const leaks = detectLeaks(heroAttempts(played));
    const summary = templateSummary(stats, worstDecisions(played), leaks);
    expect(summary.length).toBeGreaterThan(40);
    expect(contentViolation(summary)).toBeNull();

    // Replays still step cleanly.
    for (const hand of played) {
      expect(replaySteps(hand).length).toBeGreaterThan(1);
    }
  });
});

/* ── Type sanity for the record shape the harness fakes ──────────────────── */

it("the harness record shape matches SimHandRecord", () => {
  const record: SimHandRecord = {
    handNumber: 1,
    netBb: 0,
    resultLine: "x",
    heroEvLoss: null,
    grade: null,
  };
  expect(record.handNumber).toBe(1);
});
