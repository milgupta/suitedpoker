/**
 * Every number on the home screen, checked against a hand count.
 *
 * The dashboard is where a beginner learns what their own game looks like. A
 * stat that is quietly off by a few percent does not look broken — it teaches
 * them something false about themselves, which is worse. So each figure is
 * computed here from rows whose correct answer was worked out by hand.
 */

import { describe, expect, it } from "vitest";
import {
  accuracyOf,
  evLostPer100,
  goalLine,
  greeting,
  isCorrect,
  lastSessionDelta,
  leakContext,
  MIN_HANDS_FOR_LEAKS,
  MIN_HANDS_FOR_STATS,
  pfrOf,
  sparkline,
  streetAccuracy,
  summarise,
  vpipOf,
  weekOverWeek,
  type AttemptRow,
} from "../../src/lib/dashboard";
import { GRADE_NAMES } from "../../src/poker/grader";
import { GLOSSARY } from "../../src/content/glossary";

const NOW = new Date("2026-08-06T12:00:00Z");

function row(overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    grade: "best",
    evLoss: 0,
    street: "preflop",
    chosenAction: "fold",
    bestAction: "fold",
    timeMs: 6_000,
    createdAt: NOW,
    ...overrides,
  };
}

/**
 * Ten hands, counted by hand:
 *   grades      — 3 best, 1 sharp, 1 solid, 2 inaccuracy, 2 mistake, 1 blunder
 *   correct     — best + sharp + solid = 5 → accuracy 50%
 *   ev lost     — 0+0+0+0+0.2 + 0.8+0.9 + 1.5+1.6 + 4.0 = 9.0 → 90 bb/100
 *   streets     — 6 preflop, 2 flop, 1 turn, 1 river
 *   preflop     — 4 correct of 6 (3 best + 1 solid) → 66.67%
 *   voluntary   — 3 of the 6 preflop are call/raise → VPIP 50%
 *   raises      — 1 of the 6 preflop → PFR 16.67%
 */
const TEN: AttemptRow[] = [
  row({ grade: "best", chosenAction: "raise" }),
  row({ grade: "best", chosenAction: "call" }),
  row({ grade: "best", chosenAction: "fold" }),
  row({ grade: "sharp", chosenAction: "raise", street: "flop" }),
  row({ grade: "solid", evLoss: 0.2, chosenAction: "call" }),
  row({ grade: "inaccuracy", evLoss: 0.8, chosenAction: "fold" }),
  row({ grade: "inaccuracy", evLoss: 0.9, chosenAction: "call", street: "flop" }),
  row({ grade: "mistake", evLoss: 1.5, chosenAction: "fold" }),
  row({ grade: "mistake", evLoss: 1.6, chosenAction: "call", street: "turn" }),
  row({ grade: "blunder", evLoss: 4.0, chosenAction: "fold", street: "river" }),
];

describe("accuracy", () => {
  it("counts sharp, best and solid as correct — and nothing else", () => {
    const correct = GRADE_NAMES.filter(isCorrect);
    expect(correct).toEqual(["sharp", "best", "solid"]);
  });

  it("matches the hand count: 5 of 10", () => {
    expect(accuracyOf(TEN)).toBe(0.5);
  });

  it("is zero, not NaN, with no data", () => {
    expect(accuracyOf([])).toBe(0);
  });
});

describe("bb/100 lost", () => {
  it("matches the hand-summed 9.0bb over 10 hands", () => {
    expect(evLostPer100(TEN)).toBeCloseTo(90, 6);
  });

  it("is reported as a positive cost", () => {
    // "You lose 4.2bb/100" reads unambiguously; a negative number invites
    // "negative loss, so… good?".
    expect(evLostPer100(TEN)).toBeGreaterThan(0);
  });

  it("is zero with no data", () => {
    expect(evLostPer100([])).toBe(0);
  });
});

describe("VPIP and PFR", () => {
  it("counts only preflop decisions", () => {
    // 6 preflop rows: raise, call, fold, call, fold, fold.
    // Voluntary (call or raise) = 3.
    expect(vpipOf(TEN)).toBeCloseTo(3 / 6, 6);
    // Raises among those six = 1. The flop/turn/river raises do not count.
    expect(pfrOf(TEN)).toBeCloseTo(1 / 6, 6);
  });

  it("never lets PFR exceed VPIP", () => {
    // A raise is voluntary money, so PFR is a subset by construction. If this
    // ever inverts, one of the two is counting the wrong rows.
    expect(pfrOf(TEN)).toBeLessThanOrEqual(vpipOf(TEN));
  });

  it("is zero with no preflop data", () => {
    const postflopOnly = [row({ street: "flop" }), row({ street: "river" })];
    expect(vpipOf(postflopOnly)).toBe(0);
    expect(pfrOf(postflopOnly)).toBe(0);
  });
});

