import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { cancellations } from "@/db/schema";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { isCancelReason } from "@/lib/cancellation";

/**
 * A save: they reached the cancellation flow, took the offer, and stayed.
 *
 * Recorded in the same table as an actual cancellation, with
 * `offer_accepted = true` and no Stripe change. Without this row the save rate
 * is unknowable — you would see the reasons of everyone who LEFT and nothing
 * about the offer that worked, which is the number that decides whether the
 * offer is worth making.
 */

const bodySchema = z.object({
  reason: z.string().refine(isCancelReason, "unknown reason"),
  offerShown: z.string().max(40),
  offerAccepted: z.boolean(),
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
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  await getDb().insert(cancellations).values({
    userId: auth.userId,
    reason: parsed.data.reason,
    offerShown: parsed.data.offerShown,
    offerAccepted: parsed.data.offerAccepted,
  });

  return NextResponse.json({ ok: true });
});
