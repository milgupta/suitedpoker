/**
 * The governing principle, tested structurally.
 *
 * The AI never determines strategy. The prompt asks; `redact()` guarantees. So
 * these tests are mostly about the guard and the fallback — the parts that hold
 * even when the model misbehaves, which is the only kind of guarantee worth
 * having.
 *
 * The live adversarial run against Gemini is in tests/unit/coach-live.test.ts
 * and skips without a key.
 */

import { describe, expect, it } from "vitest";
import type { Grade } from "../../src/poker/grader";
import { redact, redactHint, templateExplanation } from "../../src/lib/ai/redact";
import { buildCoachContext } from "../../src/lib/ai/context";
import { costUsd, PRICE_PER_MILLION } from "../../src/lib/ai/client";
import { COACH_SYSTEM_PROMPT, HINT_INSTRUCTIONS, PROMPT_VERSION } from "../../src/lib/ai/prompts";

function makeGrade(overrides: Partial<Grade> = {}): Grade {
  return {
    grade: "inaccuracy",
    evLoss: 0.8,
    chosenEv: 1.2,
    bestEv: 2.0,
    bestAction: "raise",
    chosenAction: "call",
    frequencies: { raise: 0.71, call: 0.2, fold: 0.09 },
    displayMode: "clear",
    topAction: "raise",
    topFreq: 0.71,
    evGap: 0.8,
    alternativeActions: [{ action: "call", freq: 0.2, ev: 1.2, evLoss: 0.8 }],
    isBalancedAlternative: false,
    ...overrides,
  };
}

describe("the redact guard", () => {
  it("trips on a poisoned response that names a different best action", () => {
    // The exact failure the whole architecture exists to prevent.
    const poisoned = "Honestly, the correct play here is to fold — your hand is trash.";
    const result = redact(poisoned, makeGrade());

    expect(result.safe).toBe(false);
    expect(result.reason).toBe("contradicts_best_action");
    // And it must fall back to something TRUE, not to nothing.
    expect(result.text.toLowerCase()).toContain("raise");
  });

  it.each([
    ["real money", "In a real money game you'd want to deposit more first."],
    ["gambling advice", "Only play this if your bankroll can take the swings."],
    ["site reference", "On PokerStars this spot plays differently."],
    ["solver claim", "I solved this spot myself and got a different answer."],
    ["empty", "   "],
  ])("trips on %s", (_label, text) => {
    const result = redact(text, makeGrade());
    expect(result.safe).toBe(false);
    expect(result.text).not.toBe(text.trim());
  });

  it("ALLOWS mentioning another action without prescribing it", () => {
    // "folding is close here" is exactly what a mixed spot needs to say, and a
    // guard that blocked it would make the coach useless on the spots that
    // matter most.
    const fine =
      "Raising is best because your hand plays well against the calling range; folding is close but gives up too much.";
    expect(redact(fine, makeGrade()).safe).toBe(true);
  });

  it("does not trip on a mixed spot where two actions are genuinely correct", () => {
    const mixed = makeGrade({ displayMode: "mixed", frequencies: { raise: 0.52, call: 0.48 } });
    const text = "You should call about half the time here — both lines are part of the strategy.";
    expect(redact(text, mixed).safe).toBe(true);
  });

  it("returns the model's own text untouched when it is clean", () => {
    const clean = "Raising puts pressure on the blinds while your hand still has equity.";
    const result = redact(clean, makeGrade());
    expect(result.safe).toBe(true);
    expect(result.text).toBe(clean);
  });
});

