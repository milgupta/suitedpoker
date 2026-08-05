import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      : "/dashboard";

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

  return NextResponse.redirect(new URL(next, origin));
}
