import type { FrequencySegment } from "@/components/poker/FrequencyBar";
import type { RangeStrategy } from "@/components/poker/RangeGrid";
import { actionLabel, actionPhrase } from "@/lib/action-label";
import { positionName } from "@/lib/demo-hand";
import type { Grade } from "@/lib/grade";
import { formatActionHistory, situationLine } from "@/lib/spot-situation";
import { bandFor } from "@/poker/grader";
import { SUITS, suitOf } from "@/poker/cards";
import { combosOf, type Combo, type HandKey } from "@/poker/range";
import { committedBbOf, PREFLOP_ORDER, seatActivity } from "@/poker/seat-activity";
import type { PreflopNode } from "@/poker/solutions";

/**
 * The one hand and the one range the landing page shows, DERIVED from the
 * shipped solution files rather than typed into the page.
 *
 * The page this replaced printed "AQo on the button, first in — Raise 62% /
 * Fold 38%" as its centrepiece. The solution set says AQo from the button is a
 * pure raise. A frequency nobody computed, on the page whose entire claim is
 * that it shows you the real strategy, is the worst possible place for one —
 * and nothing caught it because no test ever read the numbers.
 *
 * So this file is pure and the check is arithmetic against the JSON.
 */

/**
 * The node the showcase draws from.
 *
 * The big blind defending a button open is both the spot a 6-max player meets
 * most often and, of the 43 nodes, the one with the most mixed hands (46). The
 * mix IS the argument the page is making, so showing it from a node that
 * happens to be nearly pure would undercut the copy standing next to it.
 */
export const SHOWCASE_NODE_REF = "BB:vs_rfi_BTN";

/**
 * The featured hand.
 *
 * KQs at this node is a 70/30 call/raise mix — call-led so the primary segment
 * reads as the answer, raise wide enough to see at a glance on a phone, and
 * both lines indifferent so the copy can say they cost the same. A5s was a
 * 60/40 with the same indifference but painted as one green slab before the
 * marketing contrast exaggerated the minority colour.
 */
export const SHOWCASE_HAND: HandKey = "KQs";

export interface Showcase {
  readonly nodeRef: string;
  readonly hand: HandKey;
  /** "King-Queen suited" — never "KQs". */
  readonly handName: string;
  /** "In the big blind, facing an open from the button" — never "BB vs BTN". */
  readonly situation: string;
  /** Every action the node offers, in button order — including 0% lines. */
  readonly legalActions: readonly string[];
  /** Every action the solution actually plays, widest first. */
  readonly segments: readonly FrequencySegment[];
  /**
   * The post-hand explanation, derived from the same segments the bar draws.
   * Lives here so the How-it-works frame cannot drift from the numbers.
   */
  readonly explanation: string;
  /** The whole 169-cell range behind the featured hand. */
  readonly strategy: RangeStrategy;
  /**
   * The band the SECOND-widest action falls in, resolved here rather than in
   * the panel.
   *
   * `bandFor` lives in the grader, the grader reaches the hand evaluator, and
   * a client component that imports it drags the whole engine into the bundle
   * of the one page every ad click pays for — which `tests/unit/bundle.test.ts`
   * exists to prevent. Typed as `Grade` (the display union) rather than
   * `GradeName` so nothing downstream needs `src/poker` at all.
   */
  readonly alternativeGrade: Grade | null;
  readonly potBb: number;
  readonly effStackBb: number;
  /** The drill table for "Answer a spot" — same seats the generator would draw. */
  readonly table: ShowcaseTable;
}

/**
 * Opponent seats as the strip wants them. Kept free of `src/poker` types so a
 * client component can render the table without importing the generator.
 */
export interface ShowcaseOpponent {
  readonly position: string;
  readonly stackBb: number;
  readonly folded: boolean;
  readonly isDealer: boolean;
  readonly isActing: boolean;
  readonly betBb: number | null;
}

