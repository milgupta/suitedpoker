import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, subscriptions } from "@/db/schema";
import { getStripe, isStripeConfigured, planForPriceId } from "@/lib/stripe/client";
import { PLANS, type PlanId } from "@/lib/stripe/plans";
import { isEntitled } from "@/lib/entitlement-rule";

/**
 * Everything the account screen shows, in one pass.
 *
 * The card's last four digits come from Stripe rather than from our database on
 * purpose — we do not store card data, and a stale copy of it would be worse
 * than none. A Stripe outage degrades that one line to null instead of failing
 * the page: someone who cannot load their settings because a third party is
 * down will assume it is us.
 */

export interface BillingSummary {
  readonly plan: PlanId | null;
  readonly planLabel: string | null;
  readonly amountCents: number | null;
  readonly intervalLabel: string | null;
  readonly status: string | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly entitled: boolean;
  readonly cardBrand: string | null;
  readonly cardLast4: string | null;
  readonly hasCustomer: boolean;
}

export interface AccountData {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly timezone: string | null;
  readonly billing: BillingSummary;
}

const NO_BILLING: BillingSummary = {
  plan: null,
  planLabel: null,
  amountCents: null,
  intervalLabel: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  entitled: false,
  cardBrand: null,
  cardLast4: null,
  hasCustomer: false,
};

async function defaultCard(
  customerId: string,
): Promise<{ brand: string | null; last4: string | null }> {
  try {
    const customer = await getStripe().customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (customer.deleted) return { brand: null, last4: null };

    const pm = customer.invoice_settings?.default_payment_method;
    if (pm === null || pm === undefined || typeof pm === "string") {
      return { brand: null, last4: null };
    }
    return { brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
  } catch {
    return { brand: null, last4: null };
  }
}

export async function loadBilling(userId: string): Promise<BillingSummary> {
  const db = getDb();

  const rows = await db
    .select({
      status: subscriptions.status,
      priceId: subscriptions.priceId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      pastDueSince: subscriptions.pastDueSince,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(5);

  if (rows.length === 0) return NO_BILLING;

  // The live one if there is one; otherwise the most recent, so a cancelled
  // user still sees what they used to have rather than an empty panel.
  const live = rows.find((row) => isEntitled(row));
  const row = live ?? rows[0]!;

  const plan = planForPriceId(row.priceId);
  const customerId = row.stripeCustomerId;

  const card =
    customerId !== null && isStripeConfigured()
      ? await defaultCard(customerId)
      : { brand: null, last4: null };

  return {
    plan,
    planLabel: plan === null ? null : PLANS[plan].label,
    amountCents: plan === null ? null : PLANS[plan].amountCents,
    intervalLabel: plan === null ? null : PLANS[plan].intervalLabel,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    entitled: isEntitled(row),
    cardBrand: card.brand,
    cardLast4: card.last4,
    hasCustomer: customerId !== null,
  };
}

export async function loadAccount(userId: string, email: string): Promise<AccountData> {
  const db = getDb();

  let profile: { displayName: string | null; timezone: string | null } | null = null;
  try {
    const [found] = await db
      .select({ displayName: profiles.displayName, timezone: profiles.timezone })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    profile = found ?? null;
  } catch {
    // Settings must still render so the user can reach billing and support.
  }

  return {
    userId,
    email,
    displayName: profile?.displayName ?? null,
    timezone: profile?.timezone ?? null,
    billing: await loadBilling(userId),
  };
}

/** The Stripe subscription to act on — the live one, never a cancelled one. */
export async function activeSubscriptionId(userId: string): Promise<string | null> {
  const rows = await getDb()
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      pastDueSince: subscriptions.pastDueSince,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(5);

  const live = rows.find((row) => isEntitled(row) && row.stripeSubscriptionId !== null);
  return live?.stripeSubscriptionId ?? null;
}
