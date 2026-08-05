import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseConfig } from "./config";

/** Everything under here requires a session. */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/drill", "/ranges", "/arena", "/account"];

/** Signed-in users have no business on these. */
const AUTH_ONLY_PREFIXES = ["/login", "/signup", "/forgot"];

function isMatch(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session on every request and gates the (app) group.
 *
 * The refresh is the reason this runs on every request rather than only on
 * protected routes: an access token that expires while the user is reading a
 * marketing page would otherwise log them out the moment they click through.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Without credentials there is no session to refresh and nothing to protect.
  // Let everything through rather than locking the whole app out of a build
  // that was never meant to have auth.
  if (!isSupabaseConfigured()) return response;

  const { url, anonKey } = supabaseConfig();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser(), never getSession(): getSession reads the cookie without
  // verifying it, so a forged cookie would look like a valid login here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (user === null && isMatch(pathname, PROTECTED_PREFIXES)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    // Preserve where they were going, so login can finish the journey rather
    // than dumping everyone on the dashboard.
    redirect.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirect);
  }

  if (user !== null && isMatch(pathname, AUTH_ONLY_PREFIXES)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
