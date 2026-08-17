/**
 * Combo-level refinement of a postflop strategy.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * A postflop template authors ONE strategy per hand class. That made the whole
 * postflop product 14 templates × ~9 classes = 130 distinct answers, and it
 * meant `AhKh` on `Ah 7d 2c` and `AcKs` on `As 8h 3d` were graded as the SAME
 * decision. Blockers, the backdoor draw, the kicker inside the class and which
 * board you were actually dealt all collapsed into one cell. A player who found
 * that — and a numerate player finds it in an afternoon — has no reason to trust
 * the 130 answers that remain.
 *
 * This layer re-keys a decision on `(template, handClass, comboFeatures)`. It is
 * not a solver and does not claim to be: it is a bounded, documented, directional
 * adjustment in exactly the same spirit as `scripts/repair-preflop.ts` derives
 * the preflop EV column. Provenance stays `authored-approximation`.
 *
 * ── WHY IT IS BOUNDED ────────────────────────────────────────────────────────
 *
 * Every feature below is a well-understood postflop axis that solvers move in a
 * known DIRECTION. None of them is something we can size to a decimal place. So
 * the total adjustment is clamped to MAX_SHIFT and can only ever redistribute
 * mass inside the support the template already authored — it can shift a 70/30
 * toward 55/45, and it can never invent a line the template does not play, nor
 * turn a majority action into a minority one. Being wrong here should cost a few
 * frequency points, never a different lesson.
 *
 * ── WHY EV IS RE-DERIVED RATHER THAN ADJUSTED ────────────────────────────────
 *
 * The authored EV columns VIOLATED indifference, on every template. One example
 * from `river-facing-large-bet-after-two-calls`: `top_pair_weak_kicker` folds
 * 65% and calls 35%, and the call is priced at -0.23. The file recommends a line
 * it simultaneously calls a mistake, and the product prints both numbers on the
 * same screen. That is the exact bug `repair-preflop.ts` was written to fix
 * preflop, and it was still live postflop.
 *
 * So EV is DERIVED from the frequencies here, never carried alongside them. One
 * source of truth means a refinement cannot desynchronise the two, and the
 * authored EVs still do the work they are actually good for: ranking how bad the
 * lines nobody plays are.
 */

import type { Card } from "./cards";
import { rankOf, suitOf } from "./cards";
import type { HandClass } from "./handclass";
import type { PostflopActionName, PostflopTemplateFile } from "./solutions";

export type PostflopStrategyEntry = PostflopTemplateFile["strategies"][number];

/** A refined cell: the same shape the grader already consumes. */
export interface RefinedEntry {
  strategy: Partial<Record<PostflopActionName, number>>;
  ev: Partial<Record<PostflopActionName, number>>;
}

/**
 * Passive to aggressive. The ONE ordering the shift travels along, so "more
 * aggressive" is a fact about the vocabulary rather than a judgement made at
 * each call site.
 */
const AGGRESSION: Record<PostflopActionName, number> = {
  fold: 0,
  check: 1,
  call: 2,
  bet_33: 3,
  bet_66: 4,
  bet_100: 5,
  raise_small: 6,
  raise_pot: 7,
  allin: 8,
};

/** The most a combo may move a class's strategy, in absolute frequency. */
export const MAX_SHIFT = 0.2;

/** An unplayed action must price strictly below the played ones. */
const MIN_EV_GAP = 0.05;

const ACE = 12;
const KING = 11;
const QUEEN = 10;

/**
 * Classes with no showdown value, where a blocker is a REASON TO BET rather
 * than a rounding detail. Holding the nut-flush ace with air is the textbook
 * bluff; holding it with a set changes almost nothing.
 */
const BLUFF_CLASSES: ReadonlySet<HandClass> = new Set<HandClass>([
  "air",
  "overcards",
  "overcards_bdfd",
  "ace_high",
  "gutshot",
]);

