import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyChallenges } from "@/db/schema";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot, type Spot } from "@/poker/generator";
import { DAILY_DIFFICULTIES, seedForDate } from "@/lib/daily";

/**
 * Builds the five spots for a date.
 *
 * Deterministic by construction — the seed comes from the date string and
 * nothing else, so every user gets the same challenge and the cron can be
 * retried without producing a different one.
 */
export function buildDailySpots(dateKey: string): Spot[] {
  const data = loadSolutionData();
  const seen: string[] = [];

  return DAILY_DIFFICULTIES.map((difficulty, index) => {
    const spot = generateSpot(
      { type: "preflop", difficulty, excludeNodeRefs: [...seen] },
      data,
      `${seedForDate(dateKey)}-${index}`,
    );
    // Never the same node twice in one challenge — five spots that are really
    // one spot is the fastest way to make the daily feel cheap.
    seen.push(spot.nodeRef);
    return spot;
  });
}

/**
 * Fetches today's challenge, creating it if the cron has not run.
 *
 * The insert is ON CONFLICT DO NOTHING against the UNIQUE date, so two
 * concurrent first-visitors cannot create two different challenges.
 */
export async function ensureChallenge(dateKey: string): Promise<{
  id: string;
  spotRefs: { seed: string; nodeRef: string; handKey: string; difficulty: number }[];
}> {
  const db = getDb();

  const existing = await db
    .select({ id: dailyChallenges.id, spotRefs: dailyChallenges.spotRefs })
    .from(dailyChallenges)
    .where(eq(dailyChallenges.date, dateKey))
    .limit(1);

  const found = existing[0];
  if (found !== undefined) {
    return {
      id: found.id,
      spotRefs: found.spotRefs as {
        seed: string;
        nodeRef: string;
        handKey: string;
        difficulty: number;
      }[],
    };
  }

  const spots = buildDailySpots(dateKey);
  const spotRefs = spots.map((s) => ({
    seed: s.seed,
    nodeRef: s.nodeRef,
    handKey: s.handKey,
    difficulty: s.difficulty,
  }));

  await db
    .insert(dailyChallenges)
    .values({ date: dateKey, spotRefs })
    .onConflictDoNothing({ target: dailyChallenges.date });

  const [row] = await db
    .select({ id: dailyChallenges.id, spotRefs: dailyChallenges.spotRefs })
    .from(dailyChallenges)
    .where(eq(dailyChallenges.date, dateKey))
    .limit(1);

  if (row === undefined) throw new Error(`could not create the daily challenge for ${dateKey}`);

  return {
    id: row.id,
    spotRefs: row.spotRefs as {
      seed: string;
      nodeRef: string;
      handKey: string;
      difficulty: number;
    }[],
  };
}
