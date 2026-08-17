import { FAMILY_LABELS, QUIZ_FAMILIES, type QuizFamily } from "@/poker/quiz";

/**
 * The quiz breakdown, as pure arithmetic.
 *
 * Separate from `dashboard.ts` on purpose, the same way `quiz_attempts` is
 * separate from `drill_attempts`. Everything on the dashboard is denominated in
 * EV loss and feeds a rating; none of that applies to a right/wrong count, and
 * mixing the two would put a number on screen that means two things at once.
 */

export interface QuizAttemptRow {
  readonly family: string;
  readonly correct: boolean;
}

export interface FamilyBreakdown {
  readonly family: QuizFamily;
  readonly label: string;
  readonly attempts: number;
  /** Percent correct, 0-100. Zero attempts reports null, never 0%. */
  readonly accuracy: number | null;
}

export interface QuizStats {
  readonly totalAnswered: number;
  readonly totalCorrect: number;
  /** Percent correct overall, or null before anything has been answered. */
  readonly accuracy: number | null;
  readonly families: readonly FamilyBreakdown[];
  /** The weakest family with enough attempts to say so, or null. */
  readonly weakest: FamilyBreakdown | null;
}

/**
 * Attempts before a family's accuracy is worth reporting as a weakness.
 *
 * Five is low, and deliberately: this is a three-option quiz, so guessing alone
 * scores 33%, and a run of two is noise at any threshold. What the floor really
 * protects against is the dashboard's own lesson — never tell somebody they are
 * bad at something they have barely tried. Below it the row still shows its
 * attempt count; it just cannot be named the weakest.
 */
export const MIN_ATTEMPTS_FOR_WEAKEST = 5;

function isFamily(value: string): value is QuizFamily {
  return (QUIZ_FAMILIES as readonly string[]).includes(value);
}

export function quizStats(rows: readonly QuizAttemptRow[]): QuizStats {
  const attempts = new Map<QuizFamily, { total: number; correct: number }>();
  for (const family of QUIZ_FAMILIES) attempts.set(family, { total: 0, correct: 0 });

  let totalAnswered = 0;
  let totalCorrect = 0;
  for (const row of rows) {
    // A family that no longer exists is skipped rather than crashing the page:
    // renaming one must not break the history of everybody who answered it.
    if (!isFamily(row.family)) continue;
    const bucket = attempts.get(row.family)!;
    bucket.total += 1;
    totalAnswered += 1;
    if (row.correct) {
      bucket.correct += 1;
      totalCorrect += 1;
    }
  }

  const families: FamilyBreakdown[] = QUIZ_FAMILIES.map((family) => {
    const bucket = attempts.get(family)!;
    return {
      family,
      label: FAMILY_LABELS[family],
      attempts: bucket.total,
      // Null rather than 0 — an untouched family has no accuracy, and printing
      // "0%" next to something nobody has tried reads as a failure.
      accuracy: bucket.total === 0 ? null : Math.round((100 * bucket.correct) / bucket.total),
    };
  });

  const eligible = families
    .filter((f) => f.attempts >= MIN_ATTEMPTS_FOR_WEAKEST && f.accuracy !== null)
    .sort((a, b) => a.accuracy! - b.accuracy! || b.attempts - a.attempts);

  return {
    totalAnswered,
    totalCorrect,
    accuracy: totalAnswered === 0 ? null : Math.round((100 * totalCorrect) / totalAnswered),
    families,
    weakest: eligible[0] ?? null,
  };
}
