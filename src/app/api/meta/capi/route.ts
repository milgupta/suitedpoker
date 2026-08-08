import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { clientEnv } from "@/lib/env";
import { sendEvent, buildUserData, isCapiConfigured } from "@/lib/meta-capi";
import { effectiveAttribution, requestIdentity } from "@/lib/attribution-server";

/**
 * The server half of a browser-side pixel event.
 *
 * The browser fires the pixel and calls this with the SAME event id. Meta then
 * deduplicates the pair into one conversion — which is the whole design. A
 * different id on each side reports two conversions for one sale, halving the
 * apparent cost per acquisition and training the optimiser on events that never
 * happened.
 *
 * Purchase does NOT come through here. It is sent from the Stripe webhook,
 * where the amount is known to be real; a client that could report its own
 * purchases could report ones it never made.
 */

const bodySchema = z.object({
  // Purchase is deliberately absent.
  eventName: z.enum(["ViewContent", "InitiateCheckout", "Lead"]),
  eventId: z.string().min(8).max(100),
  sourceUrl: z.string().url().max(500).optional(),
  customData: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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

  // VALIDATED BEFORE the configuration check, deliberately. With that order
  // reversed, an unconfigured pixel answered a forged `Purchase` with a 200 —
  // so the rejection that stops a client reporting its own sales was silently
  // conditional on an env var being set.
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  if (!isCapiConfigured()) {
    // 200, not an error. A missing pixel is a configuration state, and a client
    // that treats it as a failure would retry forever.
    return NextResponse.json({ sent: false, reason: "not_configured" });
  }

  const {
    data: { user },
  } = await auth.supabase.auth.getUser();

  // The profile row FILLED IN FROM THE COOKIE. A Lead fired during onboarding
  // can beat the layout's capture to the database, and the fbc it would have
  // carried is on this very request.
  const [attribution, identity] = await Promise.all([
    effectiveAttribution(auth.userId),
    requestIdentity(),
  ]);

  const result = await sendEvent({
    eventName: parsed.data.eventName,
    eventId: parsed.data.eventId,
    userData: buildUserData({
      email: user?.email,
      attribution,
      ip: identity.ip,
      userAgent: identity.userAgent,
    }),
    sourceUrl: parsed.data.sourceUrl ?? clientEnv.NEXT_PUBLIC_SITE_URL,
    customData: parsed.data.customData,
  });

  // `sent` means it reached Meta. Outside production `delivery` is "logged" and
  // `sent` is false — a dev run must not be indistinguishable from a live one.
  return NextResponse.json({
    sent: result.delivery === "sent",
    delivery: result.delivery,
    queued: result.queued,
    reason: result.reason,
  });
});
