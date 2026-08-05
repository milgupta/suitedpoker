import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { serverEnv } from "@/lib/env.server";

/**
 * The Gemini client.
 *
 * NEVER THROWS INTO A REQUEST HANDLER. Every failure — no key, timeout, rate
 * limit, malformed response — comes back as a typed result so the caller can
 * fall back to the deterministic template. An AI outage must degrade the
 * explanation, never break the drill loop, because the loop is the product and
 * the explanation is the enhancement.
 */

/** Flash tier: this is a high-volume, low-complexity summarisation job. */
export const COACH_MODEL = "gemini-2.0-flash";
export const TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

export type GenerateFailure = "not_configured" | "timeout" | "rate_limited" | "api_error" | "empty";

export interface GenerateSuccess {
  ok: true;
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface GenerateFailed {
  ok: false;
  reason: GenerateFailure;
}

export type GenerateResult = GenerateSuccess | GenerateFailed;

export function isAiConfigured(): boolean {
  const key = serverEnv().GOOGLE_GENERATIVE_AI_API_KEY;
  return typeof key === "string" && key !== "";
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface GenerateOptions {
  system: string;
  prompt: string;
  /** Short by design — this is a 2-3 sentence explanation. */
  maxOutputTokens?: number;
  temperature?: number;
}

export async function generateCoached(options: GenerateOptions): Promise<GenerateResult> {
  if (!isAiConfigured()) return { ok: false, reason: "not_configured" };

  const google = createGoogleGenerativeAI({
    apiKey: serverEnv().GOOGLE_GENERATIVE_AI_API_KEY,
  });

  let lastReason: GenerateFailure = "api_error";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const result = await generateText({
        model: google(COACH_MODEL),
        system: options.system,
        prompt: options.prompt,
        maxOutputTokens: options.maxOutputTokens ?? 220,
        // Low but not zero: the explanations should not read identically for
        // every user, and a deterministic model is not more accurate here —
        // accuracy comes from the ground truth in the context.
        temperature: options.temperature ?? 0.4,
        abortSignal: controller.signal,
      });

      const text = result.text.trim();
      if (text === "") {
        lastReason = "empty";
      } else {
        return {
          ok: true,
          text,
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
          model: COACH_MODEL,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastReason = controller.signal.aborted
        ? "timeout"
        : /rate.?limit|429|quota/i.test(message)
          ? "rate_limited"
          : "api_error";

      // A timeout is not worth retrying inside a request the user is waiting
      // on — the budget is already spent.
      if (lastReason === "timeout") break;
    } finally {
      clearTimeout(timer);
    }

    // Exponential backoff, but only between attempts we are actually making.
    if (attempt < MAX_ATTEMPTS - 1) await sleep(200 * 2 ** attempt);
  }

  return { ok: false, reason: lastReason };
}

/* ── Cost ────────────────────────────────────────────────────────────────── */

/**
 * Gemini 2.0 Flash pricing, USD per million tokens, as published.
 *
 * Kept here rather than in a doc so the projection in the tests is computed
 * from the same numbers the code uses.
 */
export const PRICE_PER_MILLION = { input: 0.1, output: 0.4 } as const;

export function costUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_PER_MILLION.input +
    (outputTokens / 1_000_000) * PRICE_PER_MILLION.output
  );
}
