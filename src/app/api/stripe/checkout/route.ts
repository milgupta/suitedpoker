import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { clientEnv } from "@/lib/env";
import { getStripe, isStripeConfigured, priceIdFor } from "@/lib/stripe/client";
import { ensureCustomer } from "@/lib/stripe/customer";
import { isPlanId, PLANS, type PlanId } from "@/lib/stripe/plans";

const bodySchema = z.object({
  plan: z.string().refine(isPlanId, "unknown plan"),
  /**
   * PostHog's anonymous id. Carried through Stripe so 7.4 can attribute the
   * purchase to the session that produced it — attributed to a fresh anonymous
   * id instead, revenue-by-source is silently wrong.
   */
  distinctId: z.string().max(200).optional(),
  /**
   * The Meta deduplication key, minted by the browser alongside its own
   * InitiateCheckout. Carried through Stripe so the webhook's server-side
   * Purchase and the browser's Purchase share one id and Meta counts one sale.
   */
  metaEventId: z.string().max(100).optional(),
});

/**
 * Starts a checkout.
 *
 * `withAuth`, NOT `withEntitlement`. The person hitting this route is by
 * definition the one without a subscription; gating it behind entitlement would
 * make it impossible to ever buy one.
 */
export const POST = withAuth(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  const plan = parsed.data.plan as PlanId;

  const {
    data: { user },
  } = await auth.supabase.auth.getUser();
  const email = user?.email ?? undefined;
  if (email === undefined) {
    return NextResponse.json({ error: "no_email" }, { status: 400 });
  }

  const origin = clientEnv.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  try {
    const customerId = await ensureCustomer(auth.userId, email);

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      // Both of these matter to 7.4. `client_reference_id` is the one Stripe
      // surfaces on the session; the metadata is what survives onto the
      // subscription object, which later events carry instead.
      client_reference_id: auth.userId,
      metadata: {
        userId: auth.userId,
        plan,
        posthogDistinctId: parsed.data.distinctId ?? "",
        metaEventId: parsed.data.metaEventId ?? "",
      },
      subscription_data: {
        metadata: {
          userId: auth.userId,
          plan,
          posthogDistinctId: parsed.data.distinctId ?? "",
          metaEventId: parsed.data.metaEventId ?? "",
        },
      },
      allow_promotion_codes: true,
      // The webhook can land after this redirect. /welcome is outside the
      // entitlement gate precisely so a paying user is never bounced back here.
      success_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      // The plan rides back so `checkout_abandoned` can name what they walked
      // away from. Without it the drop-off is one undifferentiated number, and
      // "people abandon the annual card" is the actionable half of it.
      cancel_url: `${origin}/paywall?cancelled=1&plan=${plan}`,
    });

    if (session.url === null) {
      return NextResponse.json({ error: "no_checkout_url" }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id, plan });
  } catch (error) {
    // A Stripe outage must read as "try again", never as a crashed page in the
    // one flow that takes money.
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[stripe] checkout failed for ${auth.userId}: ${message}`);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
});

/** Re-exported so the paywall and the tests price from one place. */
export const PLAN_AMOUNTS = {
  monthly: PLANS.monthly.amountCents,
  annual: PLANS.annual.amountCents,
} as const;
