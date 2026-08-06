import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";

/**
 * Display name and timezone.
 *
 * `withAuth`, not `withEntitlement`: someone who has cancelled must still be
 * able to fix their own name, and locking settings behind a subscription is how
 * a support inbox fills up.
 *
 * The TIMEZONE IS NOT COSMETIC. `localDay()` reads it to decide which daily
 * challenge a user gets and whether their streak survived the night, so a wrong
 * timezone silently costs someone a streak they earned.
 */

const bodySchema = z.object({
  // 18 is what the dashboard greeting can show without wrapping; enforced here
  // so the limit lives with the data rather than in a CSS truncation.
  displayName: z.string().trim().max(40).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
});

/** Rejects a made-up zone before it can break a streak calculation. */
function isRealTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

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

  const update: { displayName?: string | null; timezone?: string } = {};

  if (parsed.data.displayName !== undefined) {
    const name = parsed.data.displayName;
    update.displayName = name === null || name === "" ? null : name;
  }

  if (parsed.data.timezone !== undefined) {
    if (!isRealTimezone(parsed.data.timezone)) {
      return NextResponse.json({ error: "invalid_timezone" }, { status: 400 });
    }
    update.timezone = parsed.data.timezone;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  await getDb().update(profiles).set(update).where(eq(profiles.id, auth.userId));

  return NextResponse.json({ ok: true, ...update });
});
