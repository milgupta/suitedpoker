import { NextResponse } from "next/server";
import { desc, eq, isNotNull, and } from "drizzle-orm";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { getStripe, isStripeConfigured, planForPriceId, priceIdFor } from "@/lib/stripe/client";

/**
 * Monthly → yearly. Upgrades only.
 *
 * This is the ONLY plan-change path in the product. Plan switching is disabled
 * in Stripe's own portal on purpose: 7.5's save offer is this route, so the
 * offer stays under our control and its conversion is measurable. A downgrade
 * through here would let someone drop to monthly mid-year and be refunded the
 * difference, which is a save offer that costs money.
 */
export const POST = withAuth(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const [row] = await getDb()
    .select({
      subscriptionId: subscriptions.stripeSubscriptionId,
      priceId: subscriptions.priceId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, auth.userId), isNotNull(subscriptions.stripeSubscriptionId)),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (row?.subscriptionId == null) {
    return NextResponse.json({ error: "no_subscription" }, { status: 409 });
  }

  const current = planForPriceId(row.priceId);
  if (current === "annual") {
    return NextResponse.json({ error: "already_annual" }, { status: 409 });
  }
  if (current === null) {
    // An unrecognised price means the price ids moved underneath us. Guessing
    // here would charge someone for something nobody can name.
    return NextResponse.json({ error: "unknown_current_plan" }, { status: 409 });
  }

  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(row.subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (itemId === undefined) {
      return NextResponse.json({ error: "no_subscription_item" }, { status: 502 });
    }

    const updated = await stripe.subscriptions.update(row.subscriptionId, {
      items: [{ id: itemId, price: priceIdFor("annual") }],
      // Immediately, and invoiced now. `create_prorations` would leave the
      // credit sitting on the account until the next cycle, which for a monthly
      // subscriber upgrading to yearly is a year away.
      proration_behavior: "always_invoice",
      // An upgrade cancels a pending cancellation — they just bought more.
      cancel_at_period_end: false,
      metadata: { ...subscription.metadata, plan: "annual" },
    });

    return NextResponse.json({
      ok: true,
      plan: "annual",
      status: updated.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[stripe] switch-plan failed for ${auth.userId}: ${message}`);
    return NextResponse.json({ error: "switch_failed" }, { status: 502 });
  }
});
