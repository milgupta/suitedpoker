import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEntitled } from "@/lib/entitlement-rule";
import { isSupabaseConfigured, supabaseConfig } from "./config";

/** Everything under here requires a session. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/drill",
  "/daily",
  "/ranges",
  "/arena",
  "/account",
];

/** Signed-in users have no business on these. */
const AUTH_ONLY_PREFIXES = ["/login", "/signup", "/forgot"];

/**
 * Inside the app but reachable WITHOUT entitlement.
 *
 * /onboarding runs before anyone has paid — gating it would trap every new
 * signup. /welcome is the post-checkout landing page: Stripe redirects there
 * before its webhook has necessarily arrived, so the subscription row may not
 * exist yet and gating it would bounce a user who has just paid (7.4).
 */
const ENTITLEMENT_EXEMPT_PREFIXES = ["/onboarding", "/welcome", "/paywall", "/account"];

function isMatch(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * The development bypass, read directly rather than through env.server.ts,
 * which pulls in `server-only` and node-side parsing that Edge cannot run.
 *
 * Forced off in production here as well as in env.server.ts. Two independent
 * force-offs, because this one decides who gets into the paid product.
 */
function bypassEntitlement(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEV_BYPASS_ENTITLEMENT === "true";
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

  // Entitlement gate. THIS IS UX, NOT A SECURITY BOUNDARY — middleware can be
  // bypassed, and every API route re-checks server-side via withEntitlement().
  // The check runs against the same predicate the server path uses, but without
  // the Redis cache: Edge cannot reach the node clients, and a page navigation
  // costs one indexed row read.
  if (
    user !== null &&
    isMatch(pathname, PROTECTED_PREFIXES) &&
    !isMatch(pathname, ENTITLEMENT_EXEMPT_PREFIXES)
  ) {
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end, past_due_since")
      .eq("user_id", user.id)
      .order("current_period_end", { ascending: false })
      .limit(5);

    // Same shape as the server path in entitlement.ts, deliberately: ANY
    // entitling row admits, because a past_due row's period end is in the past
    // and ordering by it would rank a dead row above the live one.
    const entitled =
      bypassEntitlement() ||
      (data ?? []).some((row) =>
        isEntitled({
          status: row.status as string | null,
          currentPeriodEnd: row.current_period_end as string | null,
          // Without this the Edge path would evict a past_due customer the
          // server path is still admitting — the exact drift that
          // entitlement-rule.ts exists to prevent.
          pastDueSince: row.past_due_since as string | null,
        }),
      );

    if (!entitled) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/paywall";
      redirect.search = "";
      return NextResponse.redirect(redirect);
    }
  }

  if (user !== null && isMatch(pathname, AUTH_ONLY_PREFIXES)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
