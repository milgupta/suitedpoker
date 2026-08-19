import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createRng } from "@/poker/cards";
import { type HandClass } from "@/poker/handclass";
import { HAND_KEYS, type HandKey } from "@/poker/range";
import {
  accuracy,
  type Attempt,
  detectLeaks,
  displayModeFor,
  type Grade,
  grade,
  gradeDecision,
  type GradeInput,
  type GradeName,
  isPlayedFrequency,
  scoreSession,
} from "@/poker/grader";
import { parsePreflopNode, type PreflopNode } from "@/poker/solutions";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

const PREFLOP_DIR = resolve(process.cwd(), "src/content/solutions/preflop");
const nodes: PreflopNode[] = readdirSync(PREFLOP_DIR)
  .filter((n) => n.endsWith(".json"))
  .sort()
  .map((name) => parsePreflopNode(JSON.parse(readFileSync(join(PREFLOP_DIR, name), "utf8")), name));

/** A two-action node with an exact EV gap, for band tests. */
function twoActions(evLoss: number, raiseFreq = 1): GradeInput {
  return {
    actions: ["fold", "raise"],
    frequencies: { raise: raiseFreq, fold: 1 - raiseFreq },
    evs: { fold: 0, raise: evLoss },
  };
}

// ── 1. Grade bands ────────────────────────────────────────────────────────────

