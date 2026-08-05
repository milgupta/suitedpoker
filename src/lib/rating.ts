/**
 * Glicko-1 rating and adaptive difficulty.
 *
 * Glicko rather than Elo because Elo is both too volatile over a short session
 * and too slow to place a new user. Glicko's rating deviation solves both: a
 * new player with RD 350 moves fast, and a settled player with RD 60 does not
 * swing on one unlucky spot.
 *
 * Pure functions, no I/O — every input is passed in, so this is testable
 * against the published reference values in Glickman's paper.
 */

import type { GradeName } from "@/poker/grader";

/** Glickman's q = ln(10)/400. */
const Q = Math.LN10 / 400;

export const MAX_RD = 350;
export const MIN_RD = 30;

/**
 * Governs how fast uncertainty grows while a user is away. Chosen so an
 * inactive player returns to full uncertainty in roughly a year.
 */
export const RD_GROWTH_C = 34.6;

export interface Rating {
  rating: number;
  rd: number;
}

export interface Outcome {
  /** The spot's difficulty expressed on the rating scale. */
  opponentRating: number;
  opponentRd: number;
  /** 0–1. Not binary — see SCORE_FOR_GRADE. */
  score: number;
}

/**
 * Grade to score.
 *
 * `sharp` scores the same as `best` deliberately. It is recognition, not extra
 * rating — inflating the rating from a cosmetic grade would quietly break
 * difficulty targeting, which is the thing the rating actually drives.
 */
export const SCORE_FOR_GRADE: Record<GradeName, number> = {
  sharp: 1.0,
  best: 1.0,
  solid: 0.8,
  inaccuracy: 0.5,
  mistake: 0.2,
  blunder: 0.0,
};

export function scoreForGrade(grade: GradeName): number {
  return SCORE_FOR_GRADE[grade];
}