describe("street performance", () => {
  it("buckets by street and matches the hand count", () => {
    const streets = streetAccuracy(TEN);
    const byName = Object.fromEntries(streets.map((s) => [s.street, s]));

    expect(byName.preflop!.attempts).toBe(6);
    expect(byName.flop!.attempts).toBe(2);
    expect(byName.turn!.attempts).toBe(1);
    expect(byName.river!.attempts).toBe(1);

    // Preflop: best, best, best, solid correct = 4 of 6.
    expect(byName.preflop!.accuracy).toBeCloseTo(4 / 6, 6);
    // Flop: sharp correct, inaccuracy not = 1 of 2.
    expect(byName.flop!.accuracy).toBe(0.5);
    // Turn and river were both mistakes.
    expect(byName.turn!.accuracy).toBe(0);
    expect(byName.river!.accuracy).toBe(0);
  });

  it("reports zero ATTEMPTS rather than zero accuracy for an untouched street", () => {
    // Never tell someone they are bad at something they have not tried.
    const preflopOnly = [row(), row()];
    const flop = streetAccuracy(preflopOnly).find((s) => s.street === "flop")!;
    expect(flop.attempts).toBe(0);
  });

  it("always returns all four streets, in order", () => {
    expect(streetAccuracy([]).map((s) => s.street)).toEqual(["preflop", "flop", "turn", "river"]);
  });
});

describe("this week vs last", () => {
  const day = 24 * 60 * 60 * 1000;

  it("splits on the seven-day boundary", () => {
    const rows = [
      row({ createdAt: new Date(NOW.getTime() - 1 * day), grade: "best" }),
      row({ createdAt: new Date(NOW.getTime() - 6 * day), grade: "best" }),
      // Older than a week: last week's bucket.
      row({ createdAt: new Date(NOW.getTime() - 8 * day), grade: "blunder", evLoss: 3 }),
      row({ createdAt: new Date(NOW.getTime() - 13 * day), grade: "blunder", evLoss: 3 }),
      // Older than two weeks: neither bucket.
      row({ createdAt: new Date(NOW.getTime() - 20 * day) }),
    ];

    const { thisWeek, lastWeek } = weekOverWeek(rows, NOW);
    expect(thisWeek.hands).toBe(2);
    expect(lastWeek.hands).toBe(2);
    expect(thisWeek.accuracy).toBe(1);
    expect(lastWeek.accuracy).toBe(0);
  });

  it("counts study minutes from real time spent", () => {
    const rows = [row({ timeMs: 90_000 }), row({ timeMs: 30_000 })];
    expect(summarise(rows).minutesStudied).toBe(2);
  });
});

describe("the rating sparkline", () => {
  it("returns one point per day", () => {
    expect(sparkline([], 1000, NOW, 30)).toHaveLength(30);
  });

  it("holds the last value through days with no play, never dropping to zero", () => {
    // A cliff to zero reads as "something is broken"; a flat line reads as
    // "did not play", which is what actually happened.
    const points = [{ at: new Date(NOW.getTime() - 20 * 86_400_000), rating: 900 }];
    const series = sparkline(points, 900, NOW, 30);
    expect(series.every((v) => v > 0)).toBe(true);
    expect(series[series.length - 1]).toBe(900);
  });

  it("tracks a rating that moves", () => {
    const points = [
      { at: new Date(NOW.getTime() - 20 * 86_400_000), rating: 900 },
      { at: new Date(NOW.getTime() - 5 * 86_400_000), rating: 1050 },
    ];
    const series = sparkline(points, 1050, NOW, 30);
    expect(series[0]).toBe(900);
    expect(series[series.length - 1]).toBe(1050);
  });
});

describe("the copy", () => {
  it("greets by the hour", () => {
    expect(greeting(new Date("2026-08-06T08:00:00"))).toBe("Morning");
    expect(greeting(new Date("2026-08-06T14:00:00"))).toBe("Afternoon");
    expect(greeting(new Date("2026-08-06T21:00:00"))).toBe("Evening");
  });

  it("echoes the onboarding goal, and says nothing when there is none", () => {
    expect(goalLine("beat_friends")).toBe("beat your friends");
    expect(goalLine(null)).toBeNull();
    expect(goalLine("nonsense")).toBeNull();
  });
});

