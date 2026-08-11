import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyChallenges } from "@/db/schema";
import { loadAllSolutionData, loadSolutionData } from "@/lib/solution-data";
import { generateSpot, type Spot } from "@/poker/generator";
import type { HandKey } from "@/poker/range";
import type { HeroPosition } from "@/poker/solutions";
import { DAILY_DIFFICULTIES, seedForDate } from "@/lib/daily";

/**
 * Builds the five spots for a date.
 *
 * Deterministic by construction — the seed comes from the date string and
 * nothing else, so every user gets the same challenge and the cron can be
 * retried without producing a different one.
 */
/**
 * Deterministic per date, so the result is memoised per process. Every answer
 * and every /today load used to rebuild all five spots; cheap CPU, but pure
 * waste on the hottest daily path. Two entries cover the timezone straddle
 * (users on both sides of midnight hit the same instance).
 */
const spotsByDate = new Map<string, Spot[]>();

export function buildDailySpots(dateKey: string): Spot[] {
  const cached = spotsByDate.get(dateKey);
  if (cached !== undefined) return cached;

  const data = loadSolutionData();
  const seen: string[] = [];

  const spots = DAILY_DIFFICULTIES.map((difficulty, index) => {
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

  if (spotsByDate.size > 4) spotsByDate.clear();
  spotsByDate.set(dateKey, spots);
  return spots;
}

/**
 * Fetches today's challenge, creating it if the cron has not run.
 *
 * The insert is ON CONFLICT DO NOTHING against the UNIQUE date, so two
 * concurrent first-visitors cannot create two different challenges.
 */
type ChallengeRow = {
  id: string;
  spotRefs: { seed: string; nodeRef: string; handKey: string; difficulty: number }[];
};

/**
 * The five spots of an ALREADY-CREATED challenge, regenerated from its stored
 * refs — never from a fresh buildDailySpots run.
 *
 * The distinction is what survives a deploy. buildDailySpots is deterministic
 * in the date AND the solution data: repairing one EV column changes the
 * difficulty search, which changes which node the generator picks — and the
 * old code compared that fresh rebuild against the stored refs and returned
 * 409 for every answer until midnight. Found live: the day the limp EVs were
 * repaired, the whole daily 409'd. The stored refs carry the seed, node and
 * hand; pinning all three regenerates the spot the user was actually shown.
 *
 * Regeneration reads the FULL data set: if a node is quarantined mid-day, the
 * user who already started the challenge is graded against what they saw, not
 * cut off.
 */
export function challengeSpots(challenge: ChallengeRow): Spot[] {
  const data = loadAllSolutionData();
  return challenge.spotRefs.map((ref) => {
    const [heroPos, actionSeq] = ref.nodeRef.split(":");
    return generateSpot(
      {
        type: "preflop",
        heroPos: heroPos as HeroPosition,
        actionSeq,
        forceHandKey: ref.handKey as HandKey,
      },
      data,
      ref.seed,
    );
  });
}

/**
 * A challenge row never changes once created, so a warm instance answers from
 * memory: one fewer Postgres round trip on every daily answer.
 */
const challengeByDate = new Map<string, ChallengeRow>();

export async function ensureChallenge(dateKey: string): Promise<ChallengeRow> {
  const cached = challengeByDate.get(dateKey);
  if (cached !== undefined) return cached;

  const row = await ensureChallengeUncached(dateKey);
  if (challengeByDate.size > 4) challengeByDate.clear();
  challengeByDate.set(dateKey, row);
  return row;
}

async function ensureChallengeUncached(dateKey: string): Promise<ChallengeRow> {
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
