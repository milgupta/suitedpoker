import "server-only";

import { generateCoached } from "@/lib/ai/client";
import { COACH_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { contentViolation } from "@/lib/ai/redact";
import { cacheGet, cacheSet } from "@/lib/redis";
import type { Leak } from "@/poker/grader";
import { describeLeak, type GradedDecision, type SessionStats } from "@/lib/sim-review";
import { evFromBb, rateFromBb100, RATE_LABEL } from "@/lib/units";

/**
 * The AI session summary: ONE model call for the whole session, whatever the
 * hand count. Per-hand explanations at 50 hands would be fifty times the cost
 * for a review most users skim once — the single summary is the cost-control
 * decision the plan names, and the test that counts model calls enforces it.
 */

export interface SessionSummary {
  readonly text: string;
  readonly source: "cache" | "model" | "template";
}

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export function buildSummaryPrompt(
  stats: SessionStats,
  worst: readonly GradedDecision[],
  leaks: readonly Leak[],
): string {
  const lines = [
    `SESSION STATS (ground truth — do not contradict, do not invent numbers)`,
    `Hands: ${stats.hands}. Net: ${stats.netBb}bb (${stats.bb100}bb/100).`,
    `VPIP ${stats.vpip}% · PFR ${stats.pfr}%.`,
    `Biggest pot won ${stats.biggestPotWonBb}bb, biggest lost ${stats.biggestPotLostBb}bb.`,
    ``,
    `WORST DECISIONS`,
    ...worst
      .slice(0, 5)
      .map(
        (d) =>
          `Hand ${d.handNumber}: chose ${d.chosenAction}, graded ${d.grade}, gave up ${evFromBb(d.evLoss)}.`,
      ),
    ``,
    `DETECTED LEAKS`,
    ...(leaks.length === 0
      ? ["(none crossed the detection threshold)"]
      : leaks.slice(0, 3).map((l) => describeLeak(l))),
    ``,
    `Write 3-4 sentences naming the SINGLE most valuable thing this player`,
    `should fix, with one concrete next action. Use their actual numbers.`,
    `Specific and encouraging. "You played fine" is a failure; naming a number`,
    `and what solid players do instead is the bar.`,
  ];
  return lines.join("\n");
}

/** True and specific with no model: the top leak or the worst decision. */
export function templateSummary(
  stats: SessionStats,
  worst: readonly GradedDecision[],
  leaks: readonly Leak[],
): string {
  const topLeak = leaks[0];
  if (topLeak !== undefined) {
    return `${describeLeak(topLeak)} That is the single most valuable thing to fix from this session. Run a targeted drill on that exact spot before your next session — ten repetitions will move it.`;
  }

  const worstOne = worst[0];
  if (worstOne !== undefined) {
    return `Over ${stats.hands} hands you ran at ${rateFromBb100(stats.bb100)} ${RATE_LABEL} with a VPIP of ${stats.vpip}%. Your most expensive moment was hand ${worstOne.handNumber}, where ${worstOne.chosenAction} gave up ${evFromBb(worstOne.evLoss)} — open that replay and walk through it once. One reviewed mistake is worth more than ten new hands.`;
  }

  return `Over ${stats.hands} hands you ran at ${rateFromBb100(stats.bb100)} ${RATE_LABEL} with a VPIP of ${stats.vpip}% and a PFR of ${stats.pfr}%. No decision crossed the grading threshold — keep the sample growing and the numbers will start pointing somewhere.`;
}

export async function generateSessionSummary(
  sessionId: string,
  stats: SessionStats,
  worst: readonly GradedDecision[],
  leaks: readonly Leak[],
): Promise<SessionSummary & { inputTokens: number; outputTokens: number }> {
  // Cached per session: a re-opened review page is not a second model call.
  const cacheKey = `simreview:${sessionId}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached !== null) {
    return { text: cached, source: "cache", inputTokens: 0, outputTokens: 0 };
  }

  const fallback = templateSummary(stats, worst, leaks);

  const result = await generateCoached({
    system: COACH_SYSTEM_PROMPT,
    prompt: buildSummaryPrompt(stats, worst, leaks),
    maxOutputTokens: 260,
  });

  if (!result.ok) {
    return { text: fallback, source: "template", inputTokens: 0, outputTokens: 0 };
  }

  // The summary grounds in aggregate stats, not one graded decision, so the
  // guard here is the content rules — money, sites, solver claims.
  const violation = contentViolation(result.text);
  if (violation !== null) {
    return {
      text: fallback,
      source: "template",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  await cacheSet(cacheKey, result.text, CACHE_TTL_SECONDS);
  return {
    text: result.text,
    source: "model",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
