import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";

/**
 * Changing a password.
 *
 * Rate-limited under AUTH_ATTEMPT, which fails CLOSED — the one place in the
 * app where being unable to reach Redis must block the request rather than wave
 * it through, because this endpoint guards credentials.
 *
 * The current password is re-verified even though the user is already signed
 * in. Without that, an unattended logged-in laptop is a permanent account
 * takeover rather than a session someone can end.
 */

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  const {
    data: { user },
  } = await auth.supabase.auth.getUser();
  const email = user?.email;
  if (email === undefined) {
    // A Google-only account has no password to change.
    return NextResponse.json({ error: "no_password_login" }, { status: 409 });
  }

  const { error: wrongPassword } = await auth.supabase.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  });
  if (wrongPassword !== null) {
    return NextResponse.json({ error: "wrong_password" }, { status: 403 });
  }

  const { error } = await auth.supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error !== null) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});