const PAIR_CLASSES: ReadonlySet<HandClass> = new Set<HandClass>([
  "overpair",
  "top_pair_good_kicker",
  "top_pair_weak_kicker",
]);

export interface ComboFeatures {
  /** Flop only: hero has three to a suit and holds at least one of them. */
  backdoorFlush: boolean;
  /** Hero holds the ace of a suit the board has two or more of. */
  nutSuitBlocker: boolean;
  /** Top pair with an ace or king kicker, or an overpair of queens or better. */
  strongKicker: boolean;
  /** Offsuit and four or more apart — the worst barrel candidate in the class. */
  offsuitDisconnected: boolean;
}

/** How many cards of `suit` appear across hero's hand and the board. */
function suitCount(cards: readonly Card[], suit: number): number {
  let count = 0;
  for (const card of cards) if (suitOf(card) === suit) count++;
  return count;
}

export function comboFeatures(
  hole: readonly [Card, Card],
  board: readonly Card[],
  handClass: HandClass,
): ComboFeatures {
  const all = [...hole, ...board];
  const holeSuits = [suitOf(hole[0]), suitOf(hole[1])];
  const holeRanks = [rankOf(hole[0]), rankOf(hole[1])].sort((a, b) => b - a);

  // Backdoor flush: exactly three to a suit WITH a hero card in it. Four is
  // already a flush draw and the classifier has named it.
  let backdoorFlush = false;
  if (board.length === 3) {
    for (const suit of new Set(holeSuits)) {
      if (suitCount(all, suit) === 3) backdoorFlush = true;
    }
  }

  // Nut blocker: hero holds the ace of a suit the board shows twice or more,
  // and is not already using that suit for a flush or a flush draw. Blocking
  // villain's nut flush and nut flush draw is what makes the bluff work.
  let nutSuitBlocker = false;
  for (let i = 0; i < 2; i++) {
    const card = hole[i]!;
    if (rankOf(card) !== ACE) continue;
    const suit = suitOf(card);
    if (suitCount(board, suit) >= 2 && suitCount(all, suit) < 4) nutSuitBlocker = true;
  }

  let strongKicker = false;
  if (handClass === "overpair") {
    strongKicker = holeRanks[0]! >= QUEEN;
  } else if (handClass === "top_pair_good_kicker" || handClass === "top_pair_weak_kicker") {
    const boardRanks = new Set(board.map(rankOf));
    const kicker = holeRanks.find((r) => !boardRanks.has(r));
    strongKicker = kicker !== undefined && kicker >= KING;
  }

  const offsuitDisconnected =
    holeSuits[0] !== holeSuits[1] &&
    holeRanks[0] !== holeRanks[1] &&
    holeRanks[0]! - holeRanks[1]! >= 4;

  return { backdoorFlush, nutSuitBlocker, strongKicker, offsuitDisconnected };
}

/**
 * The net push toward aggression, in absolute frequency.
 *
 * Each weight is deliberately small. The claim being made is only that the
 * direction is right — a backdoor flush draw is worth betting slightly more
 * often than the same class without one — and the magnitudes are the least
 * defensible numbers in this file, which is why they are clamped hard.
 */
export function aggressionDelta(features: ComboFeatures, handClass: HandClass): number {
  let delta = 0;

  // Extra equity plus a turn card to barrel. Solvers bet these more.
  if (features.backdoorFlush) delta += 0.1;

  // Worth far more with nothing than with a made hand: the value of removal is
  // that it takes villain's continues away while hero has no showdown of their
  // own to protect.
  if (features.nutSuitBlocker) delta += BLUFF_CLASSES.has(handClass) ? 0.1 : 0.04;

  // Only meaningful where the class leaves kicker room. `comboFeatures` already
  // restricts this to the pair classes; the guard keeps that local.
  if (features.strongKicker && PAIR_CLASSES.has(handClass)) delta += 0.08;

  // The bottom of a bluffing range: no suit, no connectivity, nothing to
  // improve to on a later street.
  if (features.offsuitDisconnected && BLUFF_CLASSES.has(handClass)) delta -= 0.08;

  return Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, delta));
}

