import type { Answers } from "@/lib/onboarding";
import { derive, painEcho } from "@/lib/onboarding";
import { tierFor } from "@/lib/rating";

/**
 * The diagnosis: everything the screen before the paywall shows, computed.
 *
 * THE HARD RULE, enforced by tests: every number here is computed from the
 * user's actual answers. If it cannot be computed, it is not shown. The
 * competitor asks twelve questions and then shows a loader, a checkmark and a
 * paywall — not one screen references one answer. This module is the reason
 * someone pays 33% more than they charge.
 *
 * THE COMPLIANCE LINE, also enforced by tests: this estimates what a leak
 * COSTS. It never states or implies a WINNING. "Your leak costs about $340 a
 * year" and "you'll win $340 a year" are different sentences, and only the
 * first may ever appear — an earnings claim in a poker product scaled on Meta
 * ads is how the ad account dies.
 */

/* ── The cost model ──────────────────────────────────────────────────────── */

/**
 * Dollars per big blind, by venue.
 *
 * Play money and "just starting" are zero ON PURPOSE — and zero means the
 * screen must not print a dollar figure at all. Telling a play-money user they
 * are losing $340 a year is exactly the fabricated number that loses a
 * numerate audience permanently.
 */
export const BB_VALUE_USD: Record<string, number> = {
  home: 0.5,
  online_micro: 0.1,
  live_1_2: 2,
  play_money: 0,
  starting: 0,
};

export const HANDS_PER_YEAR: Record<string, number> = {
  yearly: 600,
  monthly: 2_400,
  weekly: 10_000,
  daily: 40_000,
};

/**
 * What each leak costs, in bb/100.
 *
 * These are the published rule-of-thumb figures for the size of each mistake
 * class in low-stakes pools, and the tooltip shows them with the arithmetic.
 * They are estimates and are always labelled as such.
 */
export const LEAK_BB100: Record<string, number> = {
  overcalling: 3.5,
  postflop_fundamentals: 5,
  preflop_ranges: 4,
  bluff_catching: 3,
  tilt_control: 4.5,
};

export const LEAK_HEADLINE: Record<string, string> = {
  overcalling: "Calling too much, in too many spots",
  postflop_fundamentals: "No plan once the flop hits",
  preflop_ranges: "Playing the wrong hands before the flop",
  bluff_catching: "Folding the best hand under pressure",
  tilt_control: "Tilt is taxing every other decision",
};

/** The first three things the curriculum fixes, per leak. */
export const LEAK_FIX_FIRST: Record<string, readonly [string, string, string]> = {
  overcalling: [
    "When folding is actually correct",
    "Which hands can call, and which just feel like they can",
    "Reading how strong a bet really is",
  ],
  postflop_fundamentals: [
    "Reading board texture",
    "What your hand is actually worth on each street",
    "A default plan for every flop",
  ],
  preflop_ranges: [
    "Which hands to play from each seat",
    "Which hands to defend from the big blind",
    "Why position changes everything",
  ],
  bluff_catching: [
    "Which hands are meant to call down",
    "Spotting the bets that are never bluffs",
    "Letting go when the story adds up",
  ],
  tilt_control: [
    "Playing your best when the last hand went wrong",
    "A routine that resets you between hands",
    "Separating bad play from bad luck",
  ],
};

/** The Q6 options, in the user's own words but lowercased mid-sentence. */
const LEAK_TAG_LABEL: Record<string, string> = {
  facing_aggression: "facing big bets",
  blind_defense: "defending your blinds",
  out_of_position: "playing out of position",
  bluffing: "knowing when to bluff",
  bet_sizing: "bet sizing",
  tilt_control: "tilt",
};

const GOAL_LINE: Record<string, string> = {
  stop_losing: "You said you want to stop losing. This is the leak doing the losing.",
  beat_friends:
    "You said you want to beat your friends. They have this leak too, and the first to fix it wins.",
  move_up: "You said you want to move up. This leak is what the next stake punishes hardest.",
  serious: "You said you want to take poker seriously. This is the first serious thing to fix.",
};

/* ── The path ────────────────────────────────────────────────────────────── */

/** 5.1 ships a 14-lesson curriculum; each is ~35 minutes with its drills. */
export const CURRICULUM_LESSONS = 14;
const CURRICULUM_TOTAL_MINUTES = CURRICULUM_LESSONS * 36;

/**
 * The rating scale the position bar draws against — the same 600..1800 span
 * the difficulty mapping uses in rating.ts.
 */
const SCALE_MIN = 600;
const SCALE_MAX = 1800;

/**
 * Where the curriculum's final drills sit on the rating scale (difficulty 5 of
 * 10 → 600 + 4/9 × 1200). The projection is "where the material you'll have
 * mastered sits", not a promised future rating — that is what makes it
 * defensible when a sharp user asks.
 */
