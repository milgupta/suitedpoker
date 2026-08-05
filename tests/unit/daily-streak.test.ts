import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DAILY_DIFFICULTIES,
  DAILY_SPOT_COUNT,
  MAX_DAILY_SCORE,
  POINTS_FOR_GRADE,
  buildShareText,
  compareEntries,
  dayNumberFor,
  scoreDaily,
  seedForDate,
  type DailySpotResult,
} from "../../src/lib/daily";
import { completeDaily, currentStreak, isMilestone, type StreakState } from "../../src/lib/streak";
import { generateSpot } from "../../src/poker/generator";
import { parsePreflopNode, type PreflopNode } from "../../src/poker/solutions";
import { localDay } from "../../src/lib/local-day";

const NODES: PreflopNode[] = readdirSync(resolve(process.cwd(), "src/content/solutions/preflop"))
  .filter((f) => f.endsWith(".json"))
  .map((f) =>
    parsePreflopNode(
      JSON.parse(
        readFileSync(join(resolve(process.cwd(), "src/content/solutions/preflop"), f), "utf8"),
      ),
      f,
    ),
  );

const DATA = { preflop: NODES, postflop: [] };

describe("challenge generation is deterministic", () => {
  it("produces identical spots for the same date, twice", () => {
    const build = (dateKey: string): string[] =>
      DAILY_DIFFICULTIES.map((difficulty, i) =>
        JSON.stringify(
          generateSpot({ type: "preflop", difficulty }, DATA, `${seedForDate(dateKey)}-${i}`),
        ),
      );

    // The property the leaderboard depends on, and the reason the cron can be
    // retried safely.
    expect(build("2026-08-05")).toEqual(build("2026-08-05"));
  });

  it("produces different spots for different dates", () => {
    const a = generateSpot(
      { type: "preflop", difficulty: 5 },
      DATA,
      `${seedForDate("2026-08-05")}-0`,
    );
    const b = generateSpot(
      { type: "preflop", difficulty: 5 },
      DATA,
      `${seedForDate("2026-08-06")}-0`,
    );
    expect(a.nodeRef + a.handKey).not.toBe(b.nodeRef + b.handKey);
  });

  it("spans a range of difficulties rather than five of the same", () => {
    expect(DAILY_DIFFICULTIES).toHaveLength(DAILY_SPOT_COUNT);
    expect(new Set(DAILY_DIFFICULTIES).size).toBeGreaterThan(3);
    expect(Math.min(...DAILY_DIFFICULTIES)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...DAILY_DIFFICULTIES)).toBeLessThanOrEqual(8);
  });
});

describe("scoring", () => {
  const perfect: DailySpotResult[] = Array.from({ length: 5 }, (_, i) => ({
    spotIndex: i,
    grade: "best" as const,
    evLoss: 0,
    timeMs: 1000,
  }));

  it("caps a perfect run at 500", () => {
    expect(scoreDaily(perfect).score).toBe(MAX_DAILY_SCORE);
  });

  it("scores sharp the same as best", () => {
    expect(POINTS_FOR_GRADE.sharp).toBe(POINTS_FOR_GRADE.best);
  });

  it("breaks ties on time, then on sharp count", () => {
    const base = { score: 500, totalTimeMs: 10_000, sharpCount: 1 };
    expect(compareEntries(base, { ...base, score: 480 })).toBeLessThan(0);
    expect(compareEntries(base, { ...base, totalTimeMs: 5_000 })).toBeGreaterThan(0);
    expect(compareEntries(base, { ...base, sharpCount: 3 })).toBeGreaterThan(0);
  });
});