export interface ShowcaseTable {
  readonly opponents: readonly ShowcaseOpponent[];
  /** Drill situation line — "the button (BTN) opened. Action on you…" */
  readonly situationLine: string;
  readonly history: string;
  readonly strengthLabel: string;
  readonly heroBetBb: number | null;
}

/**
 * Frequencies and EV losses for one hand at one node.
 *
 * `evLoss` is computed the same way the grader computes it — `bestEv - thisEv`,
 * floored at zero — so the bar on the marketing page and the bar the user sees
 * after a real drill are reading the same quantity. A second definition here
 * would let the landing page claim a cost the product then disagrees with.
 */
export function segmentsFor(node: PreflopNode, hand: HandKey): FrequencySegment[] {
  const strategy = node.strategy[hand];
  const ev = node.ev[hand];

  if (strategy === undefined || ev === undefined) {
    throw new Error(`${node.ref} has no strategy or EV for ${hand}`);
  }

  const actions = [...node.actions];
  const bestEv = Math.max(...actions.map((action) => ev[action] ?? 0));

  return actions
    .map((action) => ({
      action,
      freq: strategy[action] ?? 0,
      evLoss: Math.max(0, bestEv - (ev[action] ?? 0)),
    }))
    .filter((segment) => segment.freq > 0)
    .sort((a, b) => b.freq - a.freq);
}

/**
 * The node's strategy as the grid wants it.
 *
 * A cast rather than a rebuild: `parsePreflopNode` has already rejected any key
 * that is not one of the 169 hands, so re-validating here would be a second
 * copy of a rule that already failed the build.
 */
export function rangeStrategyOf(node: PreflopNode): RangeStrategy {
  return node.strategy as RangeStrategy;
}

/**
 * "On the button", "In the big blind" — the preposition has to change with the
 * seat or the sentence reads as though it were assembled by a machine, which
 * on this page is exactly the impression to avoid.
 */
const PREPOSITION: Record<string, string> = {
  BTN: "On the",
  CO: "In the",
  MP: "In",
  UTG: "In the",
  SB: "In the",
  BB: "In the",
};

const VS_RFI = /^vs_rfi_([A-Z]+)$/;

/** Spelled out, per 7.2b — "from the button", never "from the BTN". */
export function situationOf(node: PreflopNode): string {
  const opener = `${PREPOSITION[node.heroPos] ?? "In the"} ${positionName(node.heroPos)}`;

  const versus = VS_RFI.exec(node.actionSeq);
  if (versus !== null) {
    return `${opener}, facing an open from the ${positionName(versus[1]!)}`;
  }
  if (node.actionSeq === "rfi") return `${opener}, folded to you`;

  return opener;
}

const RANK_WORD: Record<string, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  T: "Ten",
  "9": "Nine",
  "8": "Eight",
  "7": "Seven",
  "6": "Six",
  "5": "Five",
  "4": "Four",
  "3": "Three",
  "2": "Two",
};

/**
 * The one concrete combo every marketing surface draws for the featured hand.
 *
 * Hearts, because a red pair of cards reads better against the near-black
 * canvas than the clubs `combosOf` happens to return first. It is a SUITED
 * combo either way: making only the queen red would turn KQs into KQo, which
 * is a different hand with a different mix, and every number on the panel
 * would then describe cards the reader is not looking at.
 *
 * Shared rather than picked per component, so the hero and "How it works"
 * cannot drift while both claim to be showing the same hand.
 */
export function featuredCombo(hand: HandKey): Combo | undefined {
  const combos = combosOf(hand);
  const hearts = SUITS.indexOf("h");
  return combos.find((combo) => combo.every((card) => suitOf(card) === hearts)) ?? combos[0];
}

