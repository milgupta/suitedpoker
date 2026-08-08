import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { persistAttribution, readAttributionCookie } from "@/lib/attribution-server";
import { createClient } from "@/lib/supabase/server";
import { captureServer } from "@/lib/analytics-server";
import type { SignupMethod } from "@/lib/analytics";

/**
 * A brand-new auth user, for the purpose of the activation funnel step.
 *
 * Sixty seconds, because the auth row is created DURING the code exchange one
 * line above this — a real signup's `created_at` is a second or two old, and a
 * returning login's is days. The only way to trip it is to sign up, sign out
 * and sign back in inside the same minute, which double-counts one person.
 */
const SIGNUP_WINDOW_MS = 60_000;

/**
 * `signup_completed` for the OAuth path, and ONLY the OAuth path.
 *
 * The email form captures this in the browser and can afford to: it stays on
 * the page. Google cannot — `signInWithOAuth` navigates away mid-call, so every
 * line after it is unreachable and the browser never comes back to that
 * component. Firing it here, server-side against the real user id, is the only
 * place an OAuth signup is observable at all.
 *
 * Gated on the provider rather than firing for everyone who is new, because an
 * email confirmation ALSO lands on this route: a user who clicks the link
 * within the window would be counted here and again by the form, and an
 * inflated activation step is worse than the missing one it replaced. Never
 * `throw`s — this runs on the redirect path, and no analytics event is worth
 * costing a signup.
 */
async function reportSignupIfNew(user: User): Promise<void> {
  try {
    if (user.app_metadata.provider !== "google") return;

    const createdAt = Date.parse(user.created_at);
    if (Number.isNaN(createdAt) || Date.now() - createdAt > SIGNUP_WINDOW_MS) return;

    const method: SignupMethod = "google";
    await captureServer(user.id, "signup_completed", { method });
  } catch {
    // A missing funnel step is not worth a failed sign-in.
  }
}

/**
 * Handles OAuth returns, email confirmations and password-recovery links.
 *
 * All three arrive as a `code` to exchange for a session. Doing that here — on
 * the server — is what lets the session cookie be set with HttpOnly.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description");

  const rawNext = searchParams.get("next");
  // Only same-origin paths. Reflecting an arbitrary `next` back as a redirect
  // is an open redirect, and this URL is emailed to people.
  const next =
    rawNext !== null && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/practice";

  if (errorDescription !== null) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "callback");
    return NextResponse.redirect(url);
  }

  if (code === null) {
    // No code means the implicit flow put the tokens in the URL FRAGMENT, which
    // the server cannot see. Hand off to the client page — browsers carry the
    // fragment across a redirect, so it survives this hop.
    const url = new URL("/auth/confirm", origin);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error !== null) {
    // Expired or already-used link. /reset detects the missing session and
    // offers a new one, so send recovery links there rather than to /login.
    const url = new URL(next === "/reset" ? "/reset" : "/login", origin);
    if (next !== "/reset") url.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(url);
  }

  // Google OAuth lands here, so this is where an OAuth signup's attribution
  // gets recorded. Fire-and-forget: attribution is worth a lot and worth zero
  // signups, so a failure must never block the redirect.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user !== null) {
      void persistAttribution(user.id, await readAttributionCookie());
      void reportSignupIfNew(user);
    }
  } catch {
    // Same.
  }

  return NextResponse.redirect(new URL(next, origin));
}