/** g(RD) — how much a rating is discounted by its own uncertainty. */
function g(rd: number): number {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

/** Expected score against one opponent. */
function expected(rating: number, opponentRating: number, opponentRd: number): number {
  return 1 / (1 + Math.pow(10, (-g(opponentRd) * (rating - opponentRating)) / 400));
}

/**
 * One Glicko-1 update over a batch of outcomes.
 *
 * Called with a single outcome after every attempt, which is the degenerate but
 * correct case — Glicko's batch form reduces to it cleanly.
 */
export function updateRating(current: Rating, outcomes: readonly Outcome[]): Rating {
  if (outcomes.length === 0) return current;

  let variancePart = 0;
  let improvement = 0;

  for (const outcome of outcomes) {
    const gj = g(outcome.opponentRd);
    const e = expected(current.rating, outcome.opponentRating, outcome.opponentRd);
    variancePart += gj * gj * e * (1 - e);
    improvement += gj * (outcome.score - e);
  }

  const dSquaredInverse = Q * Q * variancePart;
  if (dSquaredInverse === 0) return current;

  const denominator = 1 / (current.rd * current.rd) + dSquaredInverse;
  const rating = current.rating + (Q / denominator) * improvement;
  const rd = Math.sqrt(1 / denominator);

  return {
    rating,
    // The floor stops a very active player's RD collapsing to zero, which would
    // freeze their rating in place.
    rd: Math.min(MAX_RD, Math.max(MIN_RD, rd)),
  };
}

/**
 * Grows RD for time away, so a returning user is re-placed quickly rather than
 * being held to a rating earned six months ago.
 */
export function decayRd(rd: number, daysInactive: number): number {
  if (daysInactive <= 0) return rd;
  return Math.min(MAX_RD, Math.sqrt(rd * rd + RD_GROWTH_C * RD_GROWTH_C * daysInactive));
}

/* ── Placement ───────────────────────────────────────────────────────────── */

export type ExperienceAnswer = "never" | "videos" | "charts" | "solver";

/**
 * The starting rating, from onboarding.
 *
 * 7.1 imports this rather than duplicating the mapping. Two copies of a
 * placement table is how a user's first session ends up calibrated against a
 * number nothing else agrees with.
 */
export function initialRatingFromOnboarding(experience: ExperienceAnswer): Rating {
  const table: Record<ExperienceAnswer, number> = {
    never: 700,
    videos: 850,
    charts: 1000,
    solver: 1200,
  };
  // RD 350 for everyone: self-reported experience is a weak signal, and the
  // first twenty spots should be free to move the number a long way.
  return { rating: table[experience], rd: MAX_RD };
}

/* ── Difficulty ──────────────────────────────────────────────────────────── */

const DIFFICULTY_MIN_RATING = 600;
const DIFFICULTY_MAX_RATING = 1800;

/** Maps the generator's 1–10 difficulty onto the rating scale. */
export function difficultyToRating(difficulty: number): number {
  const clamped = Math.min(10, Math.max(1, difficulty));
  return (
    DIFFICULTY_MIN_RATING + ((clamped - 1) / 9) * (DIFFICULTY_MAX_RATING - DIFFICULTY_MIN_RATING)
  );
}

export function ratingToDifficulty(rating: number): number {
  const clamped = Math.min(DIFFICULTY_MAX_RATING, Math.max(DIFFICULTY_MIN_RATING, rating));
  const raw =
    1 + ((clamped - DIFFICULTY_MIN_RATING) / (DIFFICULTY_MAX_RATING - DIFFICULTY_MIN_RATING)) * 9;
  return Math.round(raw);
}

/**
 * Empirical difficulty, once a node has enough attempts to be trusted.
 *
 * Below the threshold the authored 1–10 estimate stands: a node with four
 * attempts and a 25% success rate tells you about four users, not the node.
 */
export const EMPIRICAL_MIN_ATTEMPTS = 30;

export function empiricalDifficultyRating(
  authoredDifficulty: number,
  attempts: number,
  successRate: number,
): number {
  if (attempts < EMPIRICAL_MIN_ATTEMPTS) return difficultyToRating(authoredDifficulty);

  // Invert the logistic: a spot people beat 70% of the time sits below the
  // average rating of the people attempting it.
  const clamped = Math.min(0.99, Math.max(0.01, successRate));
  const offset = -400 * Math.log10(clamped / (1 - clamped));
  return Math.min(
    DIFFICULTY_MAX_RATING,
    Math.max(DIFFICULTY_MIN_RATING, difficultyToRating(authoredDifficulty) + offset * 0.5),
  );
}

/* ── Adaptive selection ──────────────────────────────────────────────────── */

/** Aim slightly above the user, for a ~70% best-or-solid rate. */
export const TARGET_OFFSET = 50;
export const TILT_DROP = 150;
export const TILT_STREAK = 3;
export const LEAK_TARGET_SHARE = 0.3;

export interface SelectionInput {
  rating: number;
  /** Most recent last. Only the tail matters. */
  recentGrades: readonly GradeName[];
  /** 0–1, from a seeded RNG so selection is reproducible in tests. */
  roll: number;
  leakTags: readonly string[];
}

export interface Selection {
  targetRating: number;
  targetDifficulty: number;
  /** Set when leak targeting fired, so the UI can show the chip. */
  leakTag: string | null;
  tilted: boolean;
}

function isWrong(grade: GradeName): boolean {
  return grade === "inaccuracy" || grade === "mistake" || grade === "blunder";
}

/**
 * Picks the difficulty for the next spot.
 *
 * Two rules beyond "aim at the user's level":
 *
 *   Anti-tilt — after three consecutive wrong answers, drop 150. Beginners quit
 *   when they feel stupid, and this product's entire audience is beginners.
 *
 *   Leak targeting — about 30% of spots aim at a detected weakness, so practice
 *   is targeted rather than random. The UI says when this fires; silently
 *   feeding someone their worst spot reads as the app being unfair.
 */
export function selectNextDifficulty(input: SelectionInput): Selection {
  const tail = input.recentGrades.slice(-TILT_STREAK);
  const tilted = tail.length === TILT_STREAK && tail.every(isWrong);

  const targetRating = input.rating + TARGET_OFFSET - (tilted ? TILT_DROP : 0);

  const leakTag =
    input.leakTags.length > 0 && input.roll < LEAK_TARGET_SHARE
      ? (input.leakTags[
          Math.floor(input.roll * input.leakTags.length * (1 / LEAK_TARGET_SHARE)) %
            input.leakTags.length
        ] ?? null)
      : null;

  return {
    targetRating,
    targetDifficulty: ratingToDifficulty(targetRating),
    leakTag,
    tilted,
  };
}

/* ── Tiers ───────────────────────────────────────────────────────────────── */

export interface Tier {
  readonly name: string;
  readonly min: number;
}

export const TIERS: readonly Tier[] = [
  { name: "Fish", min: 0 },
  { name: "Beginner", min: 800 },
  { name: "Recreational", min: 1000 },
  { name: "Solid", min: 1200 },
  { name: "Strong", min: 1400 },
  { name: "Crusher", min: 1600 },
];

export function tierFor(rating: number): Tier {
  let current = TIERS[0] as Tier;
  for (const tier of TIERS) {
    if (rating >= tier.min) current = tier;
  }
  return current;
}

/** True when an update crossed a tier boundary upward — a celebratory moment. */
export function tieredUp(before: number, after: number): boolean {
  return tierFor(after).min > tierFor(before).min;
}