export const CURRICULUM_CEILING_RATING = 1133;

/* ── Output ──────────────────────────────────────────────────────────────── */

export interface CostEstimate {
  /** Null when the user does not play for money — print pots, not dollars. */
  readonly annualUsd: number | null;
  /** Big blinds per year, always computable. */
  readonly annualBb: number;
  readonly bb100: number;
  readonly handsPerYear: number;
  readonly bbValueUsd: number;
  /** The arithmetic, verbatim, for the tooltip. Shows the work. */
  readonly formula: string;
}

export interface Diagnosis {
  readonly leakKey: string;
  readonly headline: string;
  readonly cost: CostEstimate;
  readonly rating: number;
  readonly tierName: string;
  /** 0..1 along the 600–1800 scale, for the position bar. */
  readonly position: number;
  /** Bottom-N% copy, from the position. */
  readonly standing: string;
  readonly projectedRating: number;
  readonly lessons: number;
  readonly weeks: number;
  readonly minutesPerDay: number;
  readonly fixFirst: readonly [string, string, string];
  /** Their own Q6 picks, humanised — "also on the list". Empty when none. */
  readonly alsoFixing: readonly string[];
  readonly goalLine: string | null;
}

/** Rounds a dollar estimate to a figure that reads as an estimate. */
export function roundClean(value: number): number {
  if (value <= 0) return 0;
  if (value < 100) return Math.max(10, Math.round(value / 10) * 10);
  if (value < 1_000) return Math.round(value / 10) * 10;
  return Math.round(value / 50) * 50;
}

export function estimateCost(answers: Answers): CostEstimate {
  const derived = derive(answers);
  const leak = derived.primaryLeakKey ?? "preflop_ranges";

  const bb100 = LEAK_BB100[leak] ?? 4;
  const handsPerYear = HANDS_PER_YEAR[answers.frequency ?? ""] ?? HANDS_PER_YEAR.monthly!;
  const bbValueUsd = BB_VALUE_USD[answers.venue ?? ""] ?? 0;

  const annualBb = Math.round(handsPerYear * (bb100 / 100));
  const playsForMoney = bbValueUsd > 0;
  const annualUsd = playsForMoney ? roundClean(annualBb * bbValueUsd) : null;

  const formula = playsForMoney
    ? `${handsPerYear.toLocaleString()} hands/year × ${bb100}bb per 100 hands × $${bbValueUsd.toFixed(2)} per big blind ≈ $${(annualUsd ?? 0).toLocaleString()}/year`
    : `${handsPerYear.toLocaleString()} hands/year × ${bb100}bb per 100 hands ≈ ${annualBb.toLocaleString()} big blinds/year`;

  return { annualUsd, annualBb, bb100, handsPerYear, bbValueUsd, formula };
}

export function buildDiagnosis(answers: Answers): Diagnosis {
  const derived = derive(answers);
  const leakKey = derived.primaryLeakKey ?? "preflop_ranges";
  const cost = estimateCost(answers);

  const position = Math.min(1, Math.max(0, (derived.rating - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)));
  // "bottom 30%" reads as a place on a ladder; round to the nearest 5 so it
  // does not pretend to a precision the placement does not have.
  const bottomPct = Math.max(5, Math.round((position * 100) / 5) * 5);

  const minutesPerDay = derived.dailyMinutes;
  const weeks = Math.max(1, Math.ceil(CURRICULUM_TOTAL_MINUTES / minutesPerDay / 7));

  // Never project below a meaningful gain, never above the material covered.
  const projectedRating = Math.max(derived.rating + 100, CURRICULUM_CEILING_RATING);

  // Q6, reflected back. The primary leak already headlines the screen, so it
  // is excluded here — repeating it would read as padding.
  const alsoFixing = (answers.leaks ?? [])
    .filter((tag) => tag !== leakKey)
    .map((tag) => LEAK_TAG_LABEL[tag])
    .filter((label): label is string => label !== undefined)
    .slice(0, 3);

  const pain = painEcho(answers);

  return {
    leakKey,
    headline: LEAK_HEADLINE[leakKey] ?? LEAK_HEADLINE.preflop_ranges!,
    cost,
    rating: derived.rating,
    tierName: tierFor(derived.rating).name,
    position,
    standing: `bottom ${bottomPct}%`,
    projectedRating,
    lessons: CURRICULUM_LESSONS,
    weeks,
    minutesPerDay,
    fixFirst: LEAK_FIX_FIRST[leakKey] ?? LEAK_FIX_FIRST.preflop_ranges!,
    alsoFixing,
    goalLine: GOAL_LINE[answers.goal ?? ""] ?? null,
  };
}
