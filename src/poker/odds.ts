/**
 * Exact card probabilities.
 *
 * ── WHY THIS FILE IS DIFFERENT FROM EVERYTHING ELSE IN src/poker ─────────────
 *
 * Every strategy file in this product carries `authored-approximation`, and
 * will until the solver batch in 2.10 runs. `/methodology` says so, the
 * feedback panel says so, and the grader caps a "blunder" to "mistake" because
 * the EV column is a model rather than a measurement.
 *
 * NONE OF THAT APPLIES HERE. These are counting problems over a 52-card deck
 * with exactly one right answer. No solver, no approximation, no confidence
 * rating — the numbers below are as true as arithmetic, and this is the only
 * place in the product where a figure on screen can be stated flatly.
 *
 * So: EXACT COUNTING ONLY. No simulation, no float shortcuts, no "rule of
 * four". The rule of four is what a WRONG ANSWER uses — see `quiz.ts`, where
 * approximations earn their keep as distractors and nowhere else.
 *
 * Pure TypeScript, no I/O, same as the rest of `src/poker/**`.
 */

/**
 * n choose k, exactly, in floating point that stays integral.
 *
 * The multiplicative form rather than factorials: `52!` overflows a double at
 * around 170!, and even `combinations(52, 26)` computed through factorials
 * loses precision long before the answer does. Built up as a running product
 * with the division applied each step, every intermediate stays an integer and
 * the result is exact for every deck-sized input this file uses.
 */
export function combinations(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k)) {
    throw new RangeError("combinations takes integers");
  }
  if (k < 0 || n < 0 || k > n) return 0;
  const take = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= take; i++) {
    result = (result * (n - take + i)) / i;
  }
  return Math.round(result);
}

/** A probability in [0, 1], plus the counting that produced it. */
export interface ExactOdds {
  /** The probability itself, exact to floating-point representation. */
  readonly probability: number;
  /** Favourable outcomes. */
  readonly favourable: number;
  /** Total outcomes. */
  readonly total: number;
}

function odds(favourable: number, total: number): ExactOdds {
  if (total <= 0) throw new RangeError("an outcome space cannot be empty");
  return { probability: favourable / total, favourable, total };
}

/**
 * The chance a draw with `outs` outs completes, with `toCome` cards left.
 *
 * Computed as ONE MINUS the chance it misses every street, which is the only
 * form that is correct for more than one card. Adding per-street chances —
 * "9 outs is 19% on the turn plus 19% on the river" — double-counts the runouts
 * where it hits twice, and is the single most common error a beginner makes
 * with this number. It is offered as a distractor in `quiz.ts` for exactly
 * that reason.
 *
 * `unseen` is what the player cannot see: 47 after a flop (52 − 2 hole − 3
 * board), 46 after a turn.
 */
export function drawCompletes(outs: number, toCome: number, unseen: number): ExactOdds {
  if (outs < 0 || outs > unseen) throw new RangeError(`${outs} outs is impossible in ${unseen}`);
  if (toCome < 1 || toCome > unseen) throw new RangeError(`${toCome} cards to come is impossible`);

  // Misses = choose every remaining card from the non-outs.
  const misses = combinations(unseen - outs, toCome);
  const total = combinations(unseen, toCome);
  return odds(total - misses, total);
}

/**
 * The chance at least one of `targets` specific cards appears in a flop.
 *
 * `targets` is a COUNT of cards still in the deck that qualify, not a count of
 * ranks: an overcard to pocket jacks is any queen, king or ace, which is 12
 * cards. Getting that conversion wrong is the difference between 57% and 21%,
 * so callers pass cards and the rank arithmetic lives at the call site where
 * the blockers are known.
 */
export function flopContainsAny(targets: number, unseen = 50, flopSize = 3): ExactOdds {
  if (targets < 0 || targets > unseen) throw new RangeError(`${targets} targets is impossible`);
  const total = combinations(unseen, flopSize);
  const without = combinations(unseen - targets, flopSize);
  return odds(total - without, total);
}

/** The complement of `flopContainsAny` — the flop contains none of them. */
export function flopContainsNone(targets: number, unseen = 50, flopSize = 3): ExactOdds {
  const any = flopContainsAny(targets, unseen, flopSize);
  return odds(any.total - any.favourable, any.total);
}

/**
 * The chance a pocket pair flops a set or better (trips, quads, full house).
 *
 * "Or better" is not a flourish. The often-quoted 11.8% is the chance of
 * flopping EXACTLY a set, and a player who folds to the difference is folding
 * the times they flopped quads. Counted as one minus the chance the flop
 * contains neither of the two remaining cards of that rank.
 */
export function pocketPairFlopsSet(unseen = 50): ExactOdds {
  return flopContainsAny(2, unseen);
}

/**
 * The chance an unpaired hand pairs at least one of its own cards on the flop.
 *
 * Six cards help — three of each rank remain — so this is `flopContainsAny(6)`.
 * It counts pairing EITHER card, which is what "did the flop hit me" means to
 * the player asking; it does NOT count flopping a straight or a flush draw,
 * and the question copy says so.
 */
export function unpairedHandPairs(unseen = 50): ExactOdds {
  return flopContainsAny(6, unseen);
}

/**
 * The price a call is getting, as the equity it needs to break even.
 *
 * `callAmount / (potBeforeCall + callAmount)`. This is the one number in the
 * mode that is a DECISION rather than a count, and it is exact too: it is
 * arithmetic on chips that are already on the table, with no assumption about
 * what happens on later streets. Implied odds are a different question and this
 * function does not pretend to answer it.
 */
export function equityNeeded(callAmount: number, potBeforeCall: number): ExactOdds {
  if (callAmount <= 0) throw new RangeError("a call has to cost something");
  if (potBeforeCall < 0) throw new RangeError("a pot cannot be negative");
  return odds(callAmount, potBeforeCall + callAmount);
}

/**
 * The "rule of four and two" estimate — DELIBERATELY WRONG, and never an answer.
 *
 * Exported so `quiz.ts` can offer it as the distractor it is. It is the
 * shortcut every beginner is taught, it is off by several points at exactly the
 * out-counts that matter most, and a player who picks it has revealed the
 * misconception the question exists to correct. Keeping it here, next to the
 * exact function it approximates, is the clearest way to record that the
 * difference is intentional.
 */
export function ruleOfFourAndTwo(outs: number, toCome: number): number {
  return Math.min(1, (outs * (toCome >= 2 ? 4 : 2)) / 100);
}

/** A percentage rounded for display. One decimal is more than any answer needs. */
export function asPercent(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * 100 * factor) / factor;
}

// ── Out counts, so the question copy and the maths cannot disagree ───────────

/**
 * The standard draws, with their out counts.
 *
 * Named rather than inlined because the copy on screen and the number fed to
 * `drawCompletes` have to describe the same hand. A question that says
 * "open-ended" while counting nine outs is wrong in a way no test of the maths
 * alone would catch.
 */
export const DRAW_OUTS = {
  gutshot: 4,
  open_ended: 8,
  flush_draw: 9,
  combo_draw: 15,
} as const;

export type DrawKind = keyof typeof DRAW_OUTS;

export const DRAW_LABELS: Record<DrawKind, string> = {
  gutshot: "gutshot straight draw",
  open_ended: "open-ended straight draw",
  flush_draw: "flush draw",
  combo_draw: "flush draw and an open-ender",
};
