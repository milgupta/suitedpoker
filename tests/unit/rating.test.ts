import { describe, expect, it } from "vitest";
import type { GradeName } from "../../src/poker/grader";
import {
  EMPIRICAL_MIN_ATTEMPTS,
  LEAK_TARGET_SHARE,
  MAX_RD,
  TILT_DROP,
  decayRd,
  difficultyToRating,
  empiricalDifficultyRating,
  initialRatingFromOnboarding,
  scoreForGrade,
  selectNextDifficulty,
  tierFor,
  tieredUp,
  updateRating,
  type Outcome,
} from "../../src/lib/rating";

describe("Glicko-1 against the published reference", () => {
  it("reproduces the worked example from Glickman's paper", () => {
    // Glickman, "The Glicko system", the example calculation: a 1500/200 player
    // beats a 1400/30, loses to a 1550/100 and loses to a 1700/300.
    // Expected: rating 1464.1, RD 151.4.
    const outcomes: Outcome[] = [
      { opponentRating: 1400, opponentRd: 30, score: 1 },
      { opponentRating: 1550, opponentRd: 100, score: 0 },
      { opponentRating: 1700, opponentRd: 300, score: 0 },
    ];

    const result = updateRating({ rating: 1500, rd: 200 }, outcomes);

    expect(result.rating).toBeCloseTo(1464.1, 0);
    expect(result.rd).toBeCloseTo(151.4, 0);
  });

  it("leaves a rating untouched when there are no outcomes", () => {
    const before = { rating: 1200, rd: 120 };
    expect(updateRating(before, [])).toEqual(before);
  });

  it("moves a high-RD player further than a low-RD player on the same result", () => {
    const outcome: Outcome[] = [{ opponentRating: 1200, opponentRd: 50, score: 1 }];
    const uncertain = updateRating({ rating: 1200, rd: 300 }, outcome);
    const settled = updateRating({ rating: 1200, rd: 50 }, outcome);

    expect(uncertain.rating - 1200).toBeGreaterThan(settled.rating - 1200);
  });

  it("shrinks RD with activity and never below the floor", () => {
    let current = { rating: 1200, rd: MAX_RD };
    for (let i = 0; i < 500; i++) {
      current = updateRating(current, [
        { opponentRating: 1200, opponentRd: 50, score: i % 2 === 0 ? 1 : 0 },
      ]);
    }
    expect(current.rd).toBeLessThan(100);
    expect(current.rd).toBeGreaterThanOrEqual(30);
  });

  it("grows RD with inactivity, capped at the maximum", () => {
    expect(decayRd(50, 0)).toBe(50);
    expect(decayRd(50, 30)).toBeGreaterThan(50);
    expect(decayRd(50, 10_000)).toBe(MAX_RD);
  });
});

describe("convergence", () => {
  /**
   * A synthetic player of known true skill. Their probability of a good answer
   * follows the same logistic the rating assumes, so a correct implementation
   * must recover the number it was generated from.
   */
  function simulate(trueSkill: number, attempts: number): { rating: number; rd: number } {
    let current = { rating: 1000, rd: MAX_RD };
    // Deterministic: a flaky convergence test is worse than none.
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < attempts; i++) {
      const spotRating = 600 + rand() * 1200;
      const p = 1 / (1 + Math.pow(10, (spotRating - trueSkill) / 400));
      const score = rand() < p ? 1 : 0;
      current = updateRating(current, [{ opponentRating: spotRating, opponentRd: 50, score }]);
    }
    return current;
  }

  it("converges to within ±50 of true skill over 10,000 attempts", () => {
    for (const trueSkill of [900, 1200, 1500]) {
      const result = simulate(trueSkill, 10_000);
      expect(
        Math.abs(result.rating - trueSkill),
        `true ${trueSkill}, converged to ${result.rating.toFixed(0)}`,
      ).toBeLessThanOrEqual(50);
      expect(result.rd, `RD stayed at ${result.rd.toFixed(0)}`).toBeLessThan(100);
    }
  });

  it("rises monotonically for a player who is always optimal", () => {
    let current = { rating: 1000, rd: MAX_RD };
    for (let i = 0; i < 200; i++) {
      const next = updateRating(current, [{ opponentRating: 1200, opponentRd: 50, score: 1 }]);
      expect(next.rating).toBeGreaterThan(current.rating);
      current = next;
    }
  });

  it("falls monotonically for a player who always blunders", () => {
    let current = { rating: 1400, rd: MAX_RD };
    for (let i = 0; i < 200; i++) {
      const next = updateRating(current, [{ opponentRating: 1200, opponentRd: 50, score: 0 }]);
      expect(next.rating).toBeLessThan(current.rating);
      current = next;
    }
  });
});

