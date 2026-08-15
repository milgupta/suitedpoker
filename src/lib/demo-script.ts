/**
 * THE FIXED DEMO HAND, AND EVERY WORD SAID ABOUT IT.
 *
 * The pre-paywall hand used to be chosen per user from a tier shortlist, and
 * the explanation under it came from the same template engine the paid product
 * uses. That is the right design for a drill and the wrong one for the single
 * hand an ad click decides on: the copy could not name the hand, could not
 * anticipate the question a beginner actually has, and varied per user so
 * nobody could read what the funnel was saying.
 *
 * So this hand is FIXED and its words are WRITTEN. Everyone sees T9o in the big
 * blind against a button open.
 *
 * WHY THIS HAND. The node offers three buttons and the strategy uses two:
 *
 *     fold  20%   EV  0
 *     call  80%   EV  0
 *     raise  0%   EV -1.17bb
 *
 * That is exactly the shape the screen needs. Raising is a genuine mistake, so
 * the hand is not a free pass — but the real question, the one the whole
 * product is about, is fold versus call, and there the solver is indifferent
 * and simply calls four times out of five. A beginner can hold both halves of
 * that in their head: "this is close, and close has an answer."
 *
 * It is also the most common decision in 6-max. Nobody has to be told why it
 * matters.
 *
 * NOTHING HERE MAY CONTRADICT THE SOLUTION FILE. Every figure written into this
 * copy is asserted against `BB.vs_rfi_BTN.json` in `tests/unit/demo-script.test.ts`.
 * A repaired node fails the build rather than shipping a sentence the table
 * underneath disagrees with — the same rule the AI coach lives under, applied
 * to hand-written words because they are no more trustworthy than generated
 * ones.
 */

import type { HeroPosition } from "@/poker/solutions";

/** The one spot. `forceHandKey` makes it the same hand for everybody. */
export const FIXED_DEMO = {
  heroPos: "BB" as HeroPosition,
  actionSeq: "vs_rfi_BTN",
  handKey: "T9o",
  difficulty: 4,
  /** Kept in sync with the solution file by the test. */
  callFreq: 0.8,
  foldFreq: 0.2,
  /** In big blinds, as the file stores it. The UI converts to chips. */
  raiseEvLoss: 1.17,
} as const;

export const FIXED_DEMO_NODE_REF = `${FIXED_DEMO.heroPos}:${FIXED_DEMO.actionSeq}`;

/** How the hand is named in prose. Never "T9o" on its own to a beginner. */
export const FIXED_DEMO_HAND_NAME = "Ten-Nine offsuit";

/* ── The set response ─────────────────────────────────────────────────────── */

export type DemoAction = "fold" | "call" | "raise";

export interface DemoVerdict {
  /** One short line, the thing they most need to hear first. */
  readonly headline: string;
  /** Two or three sentences of why. */
  readonly body: string;
}

/**
 * One written response per action, not one per grade.
 *
 * Grade-keyed copy was the first attempt and it says the wrong thing: `fold`
 * and `call` both grade `best` here (the solver is indifferent), so a
 * grade-keyed message congratulates both identically and teaches nothing about
 * the difference — which IS the lesson. Keying on what they actually pressed
 * lets each answer be about that answer.
 */
export const DEMO_VERDICT: Record<DemoAction, DemoVerdict> = {
  call: {
    headline: "That's the call the solver makes four times out of five.",
    body: "You're last to act before the flop and you only have to put in a little more to see it, so a hand like Ten-Nine is worth continuing with — even though it's nobody's idea of a strong hand. It folds the other fifth of the time, which is why this isn't a rule so much as a habit with an exception built in.",
  },
  fold: {
    headline: "Folding is fine here — it's the other fifth of the time.",
    body: "The solver folds this exact hand one time in five, so you have not made a mistake. It calls more often because the price is good and you close the action, but Ten-Nine offsuit is thin enough that letting it go is a real part of the strategy rather than a leak.",
  },
  raise: {
    headline: "Raising is the one thing this hand doesn't do.",
    body: "A raise here turns a cheap look at the flop into a big pot with a hand that rarely flops anything strong, and the button gets to keep playing with everything better than you. The solver never raises Ten-Nine offsuit from the big blind against a button open — it folds or calls, nothing else.",
  },
};

/* ── The mini chat ────────────────────────────────────────────────────────── */

