import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getDb } from "@/db";
import { aiUsage, coachMessages, drillAttempts, profiles } from "@/db/schema";
import { loadSolutionData } from "@/lib/solution-data";
import { gradeSpot, strategyForSpot } from "@/lib/grade-spot";
import { generateSpot } from "@/poker/generator";
import { COACH_MODEL } from "@/lib/ai/client";
import { tierOf } from "@/lib/explain-policy";
import { canGenerateFor, recordSpendFor } from "@/lib/ai/budget";
import {
  answerChat,
  atTurnCap,
  MAX_TURNS,
  TURN_CAP_MESSAGE,
  turnsUsed,
  type ChatTurn,
} from "@/lib/ai/chat";
import { spotConfigSchema } from "@/lib/arena-preset";
import { getSession } from "@/lib/sessionstore";

/**
 * Hand-scoped chat.
 *
 * The attempt is the scope AND the authorisation. Every request names an
 * attempt id, the row is read with `user_id` in the WHERE clause rather than
 * checked afterwards, and the hand is regenerated from the stored seed. There
 * is no path here that answers a question about a hand the caller did not play.
 */

const bodySchema = z.object({
  attemptId: z.string().uuid(),
  spotId: z.string().min(1),
  message: z.string().trim().min(1).max(500),
});

interface StoredSpot {
  seed: string;
  nodeRef: string;
  handKey: string;
  config: z.infer<typeof spotConfigSchema>;
  answered: boolean;
}

export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.COACH_CHAT);
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        // A friendly, specific message rather than a raw 429 body. The user
        // reads this, and "429" tells them nothing about what to do.
        message: "You've used today's coach questions — they reset at midnight.",
        resetAt: gate.resetAt,
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const db = getDb();

  // Ownership is in the WHERE clause. A fetch-then-compare leaves a window for
  // someone to forget the compare.
  const [attempt] = await db
    .select({ id: drillAttempts.id, chosenAction: drillAttempts.chosenAction })
    .from(drillAttempts)
    .where(and(eq(drillAttempts.id, parsed.data.attemptId), eq(drillAttempts.userId, auth.userId)))
    .limit(1);

  if (attempt === undefined) {
    // 404, not 403: confirming the row exists would tell a prober that someone
    // else's attempt id is real.
    return NextResponse.json({ error: "attempt_not_found" }, { status: 404 });
  }

  // The cap is checked BEFORE the spot is loaded: it is the cheapest rejection
  // available and it must not depend on any other lookup succeeding.
  const history = await loadHistory(auth.userId, attempt.id);

  if (atTurnCap(history)) {
    return NextResponse.json(
      { capped: true, turnsUsed: turnsUsed(history), maxTurns: MAX_TURNS, text: TURN_CAP_MESSAGE },
      { status: 200 },
    );
  }

  const stored = await getSession<StoredSpot>("drill", parsed.data.spotId, auth.userId);
  if (stored === null) return NextResponse.json({ error: "spot_not_found" }, { status: 404 });
  if (!stored.answered) {
    return NextResponse.json({ error: "not_answered_yet" }, { status: 409 });
  }

  const data = loadSolutionData();
  const spot = generateSpot(stored.config, data, stored.seed);
  const chosen = attempt.chosenAction ?? spot.legalActions[0] ?? "fold";
  const result = gradeSpot(data, spot, chosen, stored.config.type);
  if (result === null) {
    return NextResponse.json({ error: "node_missing" }, { status: 500 });
  }
  const strategy = strategyForSpot(data, spot, stored.config.type);

  let skillTier = tierOf(null);
  let leaks: string[] = [];
  try {
    const [profile] = await db
      .select({ skillTier: profiles.skillTier, primaryLeak: profiles.primaryLeakKey })
      .from(profiles)
      .where(eq(profiles.id, auth.userId))
      .limit(1);
    skillTier = tierOf(profile?.skillTier);
    leaks = profile?.primaryLeak == null ? [] : [profile.primaryLeak];
  } catch {
    // Defaults are the careful end of every scale.
  }

  // Chat is an `expensive` path: it stays live under the soft cap and stops
  // only at the hard one, where every user gets templates. The per-user fair
  // share sits on top — an over-cap user is templated without touching anyone
  // else, and chat is the likeliest surface for one user to burn the pool.
  const generationAllowed = await canGenerateFor(auth.userId, "expensive");

  const reply = await answerChat({
    spot,
    grade: result,
    profile: { skillTier, leaks },
    history,
    question: parsed.data.message,
    rationale: strategy?.notes ?? null,
    generationAllowed,
  });

  await persist(auth.userId, attempt.id, parsed.data.message, reply);
  await recordSpendFor(auth.userId, reply.costUsd);

  return NextResponse.json({
    text: reply.text,
    source: reply.source,
    turnsUsed: turnsUsed(history) + 1,
    maxTurns: MAX_TURNS,
  });
});

/** The transcript for one hand, oldest first. */
export const GET = withEntitlement(async (request, auth) => {
  const attemptId = new URL(request.url).searchParams.get("attemptId");
  if (attemptId === null) return NextResponse.json({ error: "missing_attempt" }, { status: 400 });

  const [attempt] = await getDb()
    .select({ id: drillAttempts.id })
    .from(drillAttempts)
    .where(and(eq(drillAttempts.id, attemptId), eq(drillAttempts.userId, auth.userId)))
    .limit(1);

  if (attempt === undefined) {
    return NextResponse.json({ error: "attempt_not_found" }, { status: 404 });
  }

  const history = await loadHistory(auth.userId, attempt.id);
  return NextResponse.json({
    messages: history,
    turnsUsed: turnsUsed(history),
    maxTurns: MAX_TURNS,
  });
});

async function loadHistory(userId: string, attemptId: string): Promise<ChatTurn[]> {
  try {
    const rows = await getDb()
      .select({ role: coachMessages.role, content: coachMessages.content })
      .from(coachMessages)
      .where(and(eq(coachMessages.userId, userId), eq(coachMessages.attemptId, attemptId)))
      .orderBy(asc(coachMessages.createdAt))
      .limit(2 * MAX_TURNS + 10);

    // Only chat turns. /api/coach/explain writes to the same table with role
    // "explanation" precisely so it is excluded here — as "assistant" it would
    // be replayed as conversation and counted against the cap.
    return rows
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({ role: row.role as ChatTurn["role"], content: row.content }));
  } catch {
    return [];
  }
}

async function persist(
  userId: string,
  attemptId: string,
  question: string,
  reply: {
    text: string;
    source: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  },
): Promise<void> {
  const db = getDb();

  try {
    await db.insert(coachMessages).values([
      { userId, attemptId, role: "user", content: question, tokens: reply.inputTokens },
      { userId, attemptId, role: "assistant", content: reply.text, tokens: reply.outputTokens },
    ]);
  } catch {
    // The user has their answer; history is a nicety.
  }

  try {
    await db.insert(aiUsage).values({
      userId,
      endpoint: "coach_chat",
      model: reply.source === "model" ? COACH_MODEL : reply.source,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      costUsd: reply.costUsd.toFixed(6),
      cached: false,
    });
  } catch {
    // Telemetry never costs the user their answer.
  }
}
