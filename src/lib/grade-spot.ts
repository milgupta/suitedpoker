import "server-only";

import { grade as gradePreflop, gradePostflop, type Grade } from "@/poker/grader";
import type { SolutionData, Spot } from "@/poker/generator";
import {
  getPostflopStrategy,
  getStrategy,
  nodeRefOf,
  postflopBestAction,
  type PostflopActionName,
  type PreflopActionName,
} from "@/poker/solutions";

/**
 * Grades a regenerated spot against the solution set it was dealt from.
 *
 * Preflop looks up a node by `POSITION:actionSeq`. Postflop looks up a template
 * by id and grades the hand class — the answer route used to only know the
 * first path, so a lesson Practice CTA that opened postflop always 500'd.
 */
export function gradeSpot(
  data: SolutionData,
  spot: Spot,
  action: string,
  configType: "preflop" | "postflop",
): Grade | null {
  if (configType === "postflop") {
    const template = data.postflop.find((t) => t.id === spot.nodeRef);
    if (template === undefined || spot.handClass === null) return null;
    return gradePostflop(template, spot.handClass, action as PostflopActionName);
  }

  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return null;
  return gradePreflop(node, spot.handKey, action as PreflopActionName);
}

/**
 * Where the numbers behind a grade came from, for the feedback panel.
 *
 * /methodology promises "every spot carries a confidence rating and a
 * provenance label, and both are visible in the product" — and the one place
 * a user is actually graded against low-confidence EVs was the one place
 * without the label. Post-answer only: this discloses data quality, never the
 * strategy.
 */
export function sourceQualityForSpot(
  data: SolutionData,
  spot: Spot,
  configType: "preflop" | "postflop",
): { provenance: string; evConfidence: string } | null {
  const node =
    configType === "postflop"
      ? data.postflop.find((t) => t.id === spot.nodeRef)
      : data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return null;
  return { provenance: node.provenance, evConfidence: node.confidence.ev };
}

/** Strategy mix + best action for hints, shared by preflop and postflop. */
export function strategyForSpot(
  data: SolutionData,
  spot: Spot,
  configType: "preflop" | "postflop",
): { mix: Record<string, number>; bestAction: string; notes: string | null } | null {
  if (configType === "postflop") {
    const template = data.postflop.find((t) => t.id === spot.nodeRef);
    if (template === undefined || spot.handClass === null) return null;
    const entry = getPostflopStrategy(template, spot.handClass);
    if (entry === undefined) return null;
    return {
      mix: Object.fromEntries(template.actions.map((a) => [a, entry.strategy[a] ?? 0])),
      bestAction: postflopBestAction(template, spot.handClass),
      notes: entry.rationale ?? null,
    };
  }

  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return null;
  const mix = getStrategy(node, spot.handKey);
  const bestAction =
    Object.entries(mix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? spot.legalActions[0] ?? "";
  return { mix, bestAction, notes: node.notes ?? null };
}