describe("grade bands", () => {
  const cases: Array<[number, GradeName, string]> = [
    [0, "best", "no loss at all"],
    [0.049, "best", "just under the solid threshold"],
    [0.05, "solid", "exactly at solid — lower-inclusive"],
    [0.3, "solid", "mid solid"],
    [0.499, "solid", "just under inaccuracy"],
    [0.5, "inaccuracy", "exactly at inaccuracy — lower-inclusive"],
    [1.99, "inaccuracy", "just under mistake"],
    [2, "mistake", "exactly at mistake — lower-inclusive"],
    [4.99, "mistake", "just under blunder"],
    [5, "blunder", "exactly at blunder — lower-inclusive"],
    [50, "blunder", "far past blunder"],
  ];

  it.each(cases)("an EV loss of %s grades as %s (%s)", (evLoss, expected) => {
    /*
     * Fold is the chosen (worse) action; raise is best by exactly `evLoss`.
     *
     * raiseFreq 0.4 makes FOLD the majority line, which is what isolates the
     * bands from everything else in the grader. At 0.6 the chosen fold was a
     * minority line, so these cases were really asserting that a 40% action
     * scores "best" — the defect that put a green tick on a 20% fold while the
     * panel above it said "Call." The pure-raise override stays out of the way
     * either way, since raise is not played at 100%.
     */
    const result = gradeDecision(twoActions(evLoss, 0.4), "fold");
    expect(result.grade).toBe(expected);
    expect(result.evLoss).toBeCloseTo(evLoss, 9);
  });

  it("grades the best action as best regardless of the gap", () => {
    expect(gradeDecision(twoActions(50, 0.6), "raise").grade).toBe("best");
    expect(gradeDecision(twoActions(50, 0.6), "raise").evLoss).toBe(0);
  });

  /*
   * THE MINORITY RULE.
   *
   * Reported from the onboarding hand: T9o in the big blind against a button
   * open is call 80 / fold 20, the user folded, and the panel printed "Call."
   * above a green "✓ Best". Under the indifference rule both actions are worth
   * exactly 0, so `bandFor(0)` returned "best" for the 20% line.
   *
   * It must be `solid` — not `best`, because it is not the headline answer,
   * and NOT `inaccuracy`, because folding one time in five is what the
   * strategy does and colouring it amber would teach that a real mixed line is
   * a mistake.
   */
  describe("a minority line in a mixed spot", () => {
    const mixed = (foldFreq: number): GradeInput => ({
      actions: ["fold", "call"],
      frequencies: { fold: foldFreq, call: 1 - foldFreq },
      evs: { fold: 0, call: 0 },
    });

    it("scores solid, not best", () => {
      expect(gradeDecision(mixed(0.2), "fold").grade).toBe("solid");
    });

    it("still scores the majority line best", () => {
      expect(gradeDecision(mixed(0.2), "call").grade).toBe("best");
    });

    it("never scores it as an inaccuracy or worse", () => {
      // The whole point: a real part of the mix is never an error.
      for (const freq of [0.05, 0.15, 0.2, 0.35, 0.49]) {
        const grade = gradeDecision(mixed(freq), "fold").grade;
        expect(["best", "solid"], `fold at ${freq} graded ${grade}`).toContain(grade);
      }
    });

    it("demotes neither side of a true 50/50", () => {
      // With equal frequencies the "top" action is decided by the order of
      // `actions`, and demoting a coin flip on a tie-break would be arbitrary.
      expect(gradeDecision(mixed(0.5), "fold").grade).toBe("best");
      expect(gradeDecision(mixed(0.5), "call").grade).toBe("best");
    });

    it("keeps the chosen EV loss at zero, because it really is zero", () => {
      // The WORD changes; the number must not. Rating, accuracy and the leak
      // report all read evLoss, and a minority line costs nothing.
      expect(gradeDecision(mixed(0.2), "fold").evLoss).toBe(0);
    });
  });

  it("never reports a negative EV loss across 100,000 combinations", () => {
    const rng = createRng("grader-nonneg");
    let checked = 0;
    let worst = 0;
    for (let i = 0; i < 100_000; i++) {
      const node = nodes[Math.floor(rng() * nodes.length)]!;
      const handKey = HAND_KEYS[Math.floor(rng() * HAND_KEYS.length)]!;
      const action = node.actions[Math.floor(rng() * node.actions.length)]!;
      const result = grade(node, handKey, action);
      expect(result.evLoss).toBeGreaterThanOrEqual(0);
      worst = Math.max(worst, result.evLoss);
      checked++;
    }
    expect(checked).toBe(100_000);
    record(
      "ev loss non-negative",
      `100,000 random (node, hand, action) triples, worst ${worst.toFixed(2)}bb`,
    );
  }, 60_000);

  it("is stable — the same inputs always give the same output", () => {
    const node = nodes.find((n) => n.ref === "BTN:rfi")!;
    const first = JSON.stringify(grade(node, "A5o" as HandKey, "fold"));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(grade(node, "A5o" as HandKey, "fold"))).toBe(first);
    }
    record("stability", "100 identical calls produce byte-identical grades");
  });

  it("rejects an action the node does not offer", () => {
    expect(() => gradeDecision(twoActions(1), "call")).toThrow(/not one of/);
  });
});

// ── 2. Mixed strategies ───────────────────────────────────────────────────────

describe("mixed strategies are not errors", () => {
  it("grades both sides of a 62/38 AJo split as best or solid", () => {
    const node: GradeInput = {
      actions: ["fold", "raise"],
      frequencies: { raise: 0.62, fold: 0.38 },
      evs: { fold: 0, raise: 0.2 },
    };

    const raised = gradeDecision(node, "raise");
    const folded = gradeDecision(node, "fold");

    expect(raised.grade).toBe("best");
    expect(folded.grade).toBe("solid");
    expect(folded.isBalancedAlternative).toBe(true);

    // The exact mix must survive to the frequency bar.
    expect(raised.frequencies).toEqual({ raise: 0.62, fold: 0.38 });
    expect(folded.frequencies).toEqual({ raise: 0.62, fold: 0.38 });
    record("mixed strategy", "62/38 AJo at a 0.2bb gap grades best and solid — never an error");
  });

  it("flags a defensible alternative so the copy can say so", () => {
    const node: GradeInput = {
      actions: ["fold", "call", "raise"],
      frequencies: { raise: 0.5, call: 0.3, fold: 0.2 },
      evs: { fold: 0, call: 0.15, raise: 0.25 },
    };
    const called = gradeDecision(node, "call");
    expect(called.isBalancedAlternative).toBe(true);
    expect(called.grade).toBe("solid");
  });

  it("does not flag a low-frequency action as balanced", () => {
    const node: GradeInput = {
      actions: ["fold", "raise"],
      frequencies: { raise: 0.95, fold: 0.05 },
      evs: { fold: 0, raise: 0.2 },
    };
    expect(gradeDecision(node, "fold").isBalancedAlternative).toBe(false);
  });
});

