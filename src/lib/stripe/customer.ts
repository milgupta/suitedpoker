import "server-only";

import { desc, eq, isNotNull, and } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getStripe } from "./client";

/**
 * One Stripe customer per user, forever.
 *
 * A duplicate customer is not a cosmetic problem: it splits a person's billing
 * history in two, breaks the portal (which shows one customer's invoices), and
 * makes revenue-per-user arithmetic quietly wrong. So the id is read from the
 * database first and only created when there genuinely is not one.
 */

export async function findCustomerId(userId: string): Promise<string | null> {
  try {
    const [row] = await getDb()
      .select({ id: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), isNotNull(subscriptions.stripeCustomerId)))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the user's Stripe customer id, creating one if needed.
 *
 * The Stripe-side search is a second line of defence: if the database lost the
 * id — a failed write, a restored backup — creating a fresh customer would give
 * this person two. Searching by our own `userId` metadata finds the original.
 */
export async function ensureCustomer(userId: string, email: string): Promise<string> {
  const existing = await findCustomerId(userId);
  if (existing !== null) return existing;

  const stripe = getStripe();

  const found = await stripe.customers.search({
    query: `metadata['userId']:'${userId}'`,
    limit: 1,
  });
  const recovered = found.data[0]?.id;
  if (recovered !== undefined) {
    await rememberCustomer(userId, recovered);
    return recovered;
  }

  const created = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await rememberCustomer(userId, created.id);
  return created.id;
}

/**
 * Records the customer id before checkout rather than after.
 *
 * The row exists with no subscription and no status, which the entitlement rule
 * reads as "not entitled" — so this cannot accidentally let anyone in. Writing
 * it now is what stops a second checkout creating a second customer when the
 * webhook has not landed yet.
 */
async function rememberCustomer(userId: string, customerId: string): Promise<void> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (row === undefined) {
      await db.insert(subscriptions).values({ userId, stripeCustomerId: customerId });
    } else {
      await db
        .update(subscriptions)
        .set({ stripeCustomerId: customerId })
        .where(eq(subscriptions.id, row.id));
    }
  } catch {
    // Checkout must still work. The webhook writes the customer id again, so a
    // failure here costs a duplicate-customer check, not the sale.
  }
}
