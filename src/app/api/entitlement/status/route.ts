import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { hasActiveSubscription } from "@/lib/entitlement";

/**
 * "Has my payment landed yet?"
 *
 * `withAuth`, not `withEntitlement` — the whole point is to be callable by
 * someone who is not yet entitled. It returns a single boolean and nothing
 * about the subscription itself.
 *
 * /welcome polls this after checkout. The 60s entitlement cache does not stall
 * that: the webhook calls `invalidateEntitlement` as part of syncing, so the
 * very next poll after it lands reads the database.
 */
export const POST = withAuth(async (_request, auth) => {
  const entitled = await hasActiveSubscription(auth.userId);
  return NextResponse.json({ entitled });
});

export const GET = POST;