describe("grade scoring", () => {
  it("scores sharp identically to best", () => {
    // Sharp is recognition, not rating. Inflating from a cosmetic grade would
    // quietly break difficulty targeting.
    expect(scoreForGrade("sharp")).toBe(scoreForGrade("best"));
  });

  it("is monotonically decreasing in severity", () => {
    const order: GradeName[] = ["best", "solid", "inaccuracy", "mistake", "blunder"];
    for (let i = 1; i < order.length; i++) {
      const prev = order[i - 1] as GradeName;
      const curr = order[i] as GradeName;
      expect(scoreForGrade(curr)).toBeLessThan(scoreForGrade(prev));
    }
  });

  it("uses the exact scale the plan specifies", () => {
    expect(scoreForGrade("solid")).toBe(0.8);
    expect(scoreForGrade("inaccuracy")).toBe(0.5);
    expect(scoreForGrade("mistake")).toBe(0.2);
    expect(scoreForGrade("blunder")).toBe(0);
  });
});

describe("placement", () => {
  it.each([
    ["never", 700],
    ["videos", 850],
    ["charts", 1000],
    ["solver", 1200],
  ] as const)("places a %s answer at %i", (answer, expected) => {
    const result = initialRatingFromOnboarding(answer);
    expect(result.rating).toBe(expected);
    expect(result.rd).toBe(MAX_RD);
  });
});

describe("adaptive difficulty", () => {
  const noLeaks = { leakTags: [], roll: 0.9 };

  it("aims 50 above the user", () => {
    const result = selectNextDifficulty({ rating: 1000, recentGrades: [], ...noLeaks });
    expect(result.targetRating).toBe(1050);
    expect(result.tilted).toBe(false);
  });

  it("ANTI-TILT — drops 150 after three consecutive wrong answers", () => {
    const recentGrades: GradeName[] = ["mistake", "blunder", "inaccuracy"];
    const result = selectNextDifficulty({ rating: 1000, recentGrades, ...noLeaks });

    expect(result.tilted).toBe(true);
    expect(result.targetRating).toBe(1050 - TILT_DROP);

    const calm = selectNextDifficulty({ rating: 1000, recentGrades: [], ...noLeaks });
    expect(calm.targetRating - result.targetRating).toBe(TILT_DROP);
  });

  it("does not tilt on two wrong answers, or on a wrong-right-wrong run", () => {
    expect(
      selectNextDifficulty({
        rating: 1000,
        recentGrades: ["mistake", "blunder"],
        ...noLeaks,
      }).tilted,
    ).toBe(false);

    expect(
      selectNextDifficulty({
        rating: 1000,
        recentGrades: ["mistake", "best", "blunder"],
        ...noLeaks,
      }).tilted,
    ).toBe(false);
  });

  it("targets a leak on roughly 30% of selections", () => {
    let targeted = 0;
    const total = 1000;

    for (let i = 0; i < total; i++) {
      const result = selectNextDifficulty({
        rating: 1000,
        recentGrades: [],
        roll: i / total,
        leakTags: ["blind_defense", "3bet_pots"],
      });
      if (result.leakTag !== null) targeted++;
    }

    const share = targeted / total;
    expect(share, `leak targeting fired ${(share * 100).toFixed(1)}% of the time`).toBeGreaterThan(
      LEAK_TARGET_SHARE - 0.05,
    );
    expect(share).toBeLessThan(LEAK_TARGET_SHARE + 0.05);
  });

  it("never targets a leak when there are none detected", () => {
    for (let i = 0; i < 100; i++) {
      const result = selectNextDifficulty({
        rating: 1000,
        recentGrades: [],
        roll: i / 100,
        leakTags: [],
      });
      expect(result.leakTag).toBeNull();
    }
  });
});

describe("difficulty mapping", () => {
  it("maps 1–10 onto 600–1800", () => {
    expect(difficultyToRating(1)).toBe(600);
    expect(difficultyToRating(10)).toBe(1800);
    expect(difficultyToRating(5)).toBeGreaterThan(1000);
  });

  it("clamps outside the range rather than extrapolating", () => {
    expect(difficultyToRating(-4)).toBe(600);
    expect(difficultyToRating(99)).toBe(1800);
  });

  it("keeps the authored estimate below the empirical threshold", () => {
    const authored = difficultyToRating(5);
    expect(empiricalDifficultyRating(5, EMPIRICAL_MIN_ATTEMPTS - 1, 0.1)).toBe(authored);
  });

  it("adjusts downward for a spot people beat easily", () => {
    const authored = difficultyToRating(5);
    const easy = empiricalDifficultyRating(5, 200, 0.9);
    const hard = empiricalDifficultyRating(5, 200, 0.2);

    expect(easy).toBeLessThan(authored);
    expect(hard).toBeGreaterThan(authored);
  });
});

describe("tiers", () => {
  it.each([
    [700, "Fish"],
    [799, "Fish"],
    [800, "Beginner"],
    [1000, "Recreational"],
    [1200, "Solid"],
    [1400, "Strong"],
    [1600, "Crusher"],
    [2400, "Crusher"],
  ])("rating %i is %s", (rating, name) => {
    expect(tierFor(rating).name).toBe(name);
  });

  it("detects a tier-up but not a move within a tier", () => {
    expect(tieredUp(799, 800)).toBe(true);
    expect(tieredUp(800, 999)).toBe(false);
    expect(tieredUp(1000, 900)).toBe(false);
  });
});
