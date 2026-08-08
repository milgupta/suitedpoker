import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withEntitlement } from "@/lib/api-guard";
import { getDb } from "@/db";
import { dailyResults, dailySpotResults, profiles } from "@/db/schema";
import { buildDailySpots } from "@/lib/daily-server";
import { ensureChallenge } from "@/lib/daily-server";
import { toClientSpot } from "@/poker/generator";
import { localDay } from "@/lib/local-day";
import { currentStreak } from "@/lib/streak";
import { dayNumberFor } from "@/lib/daily";

/**
 * Today's challenge, in the USER'S timezone.
 *
 * The same security rule as the arena: ClientSpots only. The stored spotRefs
 * carry the seed and nodeRef, and they never leave the server.
 */
export const GET = withEntitlement(async (_request, auth) => {
  const db = getDb();

  const [profile] = await db
    .select({
      timezone: profiles.timezone,
      streakCount: profiles.streakCount,
      lastDailyAt: profiles.lastDailyAt,
      freezeMonth: profiles.streakFreezeUsedMonth,
    })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  const timeZone = profile?.timezone ?? "UTC";
  const today = localDay(Date.now(), timeZone).key;

  const challenge = await ensureChallenge(today);

  // Rebuilt as a whole sequence, exactly as it was generated: buildDailySpots
  // threads an accumulating excludeNodeRefs through the five, so regenerating
  // one spot from its seed alone would produce a different node.
  const spots = buildDailySpots(today).map(toClientSpot);

  // Which spots this user has already answered — one attempt each, so this is
  // also the "resume in progress" state.
  const [result] = await db
    .select({
      id: dailyResults.id,
      completedAt: dailyResults.completedAt,
      score: dailyResults.score,
    })
    .from(dailyResults)
    .where(and(eq(dailyResults.userId, auth.userId), eq(dailyResults.challengeId, challenge.id)))
    .limit(1);

  const answered =
    result === undefined
      ? []
      : (
          await db
            .select({
              spotIndex: dailySpotResults.spotIndex,
              grade: dailySpotResults.grade,
              evLoss: dailySpotResults.evLoss,
            })
            .from(dailySpotResults)
            .where(eq(dailySpotResults.resultId, result.id))
        ).map((r) => ({
          spotIndex: r.spotIndex,
          grade: r.grade,
          evLoss: r.evLoss === null ? 0 : Number(r.evLoss),
        }));

  return NextResponse.json({
    date: today,
    dayNumber: dayNumberFor(today),
    challengeId: challenge.id,
    spots,
    answered,
    completed: result?.completedAt != null,
    score: result?.score ?? null,
    streak: currentStreak(
      {
        count: profile?.streakCount ?? 0,
        longest: 0,
        lastPlayedDay: profile?.lastDailyAt ?? null,
        freezeUsedMonth: profile?.freezeMonth?.slice(0, 7) ?? null,
      },
      Date.now(),
      timeZone,
    ),
  });
});
