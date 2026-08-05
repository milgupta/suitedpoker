import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasActiveSubscription } from "@/lib/entitlement";

/**
 * The wrapper every authenticated API route uses.
 *
 * NO ROUTE ROLLS ITS OWN AUTH CHECK. One place to get right, one place to audit,
 * and one place where the 401/402 distinction is made consistently — a client
 * that cannot tell "log in" from "subscribe" cannot show the right screen.
 */

export interface AuthContext {
  userId: string;
  supabase: SupabaseClient;
}

export type GuardedHandler<TRouteContext = unknown> = (
  request: NextRequest,
  auth: AuthContext,
  routeContext: TRouteContext,
) => Promise<Response> | Response;

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "unauthorized", message: "Log in to continue." },
    { status: 401 },
  );
}

function paymentRequired(): NextResponse {
  // 402, not 403. 403 means "you may never do this"; 402 means "subscribe and
  // you can", which is a different screen and a different funnel step.
  return NextResponse.json(
    { error: "entitlement_required", message: "An active subscription is required." },
    { status: 402 },
  );
}

export function withAuth<TRouteContext = unknown>(handler: GuardedHandler<TRouteContext>) {
  return async (request: NextRequest, routeContext: TRouteContext): Promise<Response> => {
    const supabase = await createClient();
    // getUser(), never getSession(): getSession trusts the cookie without
    // verifying its signature against the auth server.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user === null) return unauthorized();

    return handler(request, { userId: user.id, supabase }, routeContext);
  };
}

export function withEntitlement<TRouteContext = unknown>(handler: GuardedHandler<TRouteContext>) {
  return withAuth<TRouteContext>(async (request, auth, routeContext) => {
    // Re-checked here even though middleware already gated the page: middleware
    // is UX, and an API route is reachable directly.
    if (!(await hasActiveSubscription(auth.userId))) return paymentRequired();
    return handler(request, auth, routeContext);
  });
}
