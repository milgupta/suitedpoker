import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { withEntitlement } from "@/lib/api-guard";
import { getDb } from "@/db";
import { dailyResults, profiles } from "@/db/schema";
import { ensureChallenge } from "@/lib/daily-server";
import { localDay } from "@/lib/local-day";
import { compareEntries } from "@/lib/daily";

/**
 * Today's top 100, plus the caller's own rank.
 *
 * The user's rank is ALWAYS returned even when they are rank 4,000 — a
 * leaderboard that shows a beginner nothing about themselves is a leaderboard
 * they never look at twice.
 */
export const GET = withEntitlement(async (_request, auth) => {
  const db = getDb();

  const [profile] = await db
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  const today = localDay(Date.now(), profile?.timezone ?? "UTC").key;
  const challenge = await ensureChallenge(today);

  const rows = await db
    .select({
      userId: dailyResults.userId,
      score: dailyResults.score,
      evLossTotal: dailyResults.evLossTotal,
      completedAt: dailyResults.completedAt,
    })
    .from(dailyResults)
    .where(eq(dailyResults.challengeId, challenge.id))
    .orderBy(desc(dailyResults.score))
    .limit(5000);

  const ranked = rows
    .filter((r) => r.completedAt !== null)
    .map((r) => ({
      userId: r.userId,
      score: r.score ?? 0,
      // Time and sharp count are not yet persisted per result; the comparator
      // handles them, and 3.4's follow-up can fill them in without changing
      // the ordering rule.
      totalTimeMs: 0,
      sharpCount: 0,
    }))
    .sort(compareEntries);

  const meIndex = ranked.findIndex((r) => r.userId === auth.userId);

  return NextResponse.json({
    date: today,
    top: ranked.slice(0, 100).map((r, i) => ({
      rank: i + 1,
      score: r.score,
      isMe: r.userId === auth.userId,
    })),
    me: meIndex === -1 ? null : { rank: meIndex + 1, score: ranked[meIndex]?.score ?? 0 },
    total: ranked.length,
  });
});
