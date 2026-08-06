import { initialRatingFromOnboarding, type ExperienceAnswer, type Rating } from "@/lib/rating";
import type { SkillTier } from "@/lib/explain-policy";

/**
 * The onboarding quiz: its questions, and everything derived from the answers.
 *
 * Pure. No React, no database. The flow renders it, the API route derives from
 * it and the tests assert on it, so there is exactly one description of what
 * the quiz asks and exactly one of what the answers mean.
 *
 * Two rules the copy obeys, both load-bearing:
 *
 *   OPTIONS ARE DESCRIBED BY CONTENT, NEVER BY LABEL. No "Beginner /
 *   Intermediate / Advanced" — nobody knows which they are and everybody
 *   over-rates themselves. "I know which hands to play but freeze after the
 *   flop" is recognised rather than judged.
 *
 *   ANSWERS ECHO FORWARD. Once someone says they play $1/$2, every later
 *   question says "$1/$2" and not "your stakes". Without it the whole thing
 *   reads as a data-collection ritual rather than a conversation.
 */

export type QuestionId =
  "venue" | "pain" | "frequency" | "goal" | "study" | "leaks" | "minutes" | "hand";

export const QUESTION_IDS: readonly QuestionId[] = [
  "venue",
  "pain",
  "frequency",
  "goal",
  "study",
  "leaks",
  "minutes",
  "hand",
];

export const TOTAL_STEPS = QUESTION_IDS.length;

export interface QuizOption {
  readonly value: string;
  readonly label: string;
  /** Substituted into later prompts. Written to read mid-sentence. */
  readonly echo?: string;
}

export interface Question {
  readonly id: QuestionId;
  /** 1-based. The progress bar and the analytics both use it. */
  readonly index: number;
  readonly kind: "single" | "multi" | "text";
  readonly prompt: (answers: Answers) => string;
  readonly options?: readonly QuizOption[];
  readonly optional?: boolean;
  readonly placeholder?: string;
  readonly hint?: string;
}

export interface Answers {
  venue?: string;
  pain?: string;
  frequency?: string;
  goal?: string;
  study?: string;
  leaks?: string[];
  minutes?: string;
  hand?: string;
}

/* ── Options ─────────────────────────────────────────────────────────────── */

const VENUES: readonly QuizOption[] = [
  { value: "home", label: "Home games with friends", echo: "in your home game" },
  { value: "online_micro", label: "Online micro-stakes", echo: "at micro-stakes" },
  { value: "live_1_2", label: "Live casino ($1/$2)", echo: "at $1/$2" },
  { value: "play_money", label: "Play-money apps", echo: "in play money" },
  { value: "starting", label: "I'm just starting out", echo: "when you sit down" },
];

const PAINS: readonly QuizOption[] = [
  { value: "call_too_much", label: "I call too much and lose", echo: "call too much" },
  {
    value: "lost_postflop",
    label: "I have no idea what to do after the flop",
    echo: "freeze after the flop",
  },
  {
    value: "which_hands",
    label: "I don't know which hands to play",
    echo: "aren't sure what to play",
  },
  {
    value: "bluffed_off",
    label: "I get bluffed off good hands",
    echo: "get bluffed off good hands",
  },
  { value: "tilt", label: "I go on tilt and spew", echo: "tilt" },
];

const FREQUENCIES: readonly QuizOption[] = [
  { value: "yearly", label: "A few times a year" },
  { value: "monthly", label: "About monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Most days" },
];

const GOALS: readonly QuizOption[] = [
  { value: "stop_losing", label: "Stop losing money" },
  { value: "beat_friends", label: "Finally beat my friends" },
  { value: "move_up", label: "Move up in stakes" },
  { value: "serious", label: "Take poker seriously" },
];

/** Maps 1:1 onto SkillTier. Two vocabularies here is how a coach mis-pitches. */
const STUDY: readonly QuizOption[] = [
  { value: "never", label: "Never" },
  { value: "videos", label: "Watched some videos" },
  { value: "charts", label: "I've seen range charts" },
  { value: "solver", label: "I've used a solver" },
];

const LEAK_OPTIONS: readonly QuizOption[] = [
  { value: "facing_aggression", label: "Facing a big bet" },
  { value: "blind_defense", label: "Defending my blinds" },
  { value: "out_of_position", label: "Playing out of position" },
  { value: "bluffing", label: "Knowing when to bluff" },
  { value: "bet_sizing", label: "Bet sizing" },
  { value: "tilt_control", label: "Tilt" },
];

