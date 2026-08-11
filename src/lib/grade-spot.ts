import "server-only";

import { grade as gradePreflop, gradePostflop, type Grade } from "@/poker/grader";
import type { SolutionData, Spot } from "@/poker/generator";
import {
  getPostflopStrategy,
  getStrategy,
  nodeRefOf,
  postflopBestAction,
  type NodeConfidence,
  type PostflopActionName,
  type PreflopActionName,
} from "@/poker/solutions";

/**
 * The honest ceiling on a grade whose numbers the data itself distrusts.
 *
 * "Blunder" is a claim of >=5bb lost — a specific, scolding number. Every node
 * self-rates the confidence of its EV column, and where that rating is "low"
 * (all 14 postflop templates, and every preflop node outside the repaired RFI
 * set) the 5bb is an estimate the file itself says not to lean on. Calling
 * someone's play a blunder off it is dishonest, so the WORD is capped at
 * "mistake" while `evLoss` stays exactly as computed: the number is already
 * presented next to its provenance label in the feedback panel, and rating,
 * leak detection and accuracy all read the number, not the word.
 *
 * This lives here rather than in the pure grader because the grader has no
 * confidence input — it grades a distribution it is handed. Confidence is a
 * property of the stored solution file, which is exactly this layer's job to
 * know about. Interim until the deferred solver run (2.10) raises the data's
 * own rating, at which point this cap stops firing without being touched.
 */
export function capGradeForConfidence(result: Grade, confidence: NodeConfidence): Grade {
  if (confidence.ev !== "low" || result.grade !== "blunder") return result;
  return { ...result, grade: "mistake" };
}

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
    return capGradeForConfidence(
      gradePostflop(template, spot.handClass, action as PostflopActionName),
      template.confidence,
    );
  }

  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return null;
  return capGradeForConfidence(
    gradePreflop(node, spot.handKey, action as PreflopActionName),
    node.confidence,
  );
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