describe("every dashboard stat is defined for the user", () => {
  it("has a glossary entry with a definition and a target", () => {
    // The plan's rule: no stat ships without both. "VPIP 33%" with no context
    // has taught a beginner nothing.
    const shown = ["accuracy", "vpip", "pfr", "ev-loss"];
    const rows: string[] = [];

    for (const id of shown) {
      const entry = GLOSSARY.find((g) => g.id === id);
      expect(entry, `no glossary entry for ${id}`).toBeDefined();
      expect(entry!.what.length, `${id} has no definition`).toBeGreaterThan(40);
      expect(entry!.improve.length, `${id} has no target`).toBeGreaterThan(20);
      expect(entry!.bands.length, `${id} has no bands`).toBeGreaterThan(1);
      rows.push(`${entry!.name.padEnd(10)} ${entry!.bands.length} bands · ${entry!.improve}`);
    }

    console.log(
      `\n${"=".repeat(72)}\nDASHBOARD STAT DEFINITIONS\n${"=".repeat(72)}\n${rows.join("\n")}\n`,
    );
  });
});

describe("the empty state", () => {
  it("waits for a real sample before naming leaks", () => {
    expect(MIN_HANDS_FOR_LEAKS).toBe(50);
    expect(MIN_HANDS_FOR_STATS).toBe(20);
  });

  it("computes without throwing on a brand-new user", () => {
    expect(() => {
      accuracyOf([]);
      vpipOf([]);
      pfrOf([]);
      evLostPer100([]);
      streetAccuracy([]);
      weekOverWeek([], NOW);
      sparkline([], 0, NOW);
    }).not.toThrow();
  });
});

describe("leak context from the stored node reference", () => {
  it("derives the real seat and sequence for preflop attempts", () => {
    expect(leakContext("BB:vs_rfi_BTN")).toEqual({ position: "BB", actionSeq: "vs_rfi_BTN" });
    expect(leakContext("UTG:rfi")).toEqual({ position: "UTG", actionSeq: "rfi" });
    expect(leakContext("SB:vs_3bet_BB")).toEqual({ position: "SB", actionSeq: "vs_3bet_BB" });
  });

  it("marks postflop template attempts as postflop, never a guessed seat", () => {
    expect(leakContext("srp-btn-cbet-ace-high-dry")).toEqual({
      position: "postflop",
      actionSeq: "postflop",
    });
  });

  it("a big-blind overfolder produces a BIG-BLIND leak, not a button one", async () => {
    // The regression this whole path exists to prevent: dashboard-server used
    // to hardcode BTN/rfi for every attempt, so a BB leak was labelled BTN.
    const { detectLeaks } = await import("../../src/poker/grader");
    const attempts = Array.from({ length: 12 }, () => {
      const context = leakContext("BB:vs_rfi_BTN");
      return {
        street: "preflop" as const,
        position: context.position,
        actionSeq: context.actionSeq,
        handClass: null,
        chosenAction: "fold",
        bestAction: "call",
        evLoss: 1.4,
      };
    });
    const leaks = detectLeaks(attempts);
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks[0]!.position).toBe("BB");
    expect(leaks[0]!.key).toContain("_bb_");
    expect(leaks[0]!.key).not.toContain("btn_rfi");
  });
});

describe("last session delta", () => {
  const pt = (iso: string, rating: number) => ({ at: new Date(iso), rating });

  it("is zero with fewer than two rated points", () => {
    expect(lastSessionDelta([])).toBe(0);
    expect(lastSessionDelta([pt("2026-08-10T10:00:00Z", 900)])).toBe(0);
  });

  it("measures the latest day against the previous day's close", () => {
    const points = [
      pt("2026-08-08T20:00:00Z", 880),
      pt("2026-08-09T09:00:00Z", 900),
      pt("2026-08-09T10:00:00Z", 915),
      pt("2026-08-10T09:00:00Z", 905),
      pt("2026-08-10T11:00:00Z", 940),
    ];
    // 940 (last close) minus 915 (previous day close).
    expect(lastSessionDelta(points)).toBe(25);
  });

  it("uses the day's own first point when there is no earlier day", () => {
    const points = [pt("2026-08-10T09:00:00Z", 900), pt("2026-08-10T11:00:00Z", 936)];
    expect(lastSessionDelta(points)).toBe(36);
  });
});

describe("the greeting in the user's timezone", () => {
  // 22:00 UTC is morning in Sydney and evening in London.
  const at = new Date("2026-08-10T22:00:00Z");

  it("greets by the user's clock, not the server's", () => {
    expect(greeting(at, "Australia/Sydney")).toBe("Morning");
    expect(greeting(at, "Europe/London")).toBe("Evening");
  });

  it("falls back to the server clock on an invalid zone", () => {
    expect(() => greeting(at, "Not/AZone")).not.toThrow();
  });
});