describe("the template fallback", () => {
  it("states the ground truth for a clear spot", () => {
    // Default tier is `never` — the fallback obeys the same zero-jargon rule
    // the model does, because with no key it IS what the user reads.
    const novice = templateExplanation(makeGrade());
    expect(novice.toLowerCase()).toContain("raise");
    expect(novice).toContain("71%");
    expect(novice).toContain("0.80 big blinds");
    expect(novice).not.toContain("EV");

    const studied = templateExplanation(makeGrade(), "solver");
    expect(studied).toContain("highest-EV");
    expect(studied).toContain("1.6");
  });

  it("explains a mix as a mix rather than as an error", () => {
    const text = templateExplanation(
      makeGrade({ displayMode: "mixed", frequencies: { raise: 0.52, call: 0.48 } }),
    );
    expect(text.toLowerCase()).toContain("mix");
    expect(text).toContain("52%");
  });

  it("reassures on a balanced alternative rather than calling it a miss", () => {
    // Never let a balanced action feel like a near-miss.
    const text = templateExplanation(
      makeGrade({ isBalancedAlternative: true, displayMode: "preferred" }),
    );
    expect(text).toContain("real part of the strategy");
  });

  it("never contradicts its own ground truth", () => {
    for (const displayMode of ["clear", "preferred", "mixed"] as const) {
      const grade = makeGrade({ displayMode });
      const text = templateExplanation(grade);
      expect(redact(text, grade).safe, `template tripped its own guard: ${text}`).toBe(true);
    }
  });
});

describe("the hint guard", () => {
  it.each([1, 2] as const)("blocks level %i from naming ANY legal action", (level) => {
    // A hint fires BEFORE the user acts. Naming the action is handing over the
    // answer, which is the one thing a hint must not do.
    for (const leaked of ["You should fold here.", "Just call.", "Raising is fine."]) {
      const result = redactHint(leaked, level, ["fold", "call", "raise"]);
      expect(result.safe, `level ${level} allowed "${leaked}"`).toBe(false);
    }
  });

  it("allows level 3 to name the action category", () => {
    const result = redactHint("This is a checking hand.", 3, ["check", "bet"]);
    expect(result.safe).toBe(true);
  });

  it("allows a level 1 hint that points without evaluating", () => {
    const result = redactHint("Think about position — you act last on every remaining street.", 1, [
      "fold",
      "call",
      "raise",
    ]);
    expect(result.safe).toBe(true);
  });

  it("falls back to a level-appropriate hint rather than nothing", () => {
    const result = redactHint("You should fold.", 1, ["fold"]);
    expect(result.text.length).toBeGreaterThan(20);
    expect(result.text.toLowerCase()).not.toContain("fold");
  });
});

describe("the context block", () => {
  const context = buildCoachContext(
    {
      nodeRef: "BTN:rfi",
      handKey: "A5s",
      heroPos: "BTN",
      potBb: 1.5,
      effStackBb: 100,
      actionHistory: ["folded to BTN"],
    },
    makeGrade(),
    { skillTier: "never", leaks: ["blind_defense", "3bet_pots", "ignored"] },
  );

  it("supplies the full mix and the EV table as ground truth", () => {
    // The action names are written the way they are printed. The model echoes
    // the vocabulary it is handed, so a `raise_small` in the prompt comes back
    // out in the sentence the user reads.
    expect(context.text).toContain("Solver mix");
    expect(context.text).toContain("Raise 71%");
    expect(context.text).toContain("EVs:");
    expect(context.text).toContain("Best action: Raise");
  });

  it("tells the model when the spot is a genuine mix", () => {
    const mixed = buildCoachContext(
      {
        nodeRef: "n",
        handKey: "A5s",
        heroPos: "BTN",
        potBb: 1.5,
        effStackBb: 100,
        actionHistory: [],
      },
      makeGrade({ displayMode: "mixed" }),
      { skillTier: "never", leaks: [] },
    );
    expect(mixed.text).toContain("GENUINE MIX");
  });

  it("caps the leaks at two, because more is noise and costs tokens", () => {
    expect(context.text).toContain("blind_defense, 3bet_pots");
    expect(context.text).not.toContain("ignored");
  });

  it("stays well under the ~1200 token budget", () => {
    // Rough but conservative: ~4 characters per token.
    const approxTokens = context.text.length / 4;
    expect(approxTokens, `context is roughly ${Math.round(approxTokens)} tokens`).toBeLessThan(
      1200,
    );
  });
});

