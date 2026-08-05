import { NextResponse, type NextRequest } from "next/server";
import { ensureChallenge } from "@/lib/daily-server";
import { localDay } from "@/lib/local-day";
import { serverEnv } from "@/lib/env.server";

/**
 * Generates tomorrow's challenge. Called by a Vercel cron at 00:00 UTC.
 *
 * Idempotent: the challenge is derived from the date string, and the insert is
 * ON CONFLICT DO NOTHING against a UNIQUE date. A retried cron produces exactly
 * the same five spots rather than replacing them under anyone mid-play.
 *
 * Not behind withEntitlement — a cron has no session. It is authenticated by
 * the CRON_SECRET Vercel sends, so it cannot be triggered by anyone else.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = request.headers.get("authorization") ?? "";

  // In production an unset secret must fail closed, not wave the request
  // through — an open generate endpoint lets anyone pre-create challenges.
  if (expected === "" || provided !== `Bearer ${expected}`) {
    if (serverEnv().NODE_ENV === "production" || expected !== "") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Tomorrow in UTC — the challenge date is a global key, not a per-user one.
  const tomorrow = localDay(Date.now() + 86_400_000, "UTC").key;
  const challenge = await ensureChallenge(tomorrow);

  return NextResponse.json({
    date: tomorrow,
    challengeId: challenge.id,
    spots: challenge.spotRefs.length,
  });
}