const MINUTES: readonly QuizOption[] = [
  { value: "2", label: "2 min" },
  // Anchored: the rest of the funnel talks in fives, so this is the easy pick.
  { value: "5", label: "5 min" },
  { value: "10", label: "10 min" },
  { value: "15", label: "15 min" },
];

/* ── Echoing ─────────────────────────────────────────────────────────────── */

function echoOf(options: readonly QuizOption[], value: string | undefined): string | null {
  if (value === undefined) return null;
  return options.find((o) => o.value === value)?.echo ?? null;
}

export function venueEcho(answers: Answers): string | null {
  return echoOf(VENUES, answers.venue);
}

export function painEcho(answers: Answers): string | null {
  return echoOf(PAINS, answers.pain);
}

/**
 * Every place a later question repeats an earlier answer.
 *
 * Named so the test can enumerate them and print what they render to. An echo
 * that silently stops working degrades into "at your stakes", which is exactly
 * the generic phrasing this exists to avoid.
 */
export const ECHO_POINTS: readonly { question: QuestionId; source: QuestionId }[] = [
  { question: "pain", source: "venue" },
  { question: "frequency", source: "venue" },
  { question: "goal", source: "pain" },
  { question: "leaks", source: "venue" },
  { question: "hand", source: "pain" },
];

/* ── The questions ───────────────────────────────────────────────────────── */

export const QUESTIONS: readonly Question[] = [
  {
    id: "venue",
    index: 1,
    kind: "single",
    prompt: () => "Where do you play most?",
    options: VENUES,
  },
  {
    id: "pain",
    index: 2,
    kind: "single",
    // "Be honest" is doing real work here. It gives permission to pick the
    // embarrassing answer, which is the one worth knowing.
    prompt: (a) => {
      const where = venueEcho(a);
      return where === null
        ? "Be honest — what happens most?"
        : `Be honest — what happens most ${where}?`;
    },
    options: PAINS,
  },
  {
    id: "frequency",
    index: 3,
    kind: "single",
    prompt: (a) => {
      const where = venueEcho(a);
      return where === null ? "How often do you play?" : `How often do you play ${where}?`;
    },
    options: FREQUENCIES,
  },
  {
    id: "goal",
    index: 4,
    kind: "single",
    prompt: (a) => {
      const pain = painEcho(a);
      return pain === null
        ? "What would make this worth it?"
        : `You ${pain}. What would make fixing that worth it?`;
    },
    options: GOALS,
  },
  {
    id: "study",
    index: 5,
    kind: "single",
    prompt: () => "How much have you studied?",
    options: STUDY,
  },
  {
    id: "leaks",
    index: 6,
    kind: "multi",
    prompt: (a) => {
      const where = venueEcho(a);
      return where === null
        ? "Which spots cost you the most?"
        : `Which spots cost you the most ${where}?`;
    },
    hint: "Pick as many as you like.",
    options: LEAK_OPTIONS,
  },
  {
    id: "minutes",
    index: 7,
    kind: "single",
    prompt: () => "How much time do you want to train each day?",
    options: MINUTES,
  },
  {
    id: "hand",
    index: 8,
    kind: "text",
    prompt: (a) => {
      const pain = painEcho(a);
      return pain === null
        ? "Tell me about a hand that still bugs you."
        : `You ${pain}. Tell me about a hand that still bugs you.`;
    },
    placeholder: "You don't need to remember it perfectly.",
    optional: true,
  },
];

export function questionAt(index: number): Question | undefined {
  return QUESTIONS.find((q) => q.index === index);
}

export function optionsFor(id: QuestionId): readonly QuizOption[] {
  return QUESTIONS.find((q) => q.id === id)?.options ?? [];
}

/* ── Progress ────────────────────────────────────────────────────────────── */

/**
 * Progress, as a fraction.
 *
 * Derived from the step index alone and nothing else. Every bar that skips or
 * runs backwards does so because it was computed from something cleverer —
 * answers given, questions remaining, a branch that was not taken.
 */
export function progressAt(index: number): number {
  const clamped = Math.min(TOTAL_STEPS, Math.max(1, index));
  return clamped / TOTAL_STEPS;
}

/** The first unanswered question, for resuming a dropped session. */
export function resumeIndex(answers: Answers): number {
  for (const question of QUESTIONS) {
    if (question.optional) continue;
    if (!isAnswered(question, answers)) return question.index;
  }
  return TOTAL_STEPS;
}

