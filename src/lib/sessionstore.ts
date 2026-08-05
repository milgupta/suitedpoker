import "server-only";

import { getRedis } from "@/lib/redis";

/**
 * Short-lived server-side state for in-flight interactive sessions — the drill
 * loop (3.2) and the table sim (6.2).
 *
 * It exists so the client never holds authoritative state. The strategy, the
 * EV table and the correct action live here, server-side, and the client is
 * told only what it is allowed to know before it acts.
 *
 * THE OWNERSHIP CHECK IN `getSession` IS A SECURITY BOUNDARY. A session id is
 * guessable in a way a user id is not, so reading a session without proving
 * ownership would let one user pull another's in-flight solution. Do not
 * "optimise" the userId argument away.
 */

export type SessionKind = "drill" | "table" | "diagnosis";

interface Envelope<T> {
  /** The owner. Compared on every read. */
  readonly userId: string;
  readonly payload: T;
  readonly createdAt: number;
}

function keyFor(kind: SessionKind, id: string): string {
  return `sess:${kind}:${id}`;
}

/**
 * Stores session state under an owner.
 *
 * Returns whether the write landed. A caller that gets `false` must not
 * proceed as though the session exists — with the in-memory fallback across
 * multiple instances, a lost write is a session that vanishes mid-hand.
 */
export async function putSession<T>(
  kind: SessionKind,
  id: string,
  userId: string,
  payload: T,
  ttlSeconds: number,
): Promise<boolean> {
  const envelope: Envelope<T> = { userId, payload, createdAt: Date.now() };
  try {
    await getRedis().set(keyFor(kind, id), JSON.stringify(envelope), ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads session state, but ONLY for its owner.
 *
 * Returns null for a missing session, an expired one, and — critically — one
 * belonging to a different user. The caller cannot distinguish those cases,
 * which is deliberate: telling an attacker that a session exists but is not
 * theirs is itself a disclosure.
 */
export async function getSession<T>(
  kind: SessionKind,
  id: string,
  userId: string,
): Promise<T | null> {
  try {
    const raw = await getRedis().get(keyFor(kind, id));
    if (raw === null) return null;

    const envelope = JSON.parse(raw) as Envelope<T>;
    if (envelope.userId !== userId) return null;

    return envelope.payload;
  } catch {
    return null;
  }
}

export async function deleteSession(kind: SessionKind, id: string): Promise<boolean> {
  try {
    await getRedis().del(keyFor(kind, id));
    return true;
  } catch {
    return false;
  }
}