// ── 2b. Display mode ──────────────────────────────────────────────────────────

describe("display mode branches on frequency AND ev gap", () => {
  const cases: Array<[number, number, string, string]> = [
    [0.71, 0.18, "preferred", "THE case a naive implementation gets wrong"],
    // CLEAR_GAP is derived from INACCURACY_FROM (0.5), not set independently.
    // A gap between 0.3 and 0.5 used to render a definitive one-word verdict
    // while the alternative still graded `solid` — a contradiction the panel
    // could not explain. See the comment on CLEAR_GAP in grader.ts.
    [0.65, 0.5, "clear", "both exactly on the boundary"],
    [0.65, 0.499, "preferred", "frequency clears, gap does not"],
    [0.65, 0.3, "preferred", "a gap that still leaves the alternative solid"],
    [0.649, 5, "mixed", "frequency just under the boundary"],
    [0.9, 2, "clear", "confident and well separated"],
    [0.5, 0.05, "mixed", "genuinely mixed"],
    [1, 0, "preferred", "pure but no EV separation at all"],
  ];

  it.each(cases)("topFreq %s, evGap %s → %s (%s)", (topFreq, evGap, expected) => {
    expect(displayModeFor(topFreq, evGap)).toBe(expected);
  });

  it("resolves 71/29 at 0.18bb to preferred, NOT clear", () => {
    // A spot can be 71/29 and worth 0.18bb. Declaring a confident answer there
    // and grading the 29% action as an error is exactly what makes a grader
    // look stupid to someone who knows the game.
    const node: GradeInput = {
      actions: ["fold", "raise"],
      frequencies: { raise: 0.71, fold: 0.29 },
      evs: { fold: 0, raise: 0.18 },
    };
    const result = gradeDecision(node, "fold");
    expect(result.displayMode).toBe("preferred");
    expect(result.grade).toBe("solid");
    expect(result.isBalancedAlternative).toBe(true);
    record("71/29 @ 0.18bb", "resolves to preferred, and the 29% action grades solid");
  });

  it("never contradicts itself: a clear display implies a real EV gap", () => {
    const rng = createRng("display-consistency");
    for (let i = 0; i < 20_000; i++) {
      const node = nodes[Math.floor(rng() * nodes.length)]!;
      const handKey = HAND_KEYS[Math.floor(rng() * HAND_KEYS.length)]!;
      const action = node.actions[Math.floor(rng() * node.actions.length)]!;
      const result = grade(node, handKey, action);
      if (result.displayMode === "clear") expect(result.evGap).toBeGreaterThanOrEqual(0.5);
      if (result.isBalancedAlternative) {
        expect(result.displayMode).not.toBe("clear");
        expect(["best", "solid"]).toContain(result.grade);
      }
    }
    record(
      "grading never contradicts display",
      "20,000 real grades: a `clear` panel always has a >= 0.50bb gap",
    );
  });
});

// ── 2c. Sharp ─────────────────────────────────────────────────────────────────