export function isAnswered(question: Question, answers: Answers): boolean {
  const value = answers[question.id];
  if (question.kind === "multi") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value !== "";
}

/* ── Derivation ──────────────────────────────────────────────────────────── */

const TIER_ORDER: readonly SkillTier[] = ["never", "videos", "charts", "solver"];

function capTier(tier: SkillTier, ceiling: SkillTier): SkillTier {
  return TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(ceiling) ? ceiling : tier;
}

/**
 * Skill tier, from Q5 tempered by Q1.
 *
 * Study without table time does not transfer, so someone who has read about
 * solvers but only plays play money is not pitched at like a solver user. The
 * cap is deliberately one-directional: being wrong LOW costs a few easy spots
 * that the rating corrects within twenty hands, while being wrong HIGH makes a
 * beginner's first session feel impossible, and they do not come back to be
 * corrected.
 */
export function deriveSkillTier(answers: Answers): SkillTier {
  const base = (TIER_ORDER.find((t) => t === answers.study) ?? "never") as SkillTier;

  if (answers.venue === "starting") return capTier(base, "never");
  if (answers.venue === "play_money") return capTier(base, "videos");
  return base;
}

export function deriveRating(answers: Answers): Rating {
  // 3.3 owns the placement table. Two copies of it is how a first session gets
  // calibrated against a number nothing else agrees with.
  return initialRatingFromOnboarding(deriveSkillTier(answers) as ExperienceAnswer);
}

const PAIN_TO_LEAK: Record<string, string> = {
  call_too_much: "overcalling",
  lost_postflop: "postflop_fundamentals",
  which_hands: "preflop_ranges",
  bluffed_off: "bluff_catching",
  tilt: "tilt_control",
};

export function derivePrimaryLeak(answers: Answers): string | null {
  return answers.pain === undefined ? null : (PAIN_TO_LEAK[answers.pain] ?? null);
}

/**
 * Everything the arena's leak targeting should weight towards.
 *
 * The Q2 answer leads, because it is the one they volunteered as their worst,
 * then the Q6 picks. Deduplicated — Q2 "tilt" and Q6 "Tilt" are the same leak
 * and counting it twice would double its share of the spot mix.
 */
export function deriveLeakTags(answers: Answers): string[] {
  const primary = derivePrimaryLeak(answers);
  const tags = primary === null ? [] : [primary];
  for (const tag of answers.leaks ?? []) {
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

/**
 * Where the curriculum starts: a LESSON slug from 5.1's curriculum.
 *
 * These must exist in src/content/curriculum — tests/unit/curriculum.test.ts
 * checks every value against the real lesson list, so a renamed lesson fails
 * the build here rather than 404ing a new user's first click.
 */
export const LEAK_TO_LESSON: Record<string, string> = {
  overcalling: "when-to-give-up",
  postflop_fundamentals: "board-texture",
  preflop_ranges: "starting-hands",
  bluff_catching: "ranges-not-hands",
  tilt_control: "the-hands-that-cost-you",
};

export const DEFAULT_MODULE = "starting-hands";

export function deriveCurriculumEntry(answers: Answers): string {
  const leak = derivePrimaryLeak(answers);
  // Someone who has never studied starts at the start whatever they picked —
  // dropping a complete beginner into bluff-catching teaches nothing.
  if (deriveSkillTier(answers) === "never") return DEFAULT_MODULE;
  return leak === null ? DEFAULT_MODULE : (LEAK_TO_LESSON[leak] ?? DEFAULT_MODULE);
}

/** Minutes per day, for the daily challenge target. */
export function deriveDailyMinutes(answers: Answers): number {
  const parsed = Number(answers.minutes);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export interface Derived {
  readonly skillTier: SkillTier;
  readonly rating: number;
  readonly ratingDeviation: number;
  readonly primaryLeakKey: string | null;
  readonly leakTags: readonly string[];
  readonly curriculumEntry: string;
  readonly dailyMinutes: number;
}

export function derive(answers: Answers): Derived {
  const rating = deriveRating(answers);
  return {
    skillTier: deriveSkillTier(answers),
    rating: rating.rating,
    ratingDeviation: rating.rd,
    primaryLeakKey: derivePrimaryLeak(answers),
    leakTags: deriveLeakTags(answers),
    curriculumEntry: deriveCurriculumEntry(answers),
    dailyMinutes: deriveDailyMinutes(answers),
  };
}
