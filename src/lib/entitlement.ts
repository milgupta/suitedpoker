import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { serverEnv } from "@/lib/env.server";
import { cacheDel, cacheGet, cacheSet } from "@/lib/redis";
import { isEntitled } from "@/lib/entitlement-rule";

/**
 * The one place that answers "is this user allowed in?".
 *
 * Every gate in Stages 3–8 calls this rather than reading the subscriptions
 * table itself. 7.4 hardens it once Stripe is live; the interface does not
 * change then.
 */

export const ENTITLEMENT_TTL_SECONDS = 60;

export class EntitlementError extends Error {
  readonly code = "ENTITLEMENT_REQUIRED";
  constructor(message = "An active subscription is required.") {
    super(message);
    this.name = "EntitlementError";
  }
}

function cacheKey(userId: string): string {
  return `ent:${userId}`;
}

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  // The bypass is checked BEFORE the cache, so flipping it in development takes
  // effect immediately instead of after a 60s wait. env.server.ts forces it off
  // when NODE_ENV is production, structurally — see tests/unit/env.test.ts.
  if (serverEnv().DEV_BYPASS_ENTITLEMENT) return true;

  const cached = await cacheGet<boolean>(cacheKey(userId));
  if (cached !== null) return cached;

  const rows = await getDb()
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      pastDueSince: subscriptions.pastDueSince,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(5);

  // ANY entitling row lets them in, rather than only the one with the latest
  // period end. A past_due subscription's period end is in the PAST, so picking
  // the maximum would rank a long-expired cancelled row above the live one and
  // lock out a customer inside their grace period.
  const entitled = rows.some((row) => isEntitled(row));
  await cacheSet(cacheKey(userId), entitled, ENTITLEMENT_TTL_SECONDS);
  return entitled;
}

/** Busts the cache immediately. 7.4's Stripe webhook calls this. */
export async function invalidateEntitlement(userId: string): Promise<void> {
  await cacheDel(cacheKey(userId));
}

export async function requireEntitlement(userId: string): Promise<void> {
  if (!(await hasActiveSubscription(userId))) throw new EntitlementError();
}

// Re-exported so callers have one import for the whole concept.
export {
  isEntitled,
  ENTITLING_STATUSES,
  PAST_DUE_GRACE_DAYS,
  PAST_DUE_GRACE_MS,
} from "@/lib/entitlement-rule";
export type { SubscriptionLike } from "@/lib/entitlement-rule";
