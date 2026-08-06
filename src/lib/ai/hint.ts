import "server-only";

import { createHash } from "node:crypto";
import { cacheGet, cacheSet } from "@/lib/redis";
import { generateCoached, isAiConfigured } from "./client";
import { buildHintContext } from "./context";
import { COACH_SYSTEM_PROMPT, HINT_INSTRUCTIONS, PROMPT_VERSION } from "./prompts";
import { redactHint } from "./redact";
import { CACHE_TTL_SECONDS } from "./cache";
import { templateHint, type HintLevel, type HintSpotView } from "@/lib/hints";
import type { ClientSpot } from "@/poker/generator";

/**
 * Hint generation.
 *
 * The order is cache, model, template — the same as the explanation — but with
 * one extra step the explanation does not need: a level-1 or level-2 hint that
 * names an action is REGENERATED ONCE before falling back. A leaked hint is not
 * a worse hint, it is the answer, so it is worth paying for a second roll before
 * settling for the template.
 */

export type HintSource = "cache" | "model" | "template";

export interface HintResult {
  readonly level: HintLevel;
  readonly text: string;
  readonly source: HintSource;
  readonly redactedFor: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export function hintCacheKeyFor(input: {
  nodeRef: string;
  handKey: string;
  level: HintLevel;
}): string {
  return createHash("sha256")
    .update(["hint", input.nodeRef, input.handKey, String(input.level), PROMPT_VERSION].join("|"))
    .digest("hex");
}

export interface HintInput {
  readonly nodeRef: string;
  readonly handKey: string;
  readonly clientSpot: ClientSpot;
  readonly view: HintSpotView;
  readonly strategy: { bestAction: string; mix: Record<string, number> };
}

export async function generateHint(
  input: HintInput,
  level: HintLevel,
  /**
   * False once 4.5's circuit breaker has cut the cheap paths. Hints are the
   * first thing to degrade: `templateHint` is built from the same solution
   * data and is guaranteed by construction to name no action at levels 1 and 2,
   * which is the only property a hint has to have.
   */
  generationAllowed = true,
): Promise<HintResult> {
  const key = hintCacheKeyFor({ nodeRef: input.nodeRef, handKey: input.handKey, level });

  const cached = await cacheGet<string>(`hint:${key}`);
  if (cached !== null) {
    return {
      level,
      text: cached,
      source: "cache",
      redactedFor: null,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const fallback = (reason: string | null): HintResult => ({
    level,
    text: templateHint(level, input.view, level === 3 ? input.strategy.bestAction : null),
    source: "template",
    redactedFor: reason,
    inputTokens: 0,
    outputTokens: 0,
  });

  if (!generationAllowed) return fallback("budget_exhausted");
  if (!isAiConfigured()) return fallback("not_configured");

  const context = buildHintContext(
    { ...input.clientSpot, nodeRef: input.nodeRef },
    level,
    input.strategy,
  );

  let inputTokens = 0;
  let outputTokens = 0;
  let lastReason: string | null = null;

  // Two attempts at most: the first roll, and one regeneration if the guard
  // trips. A third would be paying twice for a model that is not listening.
  for (let attempt = 0; attempt < 2; attempt++) {
    const generated = await generateCoached({
      system: COACH_SYSTEM_PROMPT,
      prompt: `${context.text}\n\n${HINT_INSTRUCTIONS[level]}`,
      maxOutputTokens: 120,
      // Slightly higher on the retry: repeating the same sample at the same
      // temperature is unlikely to produce a different verdict.
      temperature: attempt === 0 ? 0.4 : 0.8,
    });

    if (!generated.ok) return fallback(generated.reason);

    inputTokens += generated.inputTokens;
    outputTokens += generated.outputTokens;

    const checked = redactHint(generated.text, level, input.clientSpot.legalActions);
    if (checked.safe) {
      await cacheSet(`hint:${key}`, checked.text, CACHE_TTL_SECONDS);
      return {
        level,
        text: checked.text,
        source: "model",
        redactedFor: null,
        inputTokens,
        outputTokens,
      };
    }

    lastReason = checked.reason;
  }

  return { ...fallback(lastReason), inputTokens, outputTokens };
}
