import "server-only";

import type { Grade } from "@/poker/grader";
import type { Spot } from "@/poker/generator";
import { generateCoached, costUsd, isAiConfigured, streamCoached } from "./client";
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
      text: templateExplanation(grade, profile.skillTier),
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
    prompt: `${context.text}\n\n${explanationInstruction(grade.grade, grade.displayMode, profile.skillTier)}`,
  });

  if (!result.ok) {
    return {
      text: templateExplanation(grade, profile.skillTier),
      source: "template",
      redactedFor: result.reason,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }

  const checked = redact(result.text, grade, profile.skillTier);

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

/* ── Streaming ───────────────────────────────────────────────────────────── */

export type ExplainEvent =
  | { type: "text"; text: string }
  /** Discard everything received so far — the guard tripped mid-stream. */
  | { type: "reset" }
  | {
      type: "done";
      source: Explanation["source"];
      redactedFor: string | null;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    };

/** Emits up to the last completed sentence, keeping the rest buffered. */
function splitAtLastSentence(buffer: string): { emit: string; rest: string } {
  // Search from the end for a terminator followed by whitespace.
  for (let i = buffer.length - 2; i >= 0; i--) {
    const char = buffer[i];
    const next = buffer[i + 1];
    if ((char === "." || char === "!" || char === "?") && next !== undefined && /\s/.test(next)) {
      return { emit: buffer.slice(0, i + 2), rest: buffer.slice(i + 2) };
    }
  }
  return { emit: "", rest: buffer };
}

/**
 * The streamed explanation.
 *
 * THE GUARD RUNS BEFORE ANY TEXT LEAVES THE SERVER. That is the whole reason
 * this is sentence-gated rather than token-gated: a contradiction is always
 * expressed inside a sentence, so holding a sentence until it is complete and
 * checking the accumulated text against the ground truth means a wrong claim is
 * never rendered — not even for the 200ms it would take to retract it.
 *
 * If the guard trips mid-stream, the caller gets `reset` and then the template.
 * Showing a false explanation and correcting it afterwards would be worse than
 * not streaming at all.
 */
export async function* streamExplanation(
  spot: Pick<Spot, "nodeRef" | "handKey" | "heroPos" | "potBb" | "effStackBb" | "actionHistory">,
  grade: Grade,
  profile: CoachProfile,
  rationale?: string | null,
  /**
   * False when 4.5's circuit breaker has cut this path. The CACHE is still
   * consulted first — a cache hit costs nothing, and refusing to serve one
   * because the budget is spent would degrade the product for no saving.
   */
  generationAllowed = true,
): AsyncGenerator<ExplainEvent> {
  const key = cacheKeyFor({
    nodeRef: spot.nodeRef,
    handKey: spot.handKey,
    chosenAction: grade.chosenAction,
    skillTier: profile.skillTier,
  });

  const cached = await getCachedExplanation(key);
  if (cached !== null) {
    yield { type: "text", text: cached };
    yield {
      type: "done",
      source: "cache",
      redactedFor: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    return;
  }

  const template = (reason: string | null): ExplainEvent[] => [
    { type: "text", text: templateExplanation(grade, profile.skillTier) },
    {
      type: "done",
      source: "template",
      redactedFor: reason,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    },
  ];

  if (!generationAllowed) {
    for (const event of template("budget_exhausted")) yield event;
    return;
  }

  const context = buildCoachContext(spot, grade, profile, rationale);
  const stream = await streamCoached({
    system: COACH_SYSTEM_PROMPT,
    prompt: `${context.text}\n\n${explanationInstruction(grade.grade, grade.displayMode, profile.skillTier)}`,
  });

  if (!stream.ok) {
    for (const event of template(stream.reason)) yield event;
    return;
  }

  let accumulated = "";
  let buffer = "";

  try {
    for await (const chunk of stream.chunks) {
      buffer += chunk;
      const { emit, rest } = splitAtLastSentence(buffer);
      if (emit === "") continue;

      const candidate = accumulated + emit;
      const checked = redact(candidate, grade, profile.skillTier);
      if (!checked.safe) {
        yield { type: "reset" };
        for (const event of template(checked.reason)) yield event;
        return;
      }

      accumulated = candidate;
      buffer = rest;
      yield { type: "text", text: emit };
    }
  } catch {
    // A mid-stream failure. Whatever was emitted has already passed the guard,
    // so it is true — but a half explanation is not one, so replace it.
    yield { type: "reset" };
    for (const event of template("stream_failed")) yield event;
    return;
  }

  // The trailing fragment, and the final whole-text check.
  const full = (accumulated + buffer).trim();
  const checked = redact(full, grade, profile.skillTier);

  if (!checked.safe) {
    yield { type: "reset" };
    for (const event of template(checked.reason)) yield event;
    return;
  }

  const tail = buffer.trim();
  if (tail !== "") yield { type: "text", text: tail };

  await putCachedExplanation(key, checked.text, stream.model);

  const usage = await stream.usage();
  yield {
    type: "done",
    source: "model",
    redactedFor: null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: costUsd(usage.inputTokens, usage.outputTokens),
  };
}
