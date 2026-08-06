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

/**
 * How long a failed card keeps its access.
 *
 * Stripe flips a subscription to `past_due` the moment a renewal charge fails,
 * and retries it over the following days. Locking someone out on the first
 * failure locks out a paying customer whose bank declined a routine renewal —
 * which reads as theft, and comes back as a chargeback plus a refund. Three
 * days covers Stripe's first two retries.
 */
export const PAST_DUE_GRACE_DAYS = 3;
export const PAST_DUE_GRACE_MS = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

export interface SubscriptionLike {
  status: string | null;
  /** ISO string or Date. Null means no known period. */
  currentPeriodEnd: string | Date | null;
  /** When the subscription first went past_due. Null when it never has. */
  pastDueSince?: string | Date | null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isEntitled(sub: SubscriptionLike | null, now: Date = new Date()): boolean {
  if (sub === null) return false;
  if (sub.status === null) return false;

  // A failed card is a grace period, not an eviction. Measured from when the
  // failure happened rather than from the period end, because a renewal can
  // fail days before the period actually runs out.
  if (sub.status === "past_due") {
    const since = toDate(sub.pastDueSince);
    // Past due with no recorded start is treated as just-now-failed rather than
    // as forever-failed: an unset timestamp is our bug, and a paying customer
    // should not lose access to it.
    if (since === null) return true;
    return now.getTime() - since.getTime() < PAST_DUE_GRACE_MS;
  }

  if (!(ENTITLING_STATUSES as readonly string[]).includes(sub.status)) return false;

  // An 'active' row whose period has already ended is NOT entitlement. Stripe
  // can lag on status changes, and trusting status alone is how a cancelled
  // user keeps access for a day.
  const end = toDate(sub.currentPeriodEnd);
  if (end === null) return false;

  return end.getTime() > now.getTime();
}
