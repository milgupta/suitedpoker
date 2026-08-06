import "server-only";

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { invalidateEntitlement } from "@/lib/entitlement";
import { getStripe, planForPriceId } from "@/lib/stripe/client";
import type { PlanId } from "@/lib/stripe/plans";

/**
 * Stripe's subscription state, written into our table.
 *
 * EVERY webhook path funnels through `syncSubscription`, and it always re-reads
 * the subscription from Stripe rather than trusting the event payload. Stripe
 * does not guarantee delivery order — a `customer.subscription.updated` from
 * 09:00:01 can arrive after the one from 09:00:04 — so applying payloads in
 * receipt order will eventually write a stale status and lock out a paying
 * customer. Re-fetching means the last write is always the current truth, at
 * the cost of one API call per event.
 */

export interface SyncedSubscription {
  readonly userId: string;
  readonly subscriptionId: string;
  readonly status: string;
  readonly plan: PlanId | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly pastDueSince: Date | null;
}

/**
 * The period end, which lives on the ITEM in API 2025-03-31 and later.
 *
 * It was moved off the subscription object, and reading the old location gives
 * `undefined` rather than an error — which would write a null period end, which
 * `isEntitled` reads as "not entitled". A paying customer, locked out, with
 * every log line green. Take the latest item: with one item it is that item,
 * and with several the subscription is live until the last of them ends.
 */
export function periodEndOf(subscription: Stripe.Subscription): Date | null {
  let latest = 0;
  for (const item of subscription.items.data) {
    if (item.current_period_end > latest) latest = item.current_period_end;
  }
  return latest === 0 ? null : new Date(latest * 1000);
}

export function priceIdOf(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price.id ?? null;
}

/**
 * Whose subscription this is.
 *
 * Checkout writes `userId` onto both the session and the subscription, so the
 * metadata is the primary source. The customer is the fallback for a
 * subscription created in the Stripe dashboard by hand, which carries no
 * metadata of ours.
 */
export async function userIdForSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromSubscription = subscription.metadata?.userId;
  if (typeof fromSubscription === "string" && fromSubscription !== "") return fromSubscription;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  try {
    const customer = await getStripe().customers.retrieve(customerId);
    if (!customer.deleted) {
      const fromCustomer = customer.metadata?.userId;
      if (typeof fromCustomer === "string" && fromCustomer !== "") return fromCustomer;
    }
  } catch {
    // Falls through to the local lookup below.
  }

  // Last resort: we have seen this customer before.
  const [row] = await getDb()
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  return row?.userId ?? null;
}

/**
 * When the current past_due spell began.
 *
 * Preserved across retries on purpose. Stripe re-sends `invoice.payment_failed`
 * for each retry, and stamping `now` every time would push the grace period out
 * indefinitely — a card that never succeeds would keep its access forever.
 */
function nextPastDueSince(status: string, existing: Date | null, now: Date): Date | null {
  if (status !== "past_due") return null;
  return existing ?? now;
}

export async function syncSubscription(
  subscriptionId: string,
  now: Date = new Date(),
): Promise<SyncedSubscription | null> {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return syncFromObject(subscription, now);
}

export async function syncFromObject(
  subscription: Stripe.Subscription,
  now: Date = new Date(),
): Promise<SyncedSubscription | null> {
  const userId = await userIdForSubscription(subscription);
  if (userId === null) {
    console.error(`[stripe] no userId for subscription ${subscription.id}; not synced`);
    return null;
  }

  const db = getDb();
  const [existing] = await db
    .select({ pastDueSince: subscriptions.pastDueSince })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = priceIdOf(subscription);

  const row = {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    priceId,
    currentPeriodEnd: periodEndOf(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    pastDueSince: nextPastDueSince(subscription.status, existing?.pastDueSince ?? null, now),
  };

  // Keyed on the Stripe subscription id, which has a unique index. Keying on
  // userId instead would collapse a user's history into one row and lose the
  // old subscription the moment they resubscribe.
  await db
    .insert(subscriptions)
    .values(row)
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        userId: row.userId,
        stripeCustomerId: row.stripeCustomerId,
        status: row.status,
        priceId: row.priceId,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        pastDueSince: row.pastDueSince,
      },
    });

  // Without this the user waits up to 60s after paying to be let in — which,
  // right after a redirect from checkout, reads as "it took my money and it is
  // still asking me to subscribe".
  await invalidateEntitlement(userId);

  return {
    userId,
    subscriptionId: subscription.id,
    status: subscription.status,
    plan: planForPriceId(priceId),
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    pastDueSince: row.pastDueSince,
  };
}
