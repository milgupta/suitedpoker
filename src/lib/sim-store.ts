import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { simSessions, simHands } from "@/db/schema";
import { getSession, putSession } from "@/lib/sessionstore";
import { currentHandHistory } from "@/lib/sim-server";
import type { LiveSimState, SimHandRecord } from "@/lib/sim";

/**
 * Where a live session is read from and written to.
 *
 * The database row is the truth — it survives cold starts and deploys. The
 * sessionstore is a cache in front of it. Reads try the cache first and fall
 * back to the row; writes go to the row FIRST and then refresh the cache,
 * because a cache that outlives a failed durable write is a session that
 * rolls back the next time the cache expires.
 */

export const SIM_TTL_SECONDS = 6 * 60 * 60;

export async function loadLive(sessionId: string, userId: string): Promise<LiveSimState | null> {
  const cached = await getSession<LiveSimState>("table", sessionId, userId);
  if (cached !== null) return cached;

  try {
    const [row] = await getDb()
      .select({ liveState: simSessions.liveState })
      .from(simSessions)
      .where(and(eq(simSessions.id, sessionId), eq(simSessions.userId, userId)))
      .limit(1);

    if (row?.liveState == null) return null;

    const live = row.liveState as LiveSimState;
    await putSession("table", sessionId, userId, live, SIM_TTL_SECONDS);
    return live;
  } catch {
    return null;
  }
}

export async function saveLive(
  sessionId: string,
  userId: string,
  live: LiveSimState,
): Promise<void> {
  await getDb()
    .update(simSessions)
    .set({
      liveState: live,
      handsPlayed: live.records.length,
      netBb: live.netBbTotal.toFixed(3),
      ...(live.ended ? { endedAt: new Date() } : {}),
    })
    .where(and(eq(simSessions.id, sessionId), eq(simSessions.userId, userId)));

  await putSession("table", sessionId, userId, live, SIM_TTL_SECONDS);
}

/** Persists a finished hand for 6.3's review. Best-effort by design. */
export async function persistHand(
  sessionId: string,
  live: LiveSimState,
  record: SimHandRecord,
): Promise<void> {
  try {
    const history = currentHandHistory(live);
    await getDb()
      .insert(simHands)
      .values({
        sessionId,
        // heroSeat travels with the hand: the review recomputes VPIP/PFR and
        // replays from these rows alone, long after the live session is gone.
        handHistory: { ...history, record, heroSeat: live.heroSeat },
        heroEvLoss: record.heroEvLoss === null ? null : record.heroEvLoss.toFixed(3),
      });
  } catch {
    // The session continues; the review just has one fewer hand.
  }
}
