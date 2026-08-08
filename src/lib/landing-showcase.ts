import type { FrequencySegment } from "@/components/poker/FrequencyBar";
import type { RangeStrategy } from "@/components/poker/RangeGrid";
import { positionName } from "@/lib/demo-hand";
import type { Grade } from "@/lib/grade";
import { bandFor } from "@/poker/grader";
import type { HandKey } from "@/poker/range";
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
 * Ordinary-looking on purpose, and the solver does something with it that a
 * beginner will not predict: ace-five suited defends a button open by RAISING
 * two times in five, as a bluff, and calling the other three. Nobody who has
 * only ever been told "play good hands" expects a five to be re-raising, and
 * nobody expects both answers to be right.
 *
 * It was QJo, which the repaired big-blind range defends as a pure call — a
 * true strategy and a useless illustration, since the page's whole argument is
 * that one hand can have two correct answers.
 */
export const SHOWCASE_HAND: HandKey = "A5s";

export interface Showcase {
  readonly nodeRef: string;
  readonly hand: HandKey;
  /** "In the big blind, facing an open from the button" — never "BB vs BTN". */
  readonly situation: string;
  /** Every action the solution actually plays, widest first. */
  readonly segments: readonly FrequencySegment[];
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

export function buildShowcase(node: PreflopNode, hand: HandKey = SHOWCASE_HAND): Showcase {
  const segments = segmentsFor(node, hand);
  const alternative = segments[1];

  return {
    nodeRef: node.ref,
    hand,
    situation: situationOf(node),
    segments,
    strategy: rangeStrategyOf(node),
    alternativeGrade: alternative === undefined ? null : bandFor(alternative.evLoss),
    potBb: node.potBb,
    effStackBb: node.effStackBb,
  };
}