describe("the system prompt", () => {
  it("states the ground-truth rule before anything else", () => {
    expect(COACH_SYSTEM_PROMPT.indexOf("GROUND TRUTH")).toBeLessThan(200);
    expect(COACH_SYSTEM_PROMPT).toContain("Never contradict it");
  });

  it("forbids real money, gambling advice and named sites", () => {
    expect(COACH_SYSTEM_PROMPT).toContain("Never mention real-money play");
    expect(COACH_SYSTEM_PROMPT).toContain("bankroll");
    expect(COACH_SYSTEM_PROMPT.toLowerCase()).toContain("never claim to be a solver");
  });

  it("requires a mixed strategy to be explained as a mix", () => {
    expect(COACH_SYSTEM_PROMPT).toContain("explain WHY BOTH actions exist");
  });

  it("forbids levels 1 and 2 from naming an action", () => {
    expect(HINT_INSTRUCTIONS[1]).toContain("Do NOT name any action");
    expect(HINT_INSTRUCTIONS[2]).toContain("Do NOT name the best action");
  });

  it("is versioned, so a prompt change invalidates only its own cache", () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+$/);
  });
});

describe("graceful degradation", () => {
  it("returns a true explanation from the template when the model is not configured", async () => {
    // The drill loop is the product; the explanation is the enhancement. An AI
    // outage must cost fluency, never correctness or availability.
    const { explainDecision } = await import("../../src/lib/ai/coach");
    const grade = makeGrade();

    const result = await explainDecision(
      {
        nodeRef: "degradation:test",
        handKey: "A5s",
        heroPos: "BTN",
        potBb: 1.5,
        effStackBb: 100,
        actionHistory: [],
      },
      grade,
      { skillTier: "never", leaks: [] },
    );

    expect(result.source).toBe("template");
    expect(result.redactedFor).toBe("not_configured");
    expect(result.costUsd).toBe(0);
    expect(result.text.toLowerCase()).toContain(grade.bestAction);
    expect(redact(result.text, grade).safe).toBe(true);
  });
});

describe("cost", () => {
  /** Measured from the context builder above plus a 3-sentence answer. */
  const TYPICAL_INPUT = 420;
  const TYPICAL_OUTPUT = 70;

  it("prices an explanation from the published rates", () => {
    const perCall = costUsd(TYPICAL_INPUT, TYPICAL_OUTPUT);
    expect(perCall).toBeGreaterThan(0);
    expect(perCall).toBeLessThan(0.001);
  });

  it("projects the monthly bill at the plan's stated scale", () => {
    // 10,000 users x 50 drills/day x 30 days, at a 60% cache hit rate.
    const drillsPerMonth = 10_000 * 50 * 30;
    const misses = drillsPerMonth * 0.4;
    const monthly = misses * costUsd(TYPICAL_INPUT, TYPICAL_OUTPUT);

    console.log(
      `\nCOST PROJECTION (Gemini 2.0 Flash @ $${PRICE_PER_MILLION.input}/M in, $${PRICE_PER_MILLION.output}/M out)\n` +
        `  per explanation : $${costUsd(TYPICAL_INPUT, TYPICAL_OUTPUT).toFixed(6)} (${TYPICAL_INPUT} in / ${TYPICAL_OUTPUT} out)\n` +
        `  drills / month  : ${drillsPerMonth.toLocaleString()}\n` +
        `  cache hit rate  : 60%  ->  ${misses.toLocaleString()} model calls\n` +
        `  MONTHLY         : $${monthly.toFixed(2)}\n` +
        `  at 0% cache     : $${(drillsPerMonth * costUsd(TYPICAL_INPUT, TYPICAL_OUTPUT)).toFixed(2)}\n`,
    );

    // The number that matters: this must stay a rounding error against
    // 10,000 subscriptions, or the AI coach is not viable as a free inclusion.
    expect(monthly).toBeLessThan(2000);
  });
});
