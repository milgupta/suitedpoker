import { generateSpot, type SolutionData, type Spot, type SpotConfig } from "@/poker/generator";

/**
 * Server-side de-duplication of drill spots.
 *
 * /api/drills/next used to pick uniformly from the served node pool with no
 * memory, so the open Arena's 32 preflop nodes produced an expected first
 * repeated situation around hand 7 and a ~76% chance of a repeat inside ten
 * hands — a paying user's very first session showed them the same decision
 * twice and read as a shallow product. The fix is a rolling window of the last
 * N served node refs per user, passed to the generator as `excludeNodeRefs`.
 *
 * Everything here is pure; the route owns the one Redis read and one write.
 */

/**
 * How many recently served nodes are excluded from the next deal.
 *
 * Sized to one below the LARGEST focus pool (the "Postflop focus" preset
 * matches 13 templates), so a fixed-length focus session cycles its entire
 * pool before any situation comes back. Configs with smaller pools — the
 * 3-bet preset matches 8 nodes, a lesson pin can match 1 — shrink the
 * exclusion via `exclusionAttempts` instead of erroring, which makes the
 * window adaptive without counting pools up front.
 */
export const RECENT_NODES_WINDOW = 12;

/**
 * Two hours: comfortably longer than a sitting, so a coffee break does not
 * reset the window, while a session tomorrow starts from a clean slate.
 */
export const RECENT_NODES_TTL_SECONDS = 2 * 60 * 60;

export function recentNodesKey(userId: string): string {
  return `drill:recent:${userId}`;
}

/**
 * Defensive parse of whatever the cache returned. The window is a heuristic —
 * malformed or half-written data must degrade to "no exclusions", never to a
 * failed deal.
 */
export function parseRecentNodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .slice(-RECENT_NODES_WINDOW);
}

/**
 * Appends a served ref, newest last. A ref seen again moves to the newest slot
 * rather than duplicating — the window means "the last N distinct situations",
 * and a duplicate entry would silently narrow it.
 */
export function pushRecentNode(recent: readonly string[], ref: string): string[] {
  const next = recent.filter((existing) => existing !== ref);
  next.push(ref);
  return next.slice(-RECENT_NODES_WINDOW);
}

/**
 * Exclusion lists to try, strictest first: the full window, then dropping the
 * OLDEST refs one at a time, ending with no exclusion at all.
 *
 * A filtered config can have fewer matching nodes than the window holds, and
 * excluding all of them would empty the candidate pool. Dropping oldest-first
 * keeps the guarantee that actually matters — the hands just played do not
 * come straight back — while relaxing until the pool has a candidate. The
 * empty list is last so the window can never cause a failure the
 * un-deduplicated route would not have had.
 */
export function exclusionAttempts(recent: readonly string[]): string[][] {
  const attempts: string[][] = [];
  for (let drop = 0; drop <= recent.length; drop++) {
    attempts.push(recent.slice(drop));
  }
  return attempts;
}

export interface ServedSpot {
  readonly spot: Spot;
  /**
   * The EXACT config the successful attempt used, exclusions included. This is
   * what must be stored in the session: /api/drills/answer regenerates the spot
   * from the stored config and seed and rejects on a nodeRef mismatch, so
   * storing the pre-exclusion config would 409 every graded answer.
   */
  readonly config: SpotConfig;
}

/**
 * Generates a spot, excluding recently served nodes when the pool allows it.
 *
 * Exclusions a caller pinned on the config itself (the daily batch does this)
 * are honoured in every attempt — only the recency window is negotiable.
 */
export function generateSpotExcludingRecent(
  config: SpotConfig,
  recent: readonly string[],
  data: SolutionData,
  seed: string,
): ServedSpot {
  const pinned = config.excludeNodeRefs ?? [];
  let lastError: unknown = null;

  for (const window of exclusionAttempts(recent)) {
    const attempt: SpotConfig = {
      ...config,
      excludeNodeRefs: [...new Set([...pinned, ...window])],
    };
    try {
      return { spot: generateSpot(attempt, data, seed), config: attempt };
    } catch (error) {
      lastError = error;
    }
  }

  // Even the empty exclusion failed — the config itself matches nothing, which
  // is the caller's fallback case, not ours.
  throw lastError instanceof Error ? lastError : new Error("no spot matches the config");
}
