import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { getSupabaseAdmin, isAdminConfigured } from "@/lib/supabase/admin";
import { invalidateEntitlement } from "@/lib/entitlement";

/**
 * Deleting an account, permanently.
 *
 * ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE. Stripe is cancelled FIRST, and
 * the account is only deleted if that succeeded. Delete the user first and a
 * failed Stripe call leaves a subscription billing a person who no longer has
 * an account, cannot log in, and cannot cancel — which arrives as a chargeback
 * and a dispute we would lose.
 *
 * Unlike an ordinary cancellation this one is IMMEDIATE. At period end would
 * mean keeping a deleted user's subscription alive for weeks.
 */

const bodySchema = z.object({
  // Typed, not clicked. A confirmation dialog is dismissed by muscle memory;
  // a word has to be read.
  confirm: z.literal("DELETE"),
});

export const POST = withAuth(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.AUTH_ATTEMPT);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!bodySchema.safeParse(body).success) {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // 1. Every Stripe subscription this user has, cancelled now.
  const cancelled: string[] = [];
  if (isStripeConfigured()) {
    const rows = await getDb()
      .select({ id: subscriptions.stripeSubscriptionId })
      .from(subscriptions)
      .where(eq(subscriptions.userId, auth.userId))
      .orderBy(desc(subscriptions.createdAt));

    const stripe = getStripe();
    for (const row of rows) {
      if (row.id === null) continue;
      try {
        const live = await stripe.subscriptions.retrieve(row.id);
        if (live.status !== "canceled" && live.status !== "incomplete_expired") {
          await stripe.subscriptions.cancel(row.id);
        }
        cancelled.push(row.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        console.error(`[delete] could not cancel ${row.id}: ${message}`);
        // Refuse to proceed. A live subscription with no account behind it is
        // worse than an account the user has to ask us to delete again.
        return NextResponse.json({ error: "stripe_cancel_failed" }, { status: 502 });
      }
    }
  }

  // 2. The auth user. Every table's user_id FK is ON DELETE CASCADE, so the
  // profile, attempts, sessions and subscription rows go with it.
  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(auth.userId);
  if (error !== null) {
    console.error(`[delete] auth delete failed for ${auth.userId}: ${error.message}`);
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }

  await invalidateEntitlement(auth.userId);
  await auth.supabase.auth.signOut();

  console.info(`[delete] account ${auth.userId} deleted; cancelled ${cancelled.length} subs`);
  return NextResponse.json({ ok: true, cancelledSubscriptions: cancelled.length });
});
