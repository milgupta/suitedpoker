import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getSession, putSession } from "@/lib/sessionstore";
import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot, toClientSpot } from "@/poker/generator";
import { nodeRefOf } from "@/poker/solutions";
import { getStrategy } from "@/poker/solutions";
import { generateHint } from "@/lib/ai/hint";
import { MAX_HINTS_PER_DAY, preflopContextOf, streetOf, type HintLevel } from "@/lib/hints";
import { COACH_MODEL, costUsd } from "@/lib/ai/client";
import { spotConfigSchema } from "@/lib/arena-preset";
import { SPOT_TTL_SECONDS } from "../../drills/next/route";

const bodySchema = z.object({
  spotId: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

interface StoredSpot {
  seed: string;
  nodeRef: string;
  handKey: string;
  config: z.infer<typeof spotConfigSchema>;
  answered: boolean;
  /** Hints already served for this spot, indexed by level. */
  hints?: Record<string, string>;
}

/**
 * The pre-decision hint.
 *
 * Three boundaries, in order:
 *
 *   1. `getSession` returns null for another user's spotId, so a cross-user
 *      request is indistinguishable from a missing one.
 *   2. An answered spot is refused — after the answer, the explanation endpoint
 *      is the right one, and a "hint" then would just be a second explanation.
 *   3. Levels are sequential. You cannot jump to level 3, because the UI shows
 *      an escalation and the rating penalty is computed from the level reached.
 *
 * The level reached is recorded ON THE SESSION, not taken from the client.
 * Trusting a client-supplied `hintsUsed` would let a user take three hints and
 * then claim none, which is the whole penalty gone.
 */
export const POST = withEntitlement(async (request, auth) => {
  const burst = await limit(auth.userId, RULES.COACH_HINT);
  if (!burst.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: burst.resetAt }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const level = parsed.data.level as HintLevel;

  const stored = await getSession<StoredSpot>("drill", parsed.data.spotId, auth.userId);
  if (stored === null) return NextResponse.json({ error: "spot_not_found" }, { status: 404 });

  if (stored.answered) {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  const served = stored.hints ?? {};
  const reached = Math.max(0, ...Object.keys(served).map(Number));

  if (level > reached + 1) {
    return NextResponse.json({ error: "level_out_of_order" }, { status: 400 });
  }

  // A repeat of a level already served costs nothing and calls nothing. The UI
  // keeps them all on screen, so a re-request is a refresh, not a new hint.
  const already = served[String(level)];
  if (already !== undefined) {
    const peek = await limit(auth.userId, RULES.HINTS_DAILY, { cost: 0 });
    return NextResponse.json({
      level,
      text: already,
      source: "cache",
      hintsRemaining: peek.remaining,
      maxLevel: 3,
    });
  }

  const budget = await limit(auth.userId, RULES.HINTS_DAILY);
  if (!budget.allowed) {
    // A friendly counter, not an error. Running out of hints is a normal day,
    // and a 429 here would read as a fault in the product.
    return NextResponse.json({
      level,
      text: `You have used all ${MAX_HINTS_PER_DAY} hints for today. They come back at midnight — try this one on your own.`,
      source: "exhausted",
      exhausted: true,
      hintsRemaining: 0,
      resetAt: budget.resetAt,
      maxLevel: 3,
    });
  }

  const data = loadSolutionData();
  const spot = generateSpot(stored.config, data, stored.seed);
  if (spot.nodeRef !== stored.nodeRef || spot.handKey !== stored.handKey) {
    return NextResponse.json({ error: "spot_mismatch" }, { status: 409 });
  }

  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return NextResponse.json({ error: "node_missing" }, { status: 500 });

  const strategyMix = getStrategy(node, spot.handKey);
  const bestAction =
    Object.entries(strategyMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? spot.legalActions[0] ?? "";

  const hint = await generateHint(
    {
      nodeRef: spot.nodeRef,
      handKey: spot.handKey,
      clientSpot: toClientSpot(spot),
      view: {
        heroPos: spot.heroPos,
        street: streetOf(spot.board.length),
        potBb: spot.potBb,
        effStackBb: spot.effStackBb,
        actionHistory: spot.actionHistory,
        legalActions: spot.legalActions,
        handClass: spot.handClass,
        boardCards: spot.board.length,
        preflop: spot.board.length === 0 ? preflopContextOf(node.actionSeq) : null,
      },
      strategy: { bestAction, mix: strategyMix },
    },
    level,
  );

  await putSession(
    "drill",
    parsed.data.spotId,
    auth.userId,
    { ...stored, hints: { ...served, [String(level)]: hint.text } },
    SPOT_TTL_SECONDS,
  );

  if (hint.inputTokens > 0 || hint.outputTokens > 0) {
    try {
      await getDb()
        .insert(aiUsage)
        .values({
          userId: auth.userId,
          endpoint: "coach_hint",
          model: COACH_MODEL,
          inputTokens: hint.inputTokens,
          outputTokens: hint.outputTokens,
          costUsd: costUsd(hint.inputTokens, hint.outputTokens).toFixed(6),
          cached: hint.source === "cache",
        });
    } catch {
      // Usage accounting is telemetry. It never costs the user their hint.
    }
  }

  return NextResponse.json({
    level,
    text: hint.text,
    source: hint.source,
    hintsRemaining: budget.remaining,
    maxLevel: 3,
  });
});
