/**
 * The quiz breakdown on /progress.
 *
 * Every figure is checkable against a hand count. Both of the dashboard's own
 * hand counts were wrong the first time and the code was right, which is the
 * entire argument for writing them down.
 */

import { describe, expect, it } from "vitest";
import { MIN_ATTEMPTS_FOR_WEAKEST, quizStats } from "../../src/lib/quiz-stats";
import { QUIZ_FAMILIES } from "../../src/poker/quiz";

const rows = (family: string, right: number, wrong: number) => [
  ...Array.from({ length: right }, () => ({ family, correct: true })),
  ...Array.from({ length: wrong }, () => ({ family, correct: false })),
];

describe("quizStats", () => {
  it("reports nothing rather than zero before anything is answered", () => {
    // A brand-new user must never see a 0%. Zeros on day one read as "empty",
    // and that is a refund.
    const stats = quizStats([]);
    expect(stats.accuracy).toBeNull();
    expect(stats.weakest).toBeNull();
    expect(stats.totalAnswered).toBe(0);
    for (const family of stats.families) expect(family.accuracy).toBeNull();
  });

  it("counts a mixed record correctly", () => {
    // 6 right of 10 overall: 3/4 on draws, 3/6 on pot odds.
    const stats = quizStats([...rows("draw_completion", 3, 1), ...rows("pot_odds", 3, 3)]);
    expect(stats.totalAnswered).toBe(10);
    expect(stats.totalCorrect).toBe(6);
    expect(stats.accuracy).toBe(60);

    const draws = stats.families.find((f) => f.family === "draw_completion")!;
    expect(draws.attempts).toBe(4);
    expect(draws.accuracy).toBe(75);

    const odds = stats.families.find((f) => f.family === "pot_odds")!;
    expect(odds.attempts).toBe(6);
    expect(odds.accuracy).toBe(50);
  });

  it("lists every family, including the untouched ones", () => {
    const stats = quizStats(rows("set_mine", 1, 0));
    expect(stats.families).toHaveLength(QUIZ_FAMILIES.length);
    const untouched = stats.families.find((f) => f.family === "overcard")!;
    expect(untouched.attempts).toBe(0);
    // Zero ATTEMPTS, not zero accuracy — never tell someone they are bad at
    // something they have not tried.
    expect(untouched.accuracy).toBeNull();
  });

  it("will not name a weakness off a handful of questions", () => {
    const thin = quizStats(rows("overcard", 0, MIN_ATTEMPTS_FOR_WEAKEST - 1));
    expect(thin.weakest).toBeNull();

    const enough = quizStats(rows("overcard", 0, MIN_ATTEMPTS_FOR_WEAKEST));
    expect(enough.weakest?.family).toBe("overcard");
  });

  it("picks the genuinely weakest family, not the busiest", () => {
    const stats = quizStats([
      ...rows("flop_pair", 2, 8), // 20% over 10
      ...rows("pot_odds", 18, 12), // 60% over 30
    ]);
    expect(stats.weakest?.family).toBe("flop_pair");
    expect(stats.weakest?.accuracy).toBe(20);
  });

  it("survives a family that no longer exists", () => {
    // Renaming a family must not break the history of everybody who answered
    // it, and must not crash the page it is rendered on.
    const stats = quizStats([{ family: "a_retired_family", correct: true }]);
    expect(stats.totalAnswered).toBe(0);
    expect(stats.accuracy).toBeNull();
  });
});
