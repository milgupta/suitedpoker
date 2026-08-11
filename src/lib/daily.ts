import type { GradeName } from "@/poker/grader";

/**
 * The daily challenge: five spots, identical for every user.
 *
 * "Identical for everyone" is what makes the leaderboard mean anything and what
 * makes the share grid worth posting. It follows from deriving the seed from
 * the date string alone — no user id, no randomness at request time.
 */

export const DAILY_SPOT_COUNT = 5;
export const MAX_DAILY_SCORE = 500;

/** Score per grade. Sums to 500 for a perfect run. */
export const POINTS_FOR_GRADE: Record<GradeName, number> = {
  sharp: 100,
  best: 100,
  solid: 80,
  inaccuracy: 50,
  mistake: 20,
  blunder: 0,
};

/**
 * The seed for a given date.
 *
 * Derived from the date string alone, so regenerating tomorrow's challenge
 * produces exactly the same five spots — which is what lets the cron be retried
 * safely and what makes the leaderboard fair.
 */
export function seedForDate(dateKey: string): string {
  return `suitedpoker-daily-${dateKey}`;
}

/**
 * Difficulty spread across the five spots.
 *
 * Never five of the same: a run of identical difficulty reads as one spot shown
 * five times, and the challenge has to feel like a tour.
 */
export const DAILY_DIFFICULTIES = [3, 5, 6, 7, 8] as const;

export interface DailySpotResult {
  spotIndex: number;
  grade: GradeName;
  evLoss: number;
  timeMs: number;
}

export interface DailyScore {
  score: number;
  evLossTotal: number;
  totalTimeMs: number;
  sharpCount: number;
}

export function scoreDaily(results: readonly DailySpotResult[]): DailyScore {
  return {
    score: results.reduce((sum, r) => sum + POINTS_FOR_GRADE[r.grade], 0),
    evLossTotal: results.reduce((sum, r) => sum + r.evLoss, 0),
    totalTimeMs: results.reduce((sum, r) => sum + r.timeMs, 0),
    sharpCount: results.filter((r) => r.grade === "sharp").length,
  };
}

/**
 * Leaderboard ordering: score, then total time, then sharp count.
 *
 * Time breaks ties before sharp count because two players on 500 differ far
 * more often in speed than in how many spots they nailed outright.
 */
export function compareEntries(
  a: { score: number; totalTimeMs: number; sharpCount: number },
  b: { score: number; totalTimeMs: number; sharpCount: number },
): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
  return b.sharpCount - a.sharpCount;
}

/* ── The share grid ──────────────────────────────────────────────────────── */

/**
 * Grade to emoji. Deliberately NOT the grade's own colour language — the point
 * is a coarse, spoiler-free signal that reads on any platform.
 */
const SHARE_EMOJI: Record<GradeName, string> = {
  sharp: "🟦",
  best: "🟦",
  solid: "🟩",
  inaccuracy: "🟨",
  mistake: "🟧",
  blunder: "🟥",
};

export interface ShareInput {
  dayNumber: number;
  results: readonly DailySpotResult[];
  streak: number;
}

/**
 * The Wordle-style share text.
 *
 * SPOILER-FREE BY CONSTRUCTION: it carries how well each spot went and nothing
 * about which spot it was — no position, no hand, no action, no board. Someone
 * who has not played today learns their friend's score and nothing that would
 * help them.
 *
 * Kept tight because it has to survive a paste into a group chat.
 */
export function buildShareText(input: ShareInput): string {
  const { score } = scoreDaily(input.results);

  const grid = [...input.results]
    .sort((a, b) => a.spotIndex - b.spotIndex)
    .map((r) => SHARE_EMOJI[r.grade])
    .join("");

  const lines = [`SuitedPoker Daily #${input.dayNumber}`, `${grid}  ${score}/${MAX_DAILY_SCORE}`];
  if (input.streak > 0) lines.push(`Streak: ${input.streak} 🔥`);

  return lines.join("\n");
}

/**
 * Day 1 is the LAUNCH date, so the first subscriber's share text reads
 * "Daily 1" — a day number in the hundreds on day one either looks like a lie
 * or advertises months nobody played. SET THIS TO THE REAL LAUNCH DATE BEFORE
 * GOING LIVE; it is on the checklist in docs/LAUNCH.md, and moving it after
 * launch renumbers everyone's history.
 */
export const DAILY_EPOCH = "2026-08-11";

export function dayNumberFor(dateKey: string, epoch: string = DAILY_EPOCH): number {
  const parse = (key: string): number => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(dateKey) - parse(epoch)) / 86_400_000) + 1;
}
