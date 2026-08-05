import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withEntitlement } from "@/lib/api-guard";
import { getDb } from "@/db";
import { dailyResults, dailySpotResults, drillAttempts, profiles } from "@/db/schema";
import { buildDailySpots, ensureChallenge } from "@/lib/daily-server";
import { loadSolutionData } from "@/lib/solution-data";
import { grade as gradePreflop } from "@/poker/grader";
import { nodeRefOf, type PreflopActionName } from "@/poker/solutions";
import { localDay } from "@/lib/local-day";
import { completeDaily } from "@/lib/streak";
import { DAILY_SPOT_COUNT, POINTS_FOR_GRADE, scoreDaily } from "@/lib/daily";

const answerSchema = z.object({
  spotIndex: z
    .number()
    .int()
    .min(0)
    .max(DAILY_SPOT_COUNT - 1),
  action: z.string().min(1),
  timeMs: z.number().int().min(0).max(3_600_000),
});

/**
 * One attempt per spot, enforced by the database.
 *
 * daily_spot_results has a UNIQUE(result_id, spot_index), so a second answer
 * fails at the constraint rather than at an application check. That is the
 * difference between a rule and a hope — an application check is bypassed by
 * two concurrent requests, and the leaderboard depends on this holding.
 */
export const POST = withEntitlement(async (request, auth) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { spotIndex, action, timeMs } = parsed.data;

  const db = getDb();

  const [profile] = await db
    .select({
      timezone: profiles.timezone,
      streakCount: profiles.streakCount,
      longest: profiles.longestStreak,
      lastDailyAt: profiles.lastDailyAt,
      freezeMonth: profiles.streakFreezeUsedMonth,
    })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  const timeZone = profile?.timezone ?? "UTC";
  const today = localDay(Date.now(), timeZone).key;
  const challenge = await ensureChallenge(today);

  const ref = challenge.spotRefs[spotIndex];
  if (ref === undefined) return NextResponse.json({ error: "no_such_spot" }, { status: 400 });

  const data = loadSolutionData();
  // Rebuild the WHOLE day, not this spot alone: buildDailySpots threads an
  // accumulating excludeNodeRefs through the sequence, so regenerating one spot
  // from its seed with a bare config produces a different node.
  const spot = buildDailySpots(today)[spotIndex];
  if (spot === undefined || spot.nodeRef !== ref.nodeRef) {
    return NextResponse.json({ error: "spot_mismatch" }, { status: 409 });
  }
  if (!spot.legalActions.includes(action)) {
    return NextResponse.json({ error: "illegal_action" }, { status: 400 });
  }

  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return NextResponse.json({ error: "node_missing" }, { status: 500 });

  const result = gradePreflop(node, spot.handKey, action as PreflopActionName);

  // The result row for this user and challenge.
  await db
    .insert(dailyResults)
    .values({ userId: auth.userId, challengeId: challenge.id })
    .onConflictDoNothing();

  const [row] = await db
    .select({ id: dailyResults.id })
    .from(dailyResults)
    .where(and(eq(dailyResults.userId, auth.userId), eq(dailyResults.challengeId, challenge.id)))
    .limit(1);

  if (row === undefined) return NextResponse.json({ error: "result_missing" }, { status: 500 });

  const attempt = await db
    .insert(drillAttempts)
    .values({
      userId: auth.userId,
      nodeRef: spot.nodeRef,
      heroHand: spot.handKey,
      chosenAction: action,
      grade: result.grade,
      evLoss: result.evLoss.toFixed(3),
      timeMs,
      source: "daily",
    })
    .returning({ id: drillAttempts.id });

  // THE one-attempt guarantee. A duplicate violates the unique index.
  const inserted = await db
    .insert(dailySpotResults)
    .values({
      resultId: row.id,
      spotIndex,
      attemptId: attempt[0]?.id,
      grade: result.grade,
      evLoss: result.evLoss.toFixed(3),
    })
    .onConflictDoNothing({
      target: [dailySpotResults.resultId, dailySpotResults.spotIndex],
    })
    .returning({ id: dailySpotResults.id });

  if (inserted.length === 0) {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  // Tally, and finish the challenge if this was the last spot.
  const answered = await db
    .select({
      spotIndex: dailySpotResults.spotIndex,
      grade: dailySpotResults.grade,
      evLoss: dailySpotResults.evLoss,
    })
    .from(dailySpotResults)
    .where(eq(dailySpotResults.resultId, row.id));

  const tally = scoreDaily(
    answered.map((a) => ({
      spotIndex: a.spotIndex,
      grade: (a.grade ?? "blunder") as keyof typeof POINTS_FOR_GRADE,
      evLoss: Number(a.evLoss ?? 0),
      timeMs: 0,
    })),
  );

  let streakResult = null;
  const finished = answered.length >= DAILY_SPOT_COUNT;

  if (finished) {
    streakResult = completeDaily(
      {
        count: profile?.streakCount ?? 0,
        longest: profile?.longest ?? 0,
        lastPlayedDay: profile?.lastDailyAt ?? null,
        freezeUsedMonth: profile?.freezeMonth?.slice(0, 7) ?? null,
      },
      Date.now(),
      timeZone,
    );

    await db
      .update(dailyResults)
      .set({
        score: tally.score,
        evLossTotal: tally.evLossTotal.toFixed(3),
        completedAt: new Date(),
      })
      .where(eq(dailyResults.id, row.id));

    await db
      .update(profiles)
      .set({
        streakCount: streakResult.count,
        longestStreak: streakResult.longest,
        lastDailyAt: streakResult.lastPlayedDay,
        streakFreezeUsedMonth:
          streakResult.freezeUsedMonth === null ? null : `${streakResult.freezeUsedMonth}-01`,
      })
      .where(eq(profiles.id, auth.userId));
  }

  return NextResponse.json({
    ...result,
    spotIndex,
    score: tally.score,
    answeredCount: answered.length,
    finished,
    streak: streakResult,
  });
});
