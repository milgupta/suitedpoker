import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { cacheGet, cacheSet } from "@/lib/redis";
import { getDb } from "@/db";
import { coachCache } from "@/db/schema";
import { solutionSetVersion } from "@/lib/solution-data";
import { PROMPT_VERSION } from "./prompts";

/**
 * Explanation caching.
 *
 * Spots repeat heavily across users — the same node and hand comes up again and
 * again — so a high hit rate is what keeps AI cost near zero rather than near
 * linear in usage. Redis is the hot path; the coach_cache table is the durable
 * mirror so a Redis flush does not mean paying for every explanation twice.
 */

export const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export function cacheKeyFor(input: {
  nodeRef: string;
  handKey: string;
  chosenAction: string;
  skillTier: string;
  /**
   * Both are derived from the node and the chosen action — but only via the EV
   * table, which is exactly the thing an edit changes. Two users choosing the
   * same action on the same hand can be graded differently once the numbers
   * move, and the explanation's whole job is to justify the grade.
   */
  grade: string;
  displayMode: string;
}): string {
  // The prompt version is part of the key, so editing a prompt invalidates only
  // what it produced rather than needing a manual flush. The solution hash does
  // the same for the strategy data — see solutionSetVersion().
  return createHash("sha256")
    .update(
      [
        input.nodeRef,
        input.handKey,
        input.chosenAction,
        input.skillTier,
        input.grade,
        input.displayMode,
        PROMPT_VERSION,
        solutionSetVersion(),
      ].join("|"),
    )
    .digest("hex");
}

export async function getCachedExplanation(key: string): Promise<string | null> {
  const hot = await cacheGet<string>(`coach:${key}`);
  if (hot !== null) return hot;

  try {
    const [row] = await getDb()
      .select({ content: coachCache.content })
      .from(coachCache)
      .where(eq(coachCache.cacheKey, key))
      .limit(1);

    if (row !== undefined) {
      // Warm Redis from the durable copy so the next read is fast.
      await cacheSet(`coach:${key}`, row.content, CACHE_TTL_SECONDS);
      return row.content;
    }
  } catch {
    // A cold cache is a cost problem, never a correctness one.
  }

  return null;
}

export async function putCachedExplanation(
  key: string,
  content: string,
  model: string,
): Promise<void> {
  await cacheSet(`coach:${key}`, content, CACHE_TTL_SECONDS);

  try {
    await getDb()
      .insert(coachCache)
      .values({ cacheKey: key, content, model })
      .onConflictDoNothing({ target: coachCache.cacheKey });
  } catch {
    // Redis already has it; the mirror is an optimisation.
  }
}