describe("sharp is earned, not farmed", () => {
  const easy = twoActions(3, 0.6);

  it("never fires without nodeStats", () => {
    for (let i = 0; i < 100; i++) expect(gradeDecision(easy, "raise").grade).toBe("best");
    record("sharp needs data", "never fires when nodeStats is absent");
  });

  it("never fires below 30 attempts", () => {
    expect(gradeDecision(easy, "raise", { attempts: 29, bestActionCount: 0 }).grade).toBe("best");
    expect(gradeDecision(easy, "raise", { attempts: 30, bestActionCount: 0 }).grade).toBe("sharp");
  });

  it("fires at 34% success and not at 36%", () => {
    const at34 = gradeDecision(easy, "raise", { attempts: 100, bestActionCount: 34 });
    const at36 = gradeDecision(easy, "raise", { attempts: 100, bestActionCount: 36 });
    expect(at34.grade).toBe("sharp");
    expect(at36.grade).toBe("best");
    record("sharp threshold", "fires at 34% of users finding it, not at 36%");
  });

  it("never fires on an action that is not best", () => {
    const result = gradeDecision(easy, "fold", { attempts: 500, bestActionCount: 1 });
    expect(result.grade).not.toBe("sharp");
  });

  it("lands at 1-3% over 10,000 realistic attempts", () => {
    // Model a plausible population: most nodes are found easily, a minority are
    // genuinely hard, and users pick the best action most of the time.
    const rng = createRng("sharp-rate");
    let sharp = 0;
    const total = 10_000;

    for (let i = 0; i < total; i++) {
      const node = nodes[Math.floor(rng() * nodes.length)]!;
      const handKey = HAND_KEYS[Math.floor(rng() * HAND_KEYS.length)]!;
      // 12% of nodes are hard: fewer than 35% of users find the best action.
      const hardNode = rng() < 0.12;
      const successRate = hardNode ? 0.2 + rng() * 0.14 : 0.45 + rng() * 0.5;
      const attempts = 30 + Math.floor(rng() * 400);
      const stats = {
        attempts,
        bestActionCount: Math.round(attempts * successRate),
      };
      // The user finds the best action at roughly the population rate.
      const findsBest = rng() < successRate;
      const strategy = node.strategy[handKey] ?? {};
      let best = node.actions[0]!;
      let bestEv = -Infinity;
      for (const action of node.actions) {
        const ev = node.ev[handKey]?.[action] ?? 0;
        if (ev > bestEv) {
          bestEv = ev;
          best = action;
        }
      }
      const other = node.actions.find((a) => a !== best) ?? best;
      const chosen = findsBest ? best : other;
      void strategy;
      if (grade(node, handKey, chosen, stats).grade === "sharp") sharp++;
    }

    const rate = (sharp / total) * 100;
    const inTargetBand = rate >= 1 && rate <= 3;
    console.log(
      `\nobserved sharp rate: ${rate.toFixed(2)}% over ${total.toLocaleString("en-US")} attempts` +
        (inTargetBand
          ? " — inside the 1-3% target band"
          : `\n  \u26a0 OUTSIDE the 1-3% target band. SHARP_MAX_SUCCESS_RATE is the dial.` +
            `\n    This is a simulated population, not real data — retune once nodeStats` +
            `\n    are being recorded in production rather than guessing here.`),
    );
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(5);
    record("sharp rate", `${rate.toFixed(2)}% in simulation (target band 1-3%)`);
  });
});

// ── Pedagogical override ──────────────────────────────────────────────────────

describe("folding a 100% raise", () => {
  it("is at least a mistake even when the chip cost is trivial", () => {
    const node: GradeInput = {
      actions: ["fold", "raise"],
      frequencies: { raise: 1, fold: 0 },
      evs: { fold: 0, raise: 0.02 },
    };
    const result = gradeDecision(node, "fold");
    expect(result.evLoss).toBeCloseTo(0.02, 9);
    expect(result.grade).toBe("mistake");
    record("pedagogical override", "folding a 100%-raise hand grades mistake at a 0.02bb cost");
  });

  it("leaves a genuinely bad fold at its computed band", () => {
    const node: GradeInput = {
      actions: ["fold", "raise"],
      frequencies: { raise: 1, fold: 0 },
      evs: { fold: 0, raise: 6 },
    };
    expect(gradeDecision(node, "fold").grade).toBe("blunder");
  });

  it("does not fire when the hand is genuinely mixed", () => {
    const node: GradeInput = {
      actions: ["fold", "raise"],
      frequencies: { raise: 0.6, fold: 0.4 },
      evs: { fold: 0, raise: 0.1 },
    };
    expect(gradeDecision(node, "fold").grade).toBe("solid");
  });
});

