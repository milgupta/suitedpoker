/**
 * The poker-maths quiz.
 *
 * ── WHAT MAKES THIS MODE DIFFERENT ───────────────────────────────────────────
 *
 * Every other graded surface in this product scores a DECISION against a
 * strategy that is an authored approximation. This one asks a counting
 * question with exactly one right answer, and `src/poker/odds.ts` computes it
 * exactly. No solver, no confidence rating, no "treat the magnitude as
 * approximate" caveat: the answer is arithmetic.
 *
 * That is also why quiz results deliberately do NOT feed drill accuracy or the
 * Glicko rating. `questions.ts` says every question type grades through the
 * EV-loss grader so one accuracy number stays comparable — and forcing a
 * right/wrong percentage through it would mean INVENTING an EV loss for a
 * wrong answer, which is the exact species of fabricated number the rest of
 * this codebase refuses. Keeping the quiz on its own metric honours the rule's
 * purpose rather than its letter.
 *
 * ── THE DISTRACTORS ARE THE TEACHING ─────────────────────────────────────────
 *
 * A wrong option here is never noise. Each one is a specific, nameable mistake
 * — counting one card when two are coming, adding the streets without removing
 * the overlap, reading "12 outs" as "12%". A player who picks one has revealed
 * which misconception they hold, and the explanation names it back to them.
 * Random wrong numbers would make this a test; designed ones make it a lesson.
 */

import { type Card, cardsFromString, createRng, randomInt, type Rng } from "./cards";
import {
  asPercent,
  DRAW_LABELS,
  DRAW_OUTS,
  drawCompletes,
  type DrawKind,
  equityNeeded,
  flopContainsAny,
  flopContainsNone,
  pocketPairFlopsSet,
  unpairedHandPairs,
} from "./odds";

export const QUIZ_FAMILIES = [
  "draw_completion",
  "draw_one_card",
  "overcard",
  "flop_miss",
  "set_mine",
  "flop_pair",
  "pot_odds",
] as const;

export type QuizFamily = (typeof QUIZ_FAMILIES)[number];

export const FAMILY_LABELS: Record<QuizFamily, string> = {
  draw_completion: "Draw odds",
  draw_one_card: "One card to come",
  overcard: "Overcards",
  flop_miss: "Missing the flop",
  set_mine: "Set mining",
  flop_pair: "Flopping a pair",
  pot_odds: "Pot odds",
};

/** The server's view. Never serialise this — use `toClientQuestion`. */
export interface QuizQuestion {
  readonly id: string;
  readonly seed: string;
  readonly family: QuizFamily;
  /** The headline, in plain English. */
  readonly prompt: string;
  /** The small clarifying line — what exactly is being counted. */
  readonly clarifier: string;
  readonly heroCards: readonly Card[];
  readonly board: readonly Card[];
  /** Whole percentages, in display order. */
  readonly options: readonly number[];
  readonly correctIndex: number;
  /** The unrounded truth, for the explanation. */
  readonly exactPercent: number;
  readonly explanation: string;
}

/**
 * What may reach a browser. Derived by omission, exactly like `ClientSpot`:
 * adding a field to `QuizQuestion` cannot silently expose it.
 */
export type ClientQuizQuestion = Omit<
  QuizQuestion,
  "seed" | "correctIndex" | "exactPercent" | "explanation"
>;

type ForbiddenOnClient = "seed" | "correctIndex" | "exactPercent" | "explanation" | "answer";
type NoAnswerData<T> = Extract<keyof T, ForbiddenOnClient> extends never ? T : never;

// Compile-time guard. If ClientQuizQuestion ever gains the answer, this stops
// compiling — `npm run typecheck` is part of the boundary, not a style gate.
type ClientQuestionIsClean = NoAnswerData<ClientQuizQuestion>;
const _clientQuestionIsClean: ClientQuestionIsClean | null = null;
void _clientQuestionIsClean;

export function toClientQuestion(question: QuizQuestion): ClientQuizQuestion {
  const {
    seed: _seed,
    correctIndex: _correctIndex,
    exactPercent: _exactPercent,
    explanation: _explanation,
    ...client
  } = question;
  return client;
}

// ── Scenarios ────────────────────────────────────────────────────────────────

/**
 * Concrete hands that really do have the draw they claim.
 *
 * Authored rather than searched, and every one is checked by
 * `tests/unit/poker/quiz.test.ts` against the REAL classifier. A question that
 * says "you flopped the open-ender" over a hand that is not one would be the
 * same class of defect as the coach describing a board it was never given —
 * fluent, confident and false.
 */
interface DrawScenario {
  readonly hole: string;
  readonly board: string;
  readonly kind: DrawKind;
}

