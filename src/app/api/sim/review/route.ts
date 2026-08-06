import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getDb } from "@/db";
import { aiUsage, simHands, simSessions } from "@/db/schema";
import { detectLeaks } from "@/poker/grader";
import { COACH_MODEL, costUsd } from "@/lib/ai/client";
import { buildArenaLink } from "@/lib/arena-preset";
import {
  computeSessionStats,
  describeLeak,
  heroAttempts,
  replaySteps,
  worstDecisions,
  type StoredHand,
} from "@/lib/sim-review";
import { generateSessionSummary } from "@/lib/sim-review-ai";
import type { HandHistory } from "@/poker/gamestate";
import type { HeroPosition } from "@/poker/solutions";

/**
 * The whole review in one response, computed from the stored hands.
 *
 * The replays sent here contain the HERO's cards only. The session is over,
 * but a folded villain's cards were never earned — mucked cards stay mucked,
 * exactly as at a real table. What showdown revealed is already in the events.
 */
export const GET = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (sessionId === null || sessionId === "") {
    return NextResponse.json({ error: "missing_session" }, { status: 400 });
  }

  const db = getDb();

  // Ownership first. Missing and someone else's are indistinguishable.
  const [session] = await db
    .select({ id: simSessions.id, config: simSessions.config })
    .from(simSessions)
    .where(and(eq(simSessions.id, sessionId), eq(simSessions.userId, auth.userId)))
    .limit(1);
  if (session === undefined) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  const rows = await db
    .select({ handHistory: simHands.handHistory })
    .from(simHands)
    .where(eq(simHands.sessionId, sessionId))
    .orderBy(asc(simHands.createdAt));

  const hands: StoredHand[] = [];
  for (const row of rows) {
    const stored = row.handHistory as
      (HandHistory & { record: StoredHand["record"]; heroSeat?: number }) | null;
    if (stored?.record === undefined) continue;
    hands.push({ history: stored, heroSeat: stored.heroSeat ?? 0, record: stored.record });
  }

  const stats = computeSessionStats(hands);
  const worst = worstDecisions(hands);
  const leaks = detectLeaks(heroAttempts(hands)).slice(0, 3);

  const summary = await generateSessionSummary(sessionId, stats, worst, leaks);

  if (summary.inputTokens > 0 || summary.outputTokens > 0) {
    try {
      await db.insert(aiUsage).values({
        userId: auth.userId,
        endpoint: "sim_review",
        model: summary.source === "model" ? COACH_MODEL : summary.source,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
        costUsd: costUsd(summary.inputTokens, summary.outputTokens).toFixed(6),
        cached: false,
      });
    } catch {
      // Telemetry never costs the user their review.
    }
  }

  return NextResponse.json({
    stats,
    worst,
    leaks: leaks.map((leak) => ({
      ...leak,
      description: describeLeak(leak),
      drillLink: buildArenaLink({
        config: {
          type: "preflop",
          heroPos: leak.position as HeroPosition,
          actionSeq: leak.actionSeq,
        },
        length: 10,
        label: `Fixing: ${leak.position} ${leak.actionSeq.replace(/_/g, " ")}`,
        returnTo: "/table",
      }),
    })),
    summary: { text: summary.text, source: summary.source },
    hands: hands.map((hand) => hand.record),
    replays: Object.fromEntries(hands.map((hand) => [hand.record.handNumber, replaySteps(hand)])),
  });
});