describe("THE TIMEZONE MATRIX", () => {
  const ZONES = ["America/Los_Angeles", "UTC", "Asia/Tokyo"];

  it.each(ZONES)("%s sees the correct local 'today'", (zone) => {
    // 2026-08-05 07:00 UTC is: 00:00 in LA, 07:00 in UTC, 16:00 in Tokyo — the
    // same instant, three different local clocks, all on the 5th.
    const at = Date.UTC(2026, 7, 5, 7, 0, 0);
    expect(localDay(at, zone).key).toBe("2026-08-05");
  });

  it("Los Angeles does not roll over at UTC midnight", () => {
    // 2026-08-05 00:30 UTC is still the 4th in LA. Counting in UTC would end an
    // LA player's streak while they were still looking at the screen.
    const at = Date.UTC(2026, 7, 5, 0, 30, 0);
    expect(localDay(at, "America/Los_Angeles").key).toBe("2026-08-04");
    expect(localDay(at, "UTC").key).toBe("2026-08-05");
    expect(localDay(at, "Asia/Tokyo").key).toBe("2026-08-05");
  });

  it.each(ZONES)("11pm then 1am the next day gives a streak of 2 in %s", (zone) => {
    // The exact scenario from the plan. Local 23:00, then local 01:00 the next
    // day: two consecutive local days, so the streak must be 2 — not 1 (treated
    // as the same day) and not reset (treated as a gap).
    const lateNight = instantAtLocal(zone, 2026, 8, 5, 23, 0);
    const earlyMorning = instantAtLocal(zone, 2026, 8, 6, 1, 0);

    let state: StreakState = { count: 0, longest: 0, lastPlayedDay: null, freezeUsedMonth: null };
    state = completeDaily(state, lateNight, zone);
    expect(state.count).toBe(1);

    const after = completeDaily(state, earlyMorning, zone);
    expect(after.count, `${zone}: expected 2, got ${after.count}`).toBe(2);
    expect(after.freezeApplied).toBe(false);
  });

  it.each(ZONES)("two completions in the same local day do not double-count in %s", (zone) => {
    const morning = instantAtLocal(zone, 2026, 8, 5, 9, 0);
    const evening = instantAtLocal(zone, 2026, 8, 5, 21, 0);

    let state: StreakState = { count: 0, longest: 0, lastPlayedDay: null, freezeUsedMonth: null };
    state = completeDaily(state, morning, zone);
    const again = completeDaily(state, evening, zone);

    expect(again.count).toBe(1);
    expect(again.extended).toBe(false);
  });
});

/** The epoch ms at which a given wall-clock time occurs in a zone. */
function instantAtLocal(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  // Search: start from the UTC interpretation and correct by the observed
  // offset. Two passes settle it for every real zone.
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const actual = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
    );
    const target = Date.UTC(year, month - 1, day, hour, minute);
    if (actual === target) break;
    guess += target - actual;
  }
  return guess;
}

describe("the streak freeze", () => {
  const zone = "UTC";
  const at = (day: number): number => Date.UTC(2026, 7, day, 12, 0, 0);

  it("covers one missed day and reports that it fired", () => {
    const state: StreakState = {
      count: 5,
      longest: 5,
      lastPlayedDay: "2026-08-03",
      freezeUsedMonth: null,
    };
    const result = completeDaily(state, at(5), zone);

    // An unannounced save teaches nothing; an announced one creates loyalty.
    expect(result.freezeApplied).toBe(true);
    expect(result.count).toBe(6);
    expect(result.freezeUsedMonth).toBe("2026-08");
  });

  it("fires only ONCE per calendar month", () => {
    const initial: StreakState = {
      count: 5,
      longest: 5,
      lastPlayedDay: "2026-08-03",
      freezeUsedMonth: null,
    };
    const first = completeDaily(initial, at(5), zone);
    expect(first.freezeApplied).toBe(true);

    // A second miss in the same month resets rather than being covered.
    const second = completeDaily(first, at(7), zone);
    expect(second.freezeApplied).toBe(false);
    expect(second.count).toBe(1);
  });

  it("is available again the following month", () => {
    const state: StreakState = {
      count: 9,
      longest: 9,
      lastPlayedDay: "2026-08-30",
      freezeUsedMonth: "2026-08",
    };
    const result = completeDaily(state, Date.UTC(2026, 8, 1, 12, 0, 0), zone);
    expect(result.freezeApplied).toBe(true);
    expect(result.freezeUsedMonth).toBe("2026-09");
  });

  it("does not cover a two-day gap", () => {
    const state: StreakState = {
      count: 5,
      longest: 5,
      lastPlayedDay: "2026-08-01",
      freezeUsedMonth: null,
    };
    const result = completeDaily(state, at(5), zone);
    expect(result.freezeApplied).toBe(false);
    expect(result.count).toBe(1);
  });
});

