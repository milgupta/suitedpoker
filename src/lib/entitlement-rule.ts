/**
 * The entitlement rule itself, with no I/O.
 *
 * Separate from entitlement.ts because middleware runs on the Edge runtime and
 * cannot import postgres.js. Both the cached server path and the middleware
 * path evaluate the SAME predicate, so they can never drift into disagreeing
 * about who has paid.
 */

/** Statuses Stripe reports that still mean "let them in". */
export const ENTITLING_STATUSES = ["active", "trialing"] as const;

export interface SubscriptionLike {
  status: string | null;
  /** ISO string or Date. Null means no known period. */
  currentPeriodEnd: string | Date | null;
}

export function isEntitled(sub: SubscriptionLike | null, now: Date = new Date()): boolean {
  if (sub === null) return false;
  if (sub.status === null) return false;
  if (!(ENTITLING_STATUSES as readonly string[]).includes(sub.status)) return false;

  // An 'active' row whose period has already ended is NOT entitlement. Stripe
  // can lag on status changes, and trusting status alone is how a cancelled
  // user keeps access for a day.
  if (sub.currentPeriodEnd === null) return false;
  const end =
    sub.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd : new Date(sub.currentPeriodEnd);
  if (Number.isNaN(end.getTime())) return false;

  return end.getTime() > now.getTime();
}