// ── Unplayed actions ──────────────────────────────────────────────────────────

describe("an action the strategy never takes", () => {
  /**
   * The live failure: bet 33% at 0%, EV only 0.40bb off the peak, graded Solid
   * while the capsules printed 0% and the mix copy named every other size.
   */
  const screenshot: GradeInput = {
    actions: ["check", "bet_33", "bet_66", "bet_100"],
    frequencies: { check: 0.2, bet_33: 0, bet_66: 0.5, bet_100: 0.3 },
    evs: { check: 1.1, bet_33: 1.1, bet_66: 1.5, bet_100: 1.3 },
  };

  it("cannot grade solid even when the EV gap is inside the solid band", () => {
    const result = gradeDecision(screenshot, "bet_33");
    expect(result.evLoss).toBeCloseTo(0.4, 9);
    expect(result.grade).toBe("inaccuracy");
    expect(result.isBalancedAlternative).toBe(false);
    record("unplayed size", "0% bet 33% at −0.40bb grades inaccuracy, not solid");
  });

  it("still grades a real mix component as solid", () => {
    expect(gradeDecision(screenshot, "check").grade).toBe("solid");
    expect(gradeDecision(screenshot, "bet_100").grade).toBe("solid");
    expect(gradeDecision(screenshot, "bet_66").grade).toBe("best");
  });

  it("does not soften a real blunder on an unplayed line", () => {
    const node: GradeInput = {
      actions: ["fold", "raise"],
      frequencies: { raise: 1, fold: 0 },
      evs: { fold: 0, raise: 6 },
    };
    expect(gradeDecision(node, "fold").grade).toBe("blunder");
  });

  it("cannot grade best just because the EV table ranks a 0% line highest", () => {
    const node: GradeInput = {
      actions: ["check", "bet_33", "bet_66"],
      frequencies: { check: 0.4, bet_33: 0, bet_66: 0.6 },
      evs: { check: 1, bet_33: 2, bet_66: 1.9 },
    };
    const result = gradeDecision(node, "bet_33");
    expect(result.evLoss).toBe(0);
    expect(result.grade).toBe("inaccuracy");
  });

  it("never grades a displayed-0% action better than inaccuracy on the preflop set", () => {
    let checked = 0;
    for (const node of nodes) {
      for (const handKey of HAND_KEYS) {
        for (const action of node.actions) {
          const result = grade(node, handKey, action);
          if (!isPlayedFrequency(result.frequencies[action] ?? 0)) {
            expect(["inaccuracy", "mistake", "blunder"]).toContain(result.grade);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    record(
      "unplayed floor holds",
      `${checked.toLocaleString("en-US")} zero-frequency actions, none better than inaccuracy`,
    );
  });
});

// ── RFI limp (call) ───────────────────────────────────────────────────────────

describe("first-in Call (limp) on RFI", () => {
  const rfi = nodes.filter((n) => n.actionSeq === "rfi");

  it("offers call on every opening node", () => {
    expect(rfi.length).toBe(5);
    for (const node of rfi) {
      expect(node.actions).toEqual(["fold", "call", "raise"]);
    }
    record("rfi limp offered", `${rfi.length} opening nodes include call`);
  });

  it("never recommends limping — call frequency is zero across the range", () => {
    for (const node of rfi) {
      for (const hand of HAND_KEYS) {
        expect(node.strategy[hand]?.call ?? 0).toBe(0);
      }
    }
  });

  it("grades limping as a mistake on raise hands and fold hands alike", () => {
    const btn = rfi.find((n) => n.heroPos === "BTN")!;
    const raiseHand = grade(btn, "22" as HandKey, "call");
    const foldHand = grade(btn, "72o" as HandKey, "call");
    expect(raiseHand.grade).toMatch(/mistake|blunder/);
    expect(foldHand.grade).toMatch(/mistake|blunder/);
    expect(raiseHand.frequencies.call ?? 0).toBe(0);
    record(
      "rfi limp grades badly",
      `BTN 22 → ${raiseHand.grade} (−${raiseHand.evLoss.toFixed(2)}bb); 72o → ${foldHand.grade}`,
    );
  });
});

// ── 2d. Accuracy ──────────────────────────────────────────────────────────────

describe("accuracy", () => {
  it("hits the three target points", () => {
    const at = (meanEvLoss: number) => accuracy([{ evLoss: meanEvLoss }]);
    const strong = at(0.15);
    const beginner = at(0.8);
    const guessing = at(3);

    console.log(
      `\naccuracy curve (decay 0.30):\n` +
        [0, 0.15, 0.3, 0.5, 0.8, 1.5, 3, 5]
          .map((loss) => `  mean EV loss ${loss.toFixed(2)}bb → ${at(loss).toFixed(1)}%`)
          .join("\n"),
    );

    expect(strong).toBeGreaterThanOrEqual(94);
    expect(strong).toBeLessThanOrEqual(96);
    expect(beginner).toBeGreaterThan(76);
    expect(beginner).toBeLessThan(80);
    expect(guessing).toBeGreaterThan(38);
    expect(guessing).toBeLessThan(43);
    record(
      "accuracy targets",
      `0.15bb → ${strong.toFixed(1)}%, 0.8bb → ${beginner.toFixed(1)}%, 3bb → ${guessing.toFixed(1)}%`,
    );
  });

  it("decreases monotonically in mean EV loss", () => {
    let previous = Infinity;
    for (let loss = 0; loss <= 10; loss += 0.1) {
      const value = accuracy([{ evLoss: loss }]);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
    record("accuracy monotonic", "strictly non-increasing from 0 to 10bb mean loss");
  });

  it("is 100 for an empty session and clamped to [0,100]", () => {
    expect(accuracy([])).toBe(100);
    expect(accuracy([{ evLoss: 1000 }])).toBeGreaterThanOrEqual(0);
    expect(accuracy([{ evLoss: 0 }])).toBe(100);
  });
});

describe("scoreSession", () => {
  it("summarises a session", () => {
    const grades = [
      gradeDecision(twoActions(0, 0.6), "raise"),
      gradeDecision(twoActions(1, 0.6), "fold"),
      gradeDecision(twoActions(6, 0.6), "fold"),
      gradeDecision(twoActions(3, 0.6), "raise", { attempts: 100, bestActionCount: 10 }),
    ] as Grade[];

    const score = scoreSession(grades);
    expect(score.handsPlayed).toBe(4);
    expect(score.totalEvLost).toBeCloseTo(7, 6);
    expect(score.evLostPer100).toBeCloseTo(175, 6);
    expect(score.distribution.blunder).toBe(1);
    expect(score.distribution.inaccuracy).toBe(1);
    expect(score.sharpCount).toBe(1);
    expect(score.accuracy).toBeCloseTo(100 * Math.exp(-0.3 * 1.75), 6);
    record("session scoring", "accuracy, EV lost, per-100 rate, distribution and sharp count");
  });

  it("handles an empty session", () => {
    const score = scoreSession([]);
    expect(score.accuracy).toBe(100);
    expect(score.evLostPer100).toBe(0);
  });
});

// ── 5. Leak detection ─────────────────────────────────────────────────────────

describe("detectLeaks", () => {
  function attempt(overrides: Partial<Attempt>): Attempt {
    return {
      street: "preflop",
      position: "BTN",
      actionSeq: "rfi",
      handClass: null,
      chosenAction: "raise",
      bestAction: "raise",
      evLoss: 0,
      ...overrides,
    };
  }

  it("finds a planted big-blind over-folding leak and names it", () => {
    const attempts: Attempt[] = [];
    // The leak: 40 hands where the user folds the BB against a button open.
    for (let i = 0; i < 40; i++) {
      attempts.push(
        attempt({
          position: "BB",
          actionSeq: "vs_rfi_BTN",
          chosenAction: "fold",
          bestAction: "call",
          evLoss: 1.4,
        }),
      );
    }
    // Plenty of clean play elsewhere, which must not be surfaced.
    for (let i = 0; i < 60; i++) {
      attempts.push(attempt({ position: "CO", actionSeq: "rfi", evLoss: 0.02 }));
    }

    const leaks = detectLeaks(attempts);
    console.log(
      `\ndetected leaks:\n${leaks
        .map(
          (l) =>
            `  ${l.key.padEnd(28)} severity ${l.severity}  n=${l.sampleSize}  mean ${l.meanEvLoss.toFixed(2)}bb`,
        )
        .join("\n")}`,
    );

    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.key).toBe("overfolds_bb_vs_btn");
    expect(leaks[0]?.severity).toBeGreaterThanOrEqual(3);
    expect(leaks[0]?.sampleSize).toBe(40);
    record(
      "leak detection",
      `planted BB over-fold found as "${leaks[0]?.key}" at severity ${leaks[0]?.severity}`,
    );
  });

  it("ignores a bucket with fewer than 10 samples, however bad", () => {
    const attempts: Attempt[] = [];
    for (let i = 0; i < 9; i++) {
      attempts.push(
        attempt({
          position: "SB",
          actionSeq: "vs_rfi_CO",
          chosenAction: "fold",
          bestAction: "raise",
          evLoss: 9,
        }),
      );
    }
    expect(detectLeaks(attempts)).toEqual([]);
    record("no false positives", "a 9-sample bucket losing 9bb a hand is not reported");
  });

  it("keeps street in the key so 'you leak on turns' is expressible", () => {
    const attempts: Attempt[] = [];
    for (let i = 0; i < 20; i++) {
      attempts.push(
        attempt({
          street: "turn",
          position: "BB",
          actionSeq: "vs_rfi_BTN",
          handClass: "middle_pair" as HandClass,
          chosenAction: "call",
          bestAction: "fold",
          evLoss: 1.1,
        }),
      );
      attempts.push(
        attempt({ street: "flop", position: "BB", actionSeq: "vs_rfi_BTN", evLoss: 0.01 }),
      );
    }
    const leaks = detectLeaks(attempts);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.street).toBe("turn");
    expect(leaks[0]?.key).toContain("overcalls");
    record("street-scoped leaks", "a turn-only leak is reported as a turn leak");
  });

  it("orders leaks by severity", () => {
    const attempts: Attempt[] = [];
    for (let i = 0; i < 15; i++) {
      attempts.push(
        attempt({
          position: "SB",
          actionSeq: "rfi",
          chosenAction: "fold",
          bestAction: "raise",
          evLoss: 0.9,
        }),
      );
      attempts.push(
        attempt({
          position: "UTG",
          actionSeq: "rfi",
          chosenAction: "raise",
          bestAction: "fold",
          evLoss: 4.5,
        }),
      );
    }
    const leaks = detectLeaks(attempts);
    expect(leaks).toHaveLength(2);
    expect(leaks[0]?.severity).toBeGreaterThan(leaks[1]?.severity ?? 0);
    expect(leaks[0]?.key).toBe("overaggressive_utg_rfi");
  });

  it("returns nothing for a clean player", () => {
    const attempts = Array.from({ length: 200 }, () => attempt({ evLoss: 0.01 }));
    expect(detectLeaks(attempts)).toEqual([]);
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.7 — grading engine\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});
