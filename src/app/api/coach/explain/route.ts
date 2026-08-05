import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getSession } from "@/lib/sessionstore";
import { getDb } from "@/db";
import { aiUsage, profiles } from "@/db/schema";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot } from "@/poker/generator";
import { grade as gradePreflop } from "@/poker/grader";
import { nodeRefOf, type PreflopActionName } from "@/poker/solutions";
import { explainDecision } from "@/lib/ai/coach";
import { spotConfigSchema } from "@/lib/arena-preset";

const bodySchema = z.object({
  spotId: z.string().min(1),
  action: z.string().min(1),
});

interface StoredSpot {
  seed: string;
  nodeRef: string;
  handKey: string;
  config: z.infer<typeof spotConfigSchema>;
  answered: boolean;
}

/**
 * Explains a decision the user has ALREADY made.
 *
 * The spot must be answered first — explaining before the user acts would hand
 * them the answer, which is what /api/coach/hint exists to do safely.
 */
export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.COACH_EXPLAIN);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const stored = await getSession<StoredSpot>("drill", parsed.data.spotId, auth.userId);
  if (stored === null) return NextResponse.json({ error: "spot_not_found" }, { status: 404 });

  if (!stored.answered) {
    // Explaining an unanswered spot is handing over the answer.
    return NextResponse.json({ error: "not_answered_yet" }, { status: 409 });
  }

  const data = loadSolutionData();
  const spot = generateSpot(stored.config, data, stored.seed);
  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return NextResponse.json({ error: "node_missing" }, { status: 500 });

  const result = gradePreflop(node, spot.handKey, parsed.data.action as PreflopActionName);

  const [profile] = await getDb()
    .select({ skillTier: profiles.skillTier, primaryLeak: profiles.primaryLeakKey })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  const explanation = await explainDecision(
    spot,
    result,
    {
      skillTier: profile?.skillTier ?? "beginner",
      leaks: profile?.primaryLeak == null ? [] : [profile.primaryLeak],
    },
    node.notes,
  );

  // Usage is recorded even for a cache hit, at zero cost, so the hit rate is
  // measurable from the same table as the spend.
  try {
    await getDb()
      .insert(aiUsage)
      .values({
        userId: auth.userId,
        endpoint: "coach_explain",
        model: explanation.source === "model" ? "gemini-2.0-flash" : explanation.source,
        inputTokens: explanation.inputTokens,
        outputTokens: explanation.outputTokens,
        costUsd: explanation.costUsd.toFixed(6),
        cached: explanation.source === "cache",
      });
  } catch {
    // Telemetry must never cost the user their explanation.
  }

  return NextResponse.json({ text: explanation.text, source: explanation.source });
});