/** "King-Queen suited", "Pocket Aces" — the name a beginner would say. */
export function handNameOf(hand: HandKey): string {
  if (hand.length === 2) {
    const rank = RANK_WORD[hand[0] ?? ""];
    return rank !== undefined ? `Pocket ${rank}s` : hand;
  }
  const high = RANK_WORD[hand[0] ?? ""];
  const low = RANK_WORD[hand[1] ?? ""];
  if (high === undefined || low === undefined) return hand;
  return `${high}-${low} ${hand.endsWith("s") ? "suited" : "offsuit"}`;
}

/**
 * The sentence under the grade. Frequencies come from the segments, never
 * typed into the string, so a repaired node updates the How-it-works copy
 * the same way it updates the hero bar.
 */
export function mixExplanation(segments: readonly FrequencySegment[]): string {
  const played = segments.filter((segment) => segment.freq > 0);
  const parts = played
    .map((segment) => `${actionPhrase(segment.action)} ${Math.round(segment.freq * 100)}%`)
    .join(", ");
  const top = played[0];
  const alternative = played[1];

  if (top === undefined) {
    return "The chart has no line here.";
  }

  if (alternative === undefined) {
    return `${actionLabel(top.action)} wins the most in the long run here, taken ${Math.round(top.freq * 100)}% of the time.`;
  }

  if (alternative.evLoss < 0.005) {
    return `This spot is a genuine mix: ${parts}. Both lines are worth the same, which is the only reason to split a hand at all.`;
  }

  return `This spot is a genuine mix: ${parts}. Taking the second line gives up ${alternative.evLoss.toFixed(2)}bb — a different line, not a mistake.`;
}

export function buildShowcase(node: PreflopNode, hand: HandKey = SHOWCASE_HAND): Showcase {
  const segments = segmentsFor(node, hand);
  const alternative = segments[1];

  return {
    nodeRef: node.ref,
    hand,
    handName: handNameOf(hand),
    situation: situationOf(node),
    legalActions: [...node.actions],
    segments,
    explanation: mixExplanation(segments),
    strategy: rangeStrategyOf(node),
    alternativeGrade: alternative === undefined ? null : bandFor(alternative.evLoss),
    potBb: node.potBb,
    effStackBb: node.effStackBb,
    table: tableOf(node, hand),
  };
}

/**
 * Same walk `generateSpot` uses, so the marketing table and a real drill of
 * this node cannot disagree about who folded.
 */
function actionHistoryOf(node: PreflopNode): readonly string[] {
  if (node.actionSeq === "rfi") return ["folded to hero"];
  const opponent = node.actionSeq.split("_").pop() ?? "";
  if (node.actionSeq.startsWith("vs_rfi_")) return [`${opponent} opens 2.5bb`];
  if (node.actionSeq.startsWith("vs_3bet_")) {
    return [`${node.heroPos} opens 2.5bb`, `${opponent} 3bets to 11bb`];
  }
  return [`${opponent} opens 2.5bb`, `${node.heroPos} 3bets to 11bb`, `${opponent} 4bets to 22bb`];
}

function tableOf(node: PreflopNode, hand: HandKey): ShowcaseTable {
  const history = actionHistoryOf(node);
  const activity = seatActivity(node.heroPos, history);

  return {
    opponents: PREFLOP_ORDER.filter((position) => position !== node.heroPos).map((position) => {
      const state = activity[position]!;
      return {
        position,
        stackBb: node.effStackBb,
        folded: state.folded,
        isDealer: position === "BTN",
        isActing: state.toAct && !state.folded,
        betBb: committedBbOf(position, state, 0),
      };
    }),
    situationLine: situationLine(node.heroPos, history, 0),
    history: formatActionHistory(history, node.heroPos),
    // Preflop, no board: a pair is a pair, everything else is high card.
    // The dock's handStrength agrees; computing it here would drag the
    // evaluator into a module the landing page type-imports.
    strengthLabel: hand.length === 2 ? "Pair" : "High card",
    heroBetBb: committedBbOf(node.heroPos, activity[node.heroPos]!, 0),
  };
}
