import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { cancellations } from "@/db/schema";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { activeSubscriptionId, loadBilling } from "@/lib/account-server";
import { isCancelReason, offerFor } from "@/lib/cancellation";
import { syncSubscription } from "@/lib/stripe/sync";
import { captureServer } from "@/lib/analytics-server";
import { invalidateEntitlement } from "@/lib/entitlement";
import { sendTransactional } from "@/lib/email";
import { formatDate } from "@/lib/dunning";

/**
 * Cancelling, at period end.
 *
 * NEVER an immediate cancel. They paid for this period and they keep it — an
 * immediate cancel is a partial refund we did not offer and an angry email we
 * did not need. `cancel_at_period_end` is the whole mechanism.
 *
 * The reason is stored before Stripe is touched. If the Stripe call fails we
 * still know why they tried to leave, and that data is the most valuable thing
 * this endpoint produces.
 */

const bodySchema = z.object({
  reason: z.string().refine(isCancelReason, "unknown reason"),
  /** Which offer they were shown, if any, and whether they took it. */
  offerShown: z.string().max(40).optional(),
  offerAccepted: z.boolean().optional(),
});

export const POST = withAuth(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_reason" }, { status: 400 });

  const billing = await loadBilling(auth.userId);
  const reason = parsed.data.reason;
  const offer = parsed.data.offerShown ?? offerFor(reason, billing.plan).id;

  // Written first, and never allowed to fail the cancellation. Someone blocked
  // from leaving by our own analytics write is a chargeback.
  try {
    await getDb()
      .insert(cancellations)
      .values({
        userId: auth.userId,
        reason,
        offerShown: offer,
        offerAccepted: parsed.data.offerAccepted ?? false,
      });
  } catch (error) {
    console.error(`[cancel] could not record reason for ${auth.userId}: ${String(error)}`);
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const subscriptionId = await activeSubscriptionId(auth.userId);
  if (subscriptionId === null) {
    // Nothing live to cancel. The reason is recorded either way.
    return NextResponse.json({ error: "no_subscription" }, { status: 409 });
  }

  try {
    const updated = await getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      cancellation_details: { comment: reason },
    });

    // Synced immediately rather than waiting for the webhook, so the settings
    // page reflects the cancellation the moment they land back on it.
    await syncSubscription(updated.id);
    await invalidateEntitlement(auth.userId);

    const endsAt = updated.items.data.reduce(
      (latest, item) => Math.max(latest, item.current_period_end),
      0,
    );

    const daysActive =
      updated.start_date > 0
        ? Math.max(0, Math.round((Date.now() / 1000 - updated.start_date) / 86_400))
        : 0;
    await captureServer(auth.userId, "subscription_cancelled", { reason, daysActive });

    // Confirms the exact date, keeps the door open, no guilt. A win-back is
    // far cheaper than a new customer.
    const {
      data: { user },
    } = await auth.supabase.auth.getUser();
    if (user?.email != null) {
      await sendTransactional({
        to: user.email,
        template: "subscription_cancelled",
        data: { accessEndsOn: endsAt === 0 ? null : formatDate(new Date(endsAt * 1000)) },
        idempotencyKey: `cancelled:${subscriptionId}`,
      });
    }

    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: true,
      accessUntil: endsAt === 0 ? null : new Date(endsAt * 1000).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[cancel] stripe failed for ${auth.userId}: ${message}`);
    return NextResponse.json({ error: "cancel_failed" }, { status: 502 });
  }
});