export interface DemoAnswer {
  readonly id: string;
  /** What the user taps. Also the phrasing the matcher is tuned for. */
  readonly question: string;
  readonly answer: string;
  /**
   * Lowercase STEMS that route a typed question here.
   *
   * Stems, not whole words, because "what about raising?" is the question and
   * "raise" is the word — an exact match sent it to the fallback. Matched as a
   * prefix of a word, never as a substring of the sentence: substring matching
   * put "would this change in another SEAT?" through "3bet" once the digits
   * were stripped, and generally finds a keyword inside an unrelated word.
   *
   * They must also DISCRIMINATE. The first set gave `why-call` both "why" and
   * "call", so "Why not call every time?" — which is the other question —
   * scored two on it and one on the right one. A keyword that appears in more
   * than one of these four questions belongs in none of them.
   */
  readonly keywords: readonly string[];
}

/**
 * A written Q&A, not a model call.
 *
 * The paid product has a real coach with a jailbreak suite, a redaction layer
 * and a budget breaker behind it. None of that is worth wiring up in front of
 * the paywall for one hand: an unauthenticated-in-spirit surface talking to a
 * model is the most abusable thing in the product, and the questions a beginner
 * asks about ONE known hand are a short list that can simply be answered well.
 *
 * The chips are the primary interface and the text box is the fallback, because
 * a person who does not know the vocabulary cannot type the question — offering
 * the four questions they were about to ask is faster than any input.
 */
export const DEMO_ANSWERS: readonly DemoAnswer[] = [
  {
    id: "why-call",
    question: "Why call with a weak hand?",
    answer:
      "Because of the price and the position of the money, not the strength of the cards. You already have 2 chips in as the blind, the button only raised to 5, and you are the last person to act — so you are getting a good enough price that you do not need a good hand, only one that can flop something. Ten-Nine can make straights and pairs that are genuinely worth money.",
    keywords: ["weak", "bad", "trash", "junk", "worth", "garbage", "terrible", "marginal"],
  },
  {
    id: "why-not-always",
    question: "Why not call every time?",
    answer:
      "Because a player who always does the same thing is easy to play against. The solver calls this 80% of the time and folds it 20%, and the mix is what stops the button from knowing what you have. It also genuinely is close — the two lines are worth the same, so neither one is costing you anything.",
    keywords: ["always", "every", "mix", "80", "20", "percent", "sometimes", "random"],
  },
  {
    id: "what-if-raise",
    question: "What about raising?",
    answer:
      "Raising is the one line that loses money here. It builds a big pot with a hand that will usually miss the flop, and it lets the button continue with everything that beats you while folding the hands you were already ahead of. The solver never raises this hand in this spot.",
    keywords: ["rais", "3bet", "threebet", "aggress", "attack"],
  },
  {
    id: "does-position-matter",
    question: "Would this change in another seat?",
    answer:
      "Yes, a lot. The big blind gets the best price at the table because it already has money in, so it continues with far more hands than any other seat. The same Ten-Nine offsuit facing the same raise from, say, the cutoff is an easy fold — you would have to put in the whole raise cold and still have players behind you.",
    keywords: [
      "position",
      "seat",
      "cutoff",
      "button",
      "utg",
      "elsewhere",
      "differ",
      "another",
      "chang",
    ],
  },
];

/** Shown when nothing matches. Never invents an answer. */
export const DEMO_CHAT_FALLBACK =
  "That one's beyond what I can answer on a single hand. The full coach picks up inside — it sees every hand you play and answers in the context of the spot in front of you.";

export const DEMO_CHAT_PROMPT = "Ask me about this hand";

/**
 * Route a typed question to a written answer, or to null for the fallback.
 *
 * Scores by how many of an entry's stems START one of the question's words.
 * Requires at least one hit, so an off-topic question gets the fallback rather
 * than whatever happened to sort first — the failure mode that matters here is
 * confidently answering something nobody asked.
 */
export function answerFor(question: string): DemoAnswer | null {
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length === 0) return null;

  let best: DemoAnswer | null = null;
  let bestScore = 0;

  for (const entry of DEMO_ANSWERS) {
    const score = entry.keywords.reduce(
      (sum, stem) => sum + (words.some((word) => word.startsWith(stem)) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}

/** Max characters accepted from the box. Long enough to ask, short enough to bound. */
export const DEMO_CHAT_MAX_LENGTH = 200;
