import type { GradeName, Street } from "@/poker/grader";

/**
 * The dashboard's arithmetic, pure.
 *
 * Every figure on the home screen is computed here from raw attempt rows, so
 * each one is checkable against a hand count in a test rather than trusted
 * because it looked plausible on screen. The server module does the querying;
 * this does the maths.
 */

export interface AttemptRow {
  readonly grade: GradeName;
  readonly evLoss: number;
  readonly street: Street;
  readonly chosenAction: string;
  readonly bestAction: string;
  readonly timeMs: number;
  readonly createdAt: Date;
}

/** Grades that count as "got it right" for the accuracy figure. */
export const CORRECT_GRADES: readonly GradeName[] = ["sharp", "best", "solid"];

export function isCorrect(grade: GradeName): boolean {
  return CORRECT_GRADES.includes(grade);
}

export function accuracyOf(rows: readonly AttemptRow[]): number {
  if (rows.length === 0) return 0;
  return rows.filter((r) => isCorrect(r.grade)).length / rows.length;
}

/**
 * bb lost per 100 decisions.
 *
 * Reported as a POSITIVE cost — "you lose 4.2bb/100" — because that reads
 * unambiguously to a beginner, where a negative number invites "negative loss,
 * so… good?". The tile marks it `higherIsBetter: false`.
 */
export function evLostPer100(rows: readonly AttemptRow[]): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((sum, r) => sum + r.evLoss, 0);
  return (total / rows.length) * 100;
}

/** Voluntarily-put-money-in, over drill decisions that offered the choice. */
export function vpipOf(rows: readonly AttemptRow[]): number {
  const preflop = rows.filter((r) => r.street === "preflop");
  if (preflop.length === 0) return 0;
  const voluntary = preflop.filter(
    (r) => r.chosenAction === "call" || r.chosenAction === "raise" || r.chosenAction === "bet",
  );
  return voluntary.length / preflop.length;
}

export function pfrOf(rows: readonly AttemptRow[]): number {
  const preflop = rows.filter((r) => r.street === "preflop");
  if (preflop.length === 0) return 0;
  return preflop.filter((r) => r.chosenAction === "raise").length / preflop.length;
}

export const STREETS: readonly Street[] = ["preflop", "flop", "turn", "river"];

export interface StreetAccuracy {
  readonly street: Street;
  readonly accuracy: number;
  readonly attempts: number;
}

/**
 * Accuracy per street — the single most diagnostic view in the product.
 *
 * "Where am I losing it?" is the question a beginner actually has, and this is
 * the only screen that answers it directly. A street with no attempts reports
 * zero attempts rather than 0% accuracy: never tell someone they are bad at
 * something they have not tried.
 */
export function streetAccuracy(rows: readonly AttemptRow[]): StreetAccuracy[] {
  return STREETS.map((street) => {
    const inStreet = rows.filter((r) => r.street === street);
    return {
      street,
      accuracy: accuracyOf(inStreet),
      attempts: inStreet.length,
    };
  });
}

export interface Period {
  readonly hands: number;
  readonly accuracy: number;
  readonly evLostPer100: number;
  readonly minutesStudied: number;
}

export function summarise(rows: readonly AttemptRow[]): Period {
  return {
    hands: rows.length,
    accuracy: accuracyOf(rows),
    evLostPer100: evLostPer100(rows),
    minutesStudied: Math.round(rows.reduce((sum, r) => sum + r.timeMs, 0) / 60_000),
  };
}

export function within(rows: readonly AttemptRow[], from: Date, to: Date): AttemptRow[] {
  return rows.filter((r) => r.createdAt >= from && r.createdAt < to);
}

export interface WeekComparison {
  readonly thisWeek: Period;
  readonly lastWeek: Period;
}

export function weekOverWeek(rows: readonly AttemptRow[], now: Date): WeekComparison {
  const week = 7 * 24 * 60 * 60 * 1000;
  const startOfThis = new Date(now.getTime() - week);
  const startOfLast = new Date(now.getTime() - 2 * week);

  return {
    thisWeek: summarise(within(rows, startOfThis, now)),
    lastWeek: summarise(within(rows, startOfLast, startOfThis)),
  };
}

/**
 * A 30-day rating sparkline.
 *
 * Points are daily closes; days with no play repeat the previous value rather
 * than dropping to zero, because a flat line means "did not play" and a cliff
 * to zero means "something is broken".
 */
export function sparkline(
  points: readonly { at: Date; rating: number }[],
  currentRating: number,
  now: Date,
  days = 30,
): number[] {
  const series: number[] = [];
  let last = points[0]?.rating ?? currentRating;

  for (let day = days - 1; day >= 0; day--) {
    const end = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
    const upTo = points.filter((p) => p.at <= end);
    const latest = upTo[upTo.length - 1];
    if (latest !== undefined) last = latest.rating;
    series.push(last);
  }

  return series;
}

/** Enough data to say something true about someone's game. */
export const MIN_HANDS_FOR_LEAKS = 50;

/**
 * Below this, accuracy / VPIP / PFR / bb/100 are early estimates — real enough
 * to show with a sample-size caption, not mature enough to look like a report.
 * Leaks stay gated separately at {@link MIN_HANDS_FOR_LEAKS}.
 */
export const MIN_HANDS_FOR_STATS = 20;

export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

const GOAL_LINE: Record<string, string> = {
  stop_losing: "stop losing money",
  beat_friends: "beat your friends",
  move_up: "move up in stakes",
  serious: "take poker seriously",
};

export function goalLine(goal: string | null | undefined): string | null {
  return goal == null ? null : (GOAL_LINE[goal] ?? null);
}
