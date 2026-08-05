import "server-only";

import type { Grade } from "@/poker/grader";
import type { Spot } from "@/poker/generator";
import { generateCoached, costUsd, isAiConfigured } from "./client";
import { buildCoachContext, type CoachProfile } from "./context";
import { COACH_SYSTEM_PROMPT, explanationInstruction } from "./prompts";
import { redact, templateExplanation } from "./redact";
import { cacheKeyFor, getCachedExplanation, putCachedExplanation } from "./cache";

export interface Explanation {
  text: string;
  /** Where it came from — surfaced in tests and in the cost report. */
  source: "cache" | "model" | "template";
  redactedFor: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * The one entry point for an explanation.
 *
 * Order matters: cache, then model, then template. The template is not an error
 * path — it is a correct, if plainer, explanation built from the same ground
 * truth, so a user whose request timed out still learns something true.
 */
export async function explainDecision(
  spot: Pick<Spot, "nodeRef" | "handKey" | "heroPos" | "potBb" | "effStackBb" | "actionHistory">,
  grade: Grade,
  profile: CoachProfile,
  rationale?: string | null,
): Promise<Explanation> {
  const key = cacheKeyFor({
    nodeRef: spot.nodeRef,
    handKey: spot.handKey,
    chosenAction: grade.chosenAction,
    skillTier: profile.skillTier,
  });

  const cached = await getCachedExplanation(key);
  if (cached !== null) {
    return {
      text: cached,
      source: "cache",
      redactedFor: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }

  if (!isAiConfigured()) {
    return {
      text: templateExplanation(grade),
      source: "template",
      redactedFor: "not_configured",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }

  const context = buildCoachContext(spot, grade, profile, rationale);
  const result = await generateCoached({
    system: COACH_SYSTEM_PROMPT,
    prompt: `${context.text}\n\n${explanationInstruction()}`,
  });

  if (!result.ok) {
    return {
      text: templateExplanation(grade),
      source: "template",
      redactedFor: result.reason,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }

  const checked = redact(result.text, grade);

  // Only a clean explanation is cached. Caching a redacted one would serve the
  // template forever to everyone who hits that spot.
  if (checked.safe) {
    await putCachedExplanation(key, checked.text, result.model);
  }

  return {
    text: checked.text,
    source: checked.safe ? "model" : "template",
    redactedFor: checked.reason,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: costUsd(result.inputTokens, result.outputTokens),
  };
}
