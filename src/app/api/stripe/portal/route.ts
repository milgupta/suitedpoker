import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { clientEnv } from "@/lib/env";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { findCustomerId } from "@/lib/stripe/customer";

/**
 * Opens Stripe's billing portal.
 *
 * `withAuth` rather than `withEntitlement`: someone whose card just failed is
 * exactly the person who needs the portal, and they are not entitled.
 */
export const POST = withAuth(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const customerId = await findCustomerId(auth.userId);
  if (customerId === null) {
    // Nothing to manage. 409 rather than 404 — the user exists, the billing
    // relationship does not.
    return NextResponse.json({ error: "no_customer" }, { status: 409 });
  }

  const origin = clientEnv.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[stripe] portal failed for ${auth.userId}: ${message}`);
    return NextResponse.json({ error: "portal_failed" }, { status: 502 });
  }
});