describe("milestones", () => {
  it.each([3, 7, 14, 30, 60, 100])("celebrates day %i", (day) => {
    expect(isMilestone(day)).toBe(true);
  });

  it.each([1, 2, 4, 8, 31, 99])("does not celebrate day %i", (day) => {
    expect(isMilestone(day)).toBe(false);
  });

  it("reports the milestone on the completion that reaches it", () => {
    const state: StreakState = {
      count: 2,
      longest: 2,
      lastPlayedDay: "2026-08-04",
      freezeUsedMonth: null,
    };
    const result = completeDaily(state, Date.UTC(2026, 7, 5, 12, 0, 0), "UTC");
    expect(result.count).toBe(3);
    expect(result.milestone).toBe(3);
  });
});

describe("currentStreak", () => {
  it("keeps a streak alive on the day it has not yet been defended", () => {
    const state: StreakState = {
      count: 4,
      longest: 4,
      lastPlayedDay: "2026-08-04",
      freezeUsedMonth: null,
    };
    expect(currentStreak(state, Date.UTC(2026, 7, 5, 12), "UTC")).toBe(4);
  });

  it("reports zero once the gap is beyond a freeze", () => {
    const state: StreakState = {
      count: 4,
      longest: 4,
      lastPlayedDay: "2026-08-01",
      freezeUsedMonth: null,
    };
    expect(currentStreak(state, Date.UTC(2026, 7, 5, 12), "UTC")).toBe(0);
  });
});

describe("the share grid is spoiler-free", () => {
  const results: DailySpotResult[] = [
    { spotIndex: 0, grade: "best", evLoss: 0, timeMs: 1000 },
    { spotIndex: 1, grade: "best", evLoss: 0, timeMs: 1000 },
    { spotIndex: 2, grade: "inaccuracy", evLoss: 0.8, timeMs: 1000 },
    { spotIndex: 3, grade: "best", evLoss: 0, timeMs: 1000 },
    { spotIndex: 4, grade: "blunder", evLoss: 4.2, timeMs: 1000 },
  ];

  const text = buildShareText({ dayNumber: 142, results, streak: 12 });

  it("reads as the expected tight format", () => {
    expect(text).toBe("SuitedPoker Daily #142\n🟦🟦🟨🟦🟥  350/500\nStreak: 12 🔥");
  });

  it("reveals NOTHING about which spots were which", () => {
    // Someone who has not played today must learn their friend's score and
    // nothing that would help them.
    for (const leak of [
      "UTG",
      "MP",
      "CO",
      "BTN",
      "SB",
      "BB",
      "fold",
      "call",
      "raise",
      "check",
      "bet",
      "AKs",
      "QQ",
      "72o",
      "flop",
      "turn",
      "river",
      "bb",
      "EV",
      "ev",
    ]) {
      expect(text, `share text leaks "${leak}"`).not.toContain(leak);
    }
  });

  it("carries no exact EV figures", () => {
    expect(text).not.toContain("0.8");
    expect(text).not.toContain("4.2");
  });

  it("omits the streak line entirely at zero", () => {
    const noStreak = buildShareText({ dayNumber: 1, results, streak: 0 });
    expect(noStreak).not.toContain("Streak");
    expect(noStreak.split("\n")).toHaveLength(2);
  });

  it("orders the grid by spot index regardless of input order", () => {
    const shuffled = [...results].reverse();
    expect(buildShareText({ dayNumber: 142, results: shuffled, streak: 12 })).toBe(text);
  });

  it("numbers days from the epoch", () => {
    expect(dayNumberFor("2026-01-01")).toBe(1);
    expect(dayNumberFor("2026-01-02")).toBe(2);
  });
});