function playedActions<A extends string>(
  strategy: Partial<Record<A, number>>,
  actions: readonly A[],
): A[] {
  return actions.filter((action) => (strategy[action] ?? 0) > 0);
}

/**
 * Redistribute `delta` between the least and most aggressive played actions.
 *
 * Inside the existing support ONLY. Introducing an action the template never
 * plays would be this layer inventing strategy rather than refining it, and a
 * pure strategy is left completely alone — a class the template plays one way
 * every time is a class it is making a categorical claim about.
 */
function shiftStrategy(
  strategy: Partial<Record<PostflopActionName, number>>,
  actions: readonly PostflopActionName[],
  delta: number,
): Partial<Record<PostflopActionName, number>> {
  const played = playedActions(strategy, actions);
  if (played.length < 2 || delta === 0) return { ...strategy };

  const ordered = [...played].sort((a, b) => AGGRESSION[a] - AGGRESSION[b]);
  const passive = ordered[0]!;
  const aggressive = ordered[ordered.length - 1]!;

  const from = delta > 0 ? passive : aggressive;
  const to = delta > 0 ? aggressive : passive;

  // Never take more than the donor has, and never let the donor reach zero:
  // dropping an action out of the mix entirely is a support change, which is
  // the one thing this layer must not do.
  const available = Math.max(0, (strategy[from] ?? 0) - 0.01);
  const moved = Math.min(Math.abs(delta), available);
  if (moved <= 0) return { ...strategy };

  const out = { ...strategy };
  out[from] = round2((strategy[from] ?? 0) - moved);
  out[to] = round2((strategy[to] ?? 0) + moved);
  return out;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The EV column, derived from the frequencies under the indifference rule.
 *
 * Same three cases as the preflop derivation, for the same reasons:
 *
 * - Mixes with folding → every continue in the mix is worth exactly what
 *   folding is worth. That is what being on the boundary of a range MEANS.
 * - Never folds → every action in the mix is worth the same, taken from the
 *   authored peak so the template's own sense of the spot's value survives.
 * - Always folds → nothing is played, so the authored (negative) EVs stand.
 *
 * Actions nobody plays keep their authored EV, floored below the played value.
 * That is the half of the authored column worth keeping: it says how bad the
 * lines outside the strategy are, and nothing about it was inconsistent.
 */
export function deriveEntryEv(
  strategy: Partial<Record<PostflopActionName, number>>,
  actions: readonly PostflopActionName[],
  authored: Partial<Record<PostflopActionName, number>>,
): Partial<Record<PostflopActionName, number>> {
  return deriveIndifferentEv(strategy, actions, authored);
}

/**
 * The action-vocabulary-agnostic core of the rule above.
 *
 * Generic because the preflop sizing layer needs exactly the same derivation
 * over `fold | call | raise | allin`. Two copies of an indifference rule is how
 * one of them ends up with a rounding tweak the other never got.
 */
export function deriveIndifferentEv<A extends string>(
  strategy: Partial<Record<A, number>>,
  actions: readonly A[],
  authored: Partial<Record<A, number>>,
): Partial<Record<A, number>> {
  // `fold` is a member of both action vocabularies but not of the generic `A`,
  // so it is reached by name rather than by key.
  const fold = "fold" as A;
  const hasFold = (actions as readonly string[]).includes("fold");
  const foldEv = hasFold ? (authored[fold] ?? 0) : null;
  const foldFreq = strategy[fold] ?? 0;

  const continues = playedActions(strategy, actions).filter((a) => a !== "fold");

  let value: number;
  if (continues.length === 0) {
    // Folds every time (or the entry is empty). Nothing is indifferent to
    // anything, so the authored column stands as written.
    const out: Partial<Record<A, number>> = {};
    for (const action of actions) out[action] = authored[action] ?? 0;
    return out;
  } else if (hasFold && foldFreq > 0) {
    value = foldEv ?? 0;
  } else {
    value = Math.max(...continues.map((a) => authored[a] ?? 0));
  }

  const out: Partial<Record<A, number>> = {};
  for (const action of actions) {
    if (action === "fold") {
      out[action] = foldEv ?? 0;
      continue;
    }
    if ((strategy[action] ?? 0) > 0) {
      out[action] = round2(value);
      continue;
    }
    // Unplayed: keep the authored judgement, but never at or above the value of
    // a line that IS played — the grader would otherwise call it the best
    // action while the capsules print it at 0%.
    out[action] = round2(Math.min(authored[action] ?? value - MIN_EV_GAP, value - MIN_EV_GAP));
  }
  return out;
}

/**
 * The refined cell for one actual holding on one actual board.
 *
 * `hole`/`board` absent means the caller has no combo — the range grid and the
 * methodology page both legitimately want the class-level strategy — and the
 * authored entry comes back with its EV made consistent but nothing shifted.
 */
export function refineEntry(
  entry: PostflopStrategyEntry,
  actions: readonly PostflopActionName[],
  combo?: { hole: readonly [Card, Card]; board: readonly Card[] },
): RefinedEntry {
  const authoredStrategy = entry.strategy as Partial<Record<PostflopActionName, number>>;
  const authoredEv = entry.ev as Partial<Record<PostflopActionName, number>>;

  const strategy =
    combo === undefined
      ? { ...authoredStrategy }
      : shiftStrategy(
          authoredStrategy,
          actions,
          aggressionDelta(
            comboFeatures(combo.hole, combo.board, entry.handClass as HandClass),
            entry.handClass as HandClass,
          ),
        );

  return { strategy, ev: deriveEntryEv(strategy, actions, authoredEv) };
}

/**
 * The best action under a refined cell.
 *
 * Highest EV, ties broken by frequency — the SAME rule `gradeDecision` uses.
 * Shared rather than repeated: a hint that named a different best action from
 * the grade would contradict the panel shown seconds later.
 */
export function refinedBestAction(
  refined: RefinedEntry,
  actions: readonly PostflopActionName[],
): PostflopActionName {
  let best: PostflopActionName | undefined;
  let bestEv = -Infinity;
  let bestFreq = -1;
  for (const action of actions) {
    const ev = refined.ev[action] ?? 0;
    const freq = refined.strategy[action] ?? 0;
    if (ev > bestEv || (ev === bestEv && freq > bestFreq)) {
      best = action;
      bestEv = ev;
      bestFreq = freq;
    }
  }
  if (best === undefined) throw new RangeError("cannot pick a best action from no actions");
  return best;
}

/**
 * The combo a `Spot` represents, or undefined when it has no board.
 *
 * `heroCards` is a `readonly Card[]` on the spot and a fixed pair here, so the
 * narrowing lives in one place rather than at each grading call site.
 */
export function comboOf(
  heroCards: readonly Card[],
  board: readonly Card[],
): { hole: readonly [Card, Card]; board: readonly Card[] } | undefined {
  const [a, b] = heroCards;
  if (a === undefined || b === undefined || board.length < 3) return undefined;
  return { hole: [a, b], board };
}

/**
 * A stable identifier for the refinement bucket a combo lands in.
 *
 * Exported so the coverage test can COUNT the distinct cells the product
 * actually serves rather than asserting an intended number that drifts.
 */
export function featureKey(features: ComboFeatures): string {
  return [
    features.backdoorFlush ? "bdf" : "-",
    features.nutSuitBlocker ? "nut" : "-",
    features.strongKicker ? "kick" : "-",
    features.offsuitDisconnected ? "odc" : "-",
  ].join("|");
}