export const DRAW_SCENARIOS: readonly DrawScenario[] = [
  { hole: "Jh Th", board: "8s 9d 2c", kind: "open_ended" },
  { hole: "9c 8c", board: "7h 6d Ks", kind: "open_ended" },
  { hole: "Ah Kh", board: "7h 2h 9c", kind: "flush_draw" },
  { hole: "Qs Js", board: "4s 8s Kd", kind: "flush_draw" },
  { hole: "Kd Qc", board: "Js 9h 2c", kind: "gutshot" },
  { hole: "9h 8h", board: "7h 6c 2h", kind: "combo_draw" },
];

/** Pocket pairs low enough that an overcard is the interesting question. */
const OVERCARD_HANDS: readonly { hole: string; overRanks: number }[] = [
  // `overRanks` counts the RANKS above the pair. Cards = ranks * 4, minus none
  // held: the pair itself blocks nothing above it.
  { hole: "Jh Js", overRanks: 3 },
  { hole: "Th Ts", overRanks: 4 },
  { hole: "9h 9s", overRanks: 5 },
  { hole: "Qh Qs", overRanks: 2 },
];

const BIG_CARD_HANDS: readonly string[] = ["As Kd", "Ah Qc", "Ks Qh", "Ad Jc"];
const POCKET_PAIRS: readonly string[] = ["7h 7s", "5c 5d", "9h 9c", "3s 3h"];

/** Pot-odds scenarios in whole chips, the product's display unit. */
const POT_ODDS_SCENARIOS: readonly { pot: number; bet: number }[] = [
  { pot: 10, bet: 5 },
  { pot: 12, bet: 12 },
  { pot: 20, bet: 10 },
  { pot: 16, bet: 8 },
  { pot: 14, bet: 7 },
];

// ── Distractors ──────────────────────────────────────────────────────────────

/**
 * The smallest gap between two options, in percentage points.
 *
 * Three answers that read 31, 34 and 35 are not three answers — they are one
 * answer and two typos, and a player who guesses right learns nothing. A
 * distractor has to be far enough away that PICKING it is a statement about
 * what you believed.
 */
const MIN_OPTION_GAP = 7;

/**
 * Build two wrong answers around a right one.
 *
 * `candidates` arrive in order of pedagogical value — the most instructive
 * misconception first — and the first that clears `MIN_OPTION_GAP` from the
 * correct answer AND from the other distractor is taken. The fallbacks at the
 * end are deliberately unprincipled: they exist so this function always returns
 * three legible options, and they are only ever reached when every real
 * misconception lands too close to the truth to be worth offering.
 */
function distractorsFor(correct: number, candidates: readonly number[]): [number, number] {
  const clamp = (n: number) => Math.max(1, Math.min(99, Math.round(n)));
  const usable = (n: number, taken: readonly number[]) =>
    Math.abs(n - correct) >= MIN_OPTION_GAP &&
    taken.every((t) => Math.abs(n - t) >= MIN_OPTION_GAP);

  const chosen: number[] = [];
  for (const candidate of candidates) {
    const value = clamp(candidate);
    if (usable(value, chosen)) chosen.push(value);
    if (chosen.length === 2) break;
  }

  // Fallbacks, pushed outward until they are legible. `below` walks down and
  // `above` walks up so they can never collide with each other.
  let below = correct - MIN_OPTION_GAP * 2;
  while (chosen.length < 2 && below > 1) {
    const value = clamp(below);
    if (usable(value, chosen)) chosen.push(value);
    below -= MIN_OPTION_GAP;
  }
  let above = correct + MIN_OPTION_GAP * 2;
  while (chosen.length < 2 && above < 99) {
    const value = clamp(above);
    if (usable(value, chosen)) chosen.push(value);
    above += MIN_OPTION_GAP;
  }

  return [chosen[0] ?? clamp(correct + MIN_OPTION_GAP * 2), chosen[1] ?? clamp(1)];
}

/** Shuffle the three options deterministically and report where the truth went. */
function layout(
  correct: number,
  wrong: readonly [number, number],
  rng: Rng,
): { options: number[]; correctIndex: number } {
  const options = [correct, wrong[0], wrong[1]];
  for (let i = options.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const a = options[i]!;
    const b = options[j]!;
    options[i] = b;
    options[j] = a;
  }
  return { options, correctIndex: options.indexOf(correct) };
}

function pick<T>(items: readonly T[], rng: Rng): T {
  const item = items[randomInt(rng, items.length)];
  if (item === undefined) throw new RangeError("cannot pick from an empty list");
  return item;
}

function questionId(family: string, seed: string): string {
  let hash = 0x811c9dc5;
  const text = `${family}#${seed}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

// ── Generation ───────────────────────────────────────────────────────────────

export interface QuizConfig {
  /** Restrict to one family. Absent means any. */
  family?: QuizFamily;
}

export function generateQuizQuestion(config: QuizConfig, seed: number | string): QuizQuestion {
  const seedText = String(seed);
  const rng = createRng(seedText);
  const family = config.family ?? pick(QUIZ_FAMILIES, rng);

  switch (family) {
    case "draw_completion":
      return drawQuestion(seedText, rng, 2);
    case "draw_one_card":
      return drawQuestion(seedText, rng, 1);
    case "overcard":
      return overcardQuestion(seedText, rng);
    case "flop_miss":
      return flopMissQuestion(seedText, rng);
    case "set_mine":
      return setMineQuestion(seedText, rng);
    case "flop_pair":
      return flopPairQuestion(seedText, rng);
    case "pot_odds":
      return potOddsQuestion(seedText, rng);
  }
}

function drawQuestion(seed: string, rng: Rng, toCome: 1 | 2): QuizQuestion {
  const scenario = pick(DRAW_SCENARIOS, rng);
  const outs = DRAW_OUTS[scenario.kind];
  const unseen = toCome === 2 ? 47 : 46;
  const exact = drawCompletes(outs, toCome, unseen);
  const correct = asPercent(exact.probability);

  const oneCard = asPercent(outs / unseen);
  // Adding the streets without removing the runouts that hit twice — the most
  // common two-card error there is.
  const naiveSum = asPercent(outs / 47 + outs / 46);
  const ruleOfFour = outs * 4;

  const family: QuizFamily = toCome === 2 ? "draw_completion" : "draw_one_card";
  const wrong =
    toCome === 2
      ? distractorsFor(correct, [oneCard, naiveSum, ruleOfFour, correct * 1.45])
      : distractorsFor(correct, [
          asPercent(drawCompletes(outs, 2, 47).probability),
          outs * 4,
          outs,
        ]);

  const { options, correctIndex } = layout(correct, wrong, rng);
  const label = DRAW_LABELS[scenario.kind];
  const street = toCome === 2 ? "by the river" : "on the river";

  return {
    id: questionId(family, seed),
    seed,
    family,
    prompt:
      toCome === 2
        ? `You flopped the ${label}. How often does it get there by the river?`
        : `You still have the ${label} on the turn. How often does it hit on the river?`,
    clarifier:
      toCome === 2
        ? `${String(outs)} outs · two cards to come`
        : `${String(outs)} outs · one card to come`,
    heroCards: cardsFromString(scenario.hole),
    board: cardsFromString(scenario.board),
    options,
    correctIndex,
    exactPercent: exact.probability * 100,
    explanation:
      `${String(outs)} outs, ${toCome === 2 ? "two cards" : "one card"} to come. Count the times it MISSES ` +
      `and subtract: ${String(exact.total - exact.favourable)} of the ${String(exact.total)} runouts miss, so it gets there ` +
      `${String(asPercent(exact.probability, 1))}% of the time ${street}.` +
      (toCome === 2
        ? ` Adding the two streets separately gives ${String(naiveSum)}%, which double-counts the runouts that hit twice.`
        : ""),
  };
}

function overcardQuestion(seed: string, rng: Rng): QuizQuestion {
  const hand = pick(OVERCARD_HANDS, rng);
  const cards = hand.overRanks * 4;
  const exact = flopContainsAny(cards);
  const correct = asPercent(exact.probability);

  const wrong = distractorsFor(correct, [
    asPercent(cards / 50),
    asPercent((cards / 50) * 3),
    correct * 1.35,
  ]);
  const { options, correctIndex } = layout(correct, wrong, rng);

  return {
    id: questionId("overcard", seed),
    seed,
    family: "overcard",
    prompt: "How often does an overcard hit the flop?",
    clarifier: `${String(cards)} cards beat your pair · three flop cards`,
    heroCards: cardsFromString(hand.hole),
    board: [],
    options,
    correctIndex,
    exactPercent: exact.probability * 100,
    explanation:
      `${String(cards)} cards in the deck are bigger than your pair. The flop avoids all of them ` +
      `${String(asPercent(1 - exact.probability, 1))}% of the time, so an overcard arrives ` +
      `${String(asPercent(exact.probability, 1))}% of the time. It is far more often than it feels, which is why ` +
      `a pair this size plays better in a small pot than a big one.`,
  };
}

function flopMissQuestion(seed: string, rng: Rng): QuizQuestion {
  const hole = pick(BIG_CARD_HANDS, rng);
  const exact = flopContainsNone(6);
  const correct = asPercent(exact.probability);

  const wrong = distractorsFor(correct, [
    asPercent(1 - exact.probability),
    asPercent(6 / 50),
    correct * 0.72,
  ]);
  const { options, correctIndex } = layout(correct, wrong, rng);

  return {
    id: questionId("flop_miss", seed),
    seed,
    family: "flop_miss",
    prompt: "How often does the flop completely miss this hand?",
    clarifier: "Misses = neither of your cards pairs",
    heroCards: cardsFromString(hole),
    board: [],
    options,
    correctIndex,
    exactPercent: exact.probability * 100,
    explanation:
      `Six cards pair you — three of each rank. The flop brings none of them ` +
      `${String(asPercent(exact.probability, 1))}% of the time. Two big cards miss the flop about twice as ` +
      `often as they hit it, which is the whole reason a continuation bet works.`,
  };
}

function setMineQuestion(seed: string, rng: Rng): QuizQuestion {
  const hole = pick(POCKET_PAIRS, rng);
  const exact = pocketPairFlopsSet();
  const correct = asPercent(exact.probability);

  const wrong = distractorsFor(correct, [asPercent(2 / 50), correct * 2.4, correct * 4]);
  const { options, correctIndex } = layout(correct, wrong, rng);

  return {
    id: questionId("set_mine", seed),
    seed,
    family: "set_mine",
    prompt: "How often does a pocket pair flop a set or better?",
    clarifier: "Two cards of your rank left · three flop cards",
    heroCards: cardsFromString(hole),
    board: [],
    options,
    correctIndex,
    exactPercent: exact.probability * 100,
    explanation:
      `Two cards of your rank are left in the deck, and the flop finds one about ` +
      `${String(asPercent(exact.probability, 1))}% of the time — roughly one in eight. That number is why set ` +
      `mining needs someone behind you with a big stack: you miss seven times for every time you hit.`,
  };
}

function flopPairQuestion(seed: string, rng: Rng): QuizQuestion {
  const hole = pick(BIG_CARD_HANDS, rng);
  const exact = unpairedHandPairs();
  const correct = asPercent(exact.probability);

  const wrong = distractorsFor(correct, [
    asPercent(6 / 50),
    asPercent(1 - exact.probability),
    correct * 1.6,
  ]);
  const { options, correctIndex } = layout(correct, wrong, rng);

  return {
    id: questionId("flop_pair", seed),
    seed,
    family: "flop_pair",
    prompt: "How often does an unpaired hand flop at least a pair?",
    clarifier: "Pairing either card · straights and draws not counted",
    heroCards: cardsFromString(hole),
    board: [],
    options,
    correctIndex,
    exactPercent: exact.probability * 100,
    explanation:
      `Six cards pair one of yours, and at least one of them arrives ` +
      `${String(asPercent(exact.probability, 1))}% of the time. Just under a third — so most flops leave you with ` +
      `nothing made, and the plan for those has to be decided before you see them.`,
  };
}

function potOddsQuestion(seed: string, rng: Rng): QuizQuestion {
  const scenario = pick(POT_ODDS_SCENARIOS, rng);
  const exact = equityNeeded(scenario.bet, scenario.pot + scenario.bet);
  const correct = asPercent(exact.probability);

  const wrong = distractorsFor(correct, [
    asPercent(scenario.bet / scenario.pot),
    asPercent(scenario.bet / (scenario.pot + scenario.bet * 2)),
    correct * 1.7,
  ]);
  const { options, correctIndex } = layout(correct, wrong, rng);

  return {
    id: questionId("pot_odds", seed),
    seed,
    family: "pot_odds",
    prompt: `The pot is ${String(scenario.pot)} and they bet ${String(scenario.bet)}. How much equity do you need to call?`,
    clarifier: `Calling ${String(scenario.bet)} to win ${String(scenario.pot + scenario.bet)}`,
    heroCards: [],
    board: [],
    options,
    correctIndex,
    exactPercent: exact.probability * 100,
    explanation:
      `You put in ${String(scenario.bet)} to win a pot that will be ${String(scenario.pot + scenario.bet * 2)} — your ` +
      `${String(scenario.bet)} plus the ${String(scenario.pot + scenario.bet)} already out there. So you need to win ` +
      `${String(scenario.bet)} ÷ ${String(scenario.pot + scenario.bet * 2)} = ${String(asPercent(exact.probability, 1))}% of the time to break even. ` +
      `Dividing by the pot BEFORE their bet is the usual slip, and it makes the call look better than it is.`,
  };
}

/** Server-side grading. The client never holds `correctIndex`. */
export function gradeQuizAnswer(question: QuizQuestion, chosenIndex: number): boolean {
  return chosenIndex === question.correctIndex;
}
