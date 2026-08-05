import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";

/**
 * A probe so the guards can be tested through the real HTTP stack rather than
 * by calling the wrapper directly.
 *
 * It ships. That is deliberate: it keeps withAuth/withEntitlement under
 * continuous test against the real cookie and middleware path, and it exposes
 * nothing — it is itself guarded, and returns only the caller's own user id.
 *
 * NOT under a `_private` folder, because the App Router excludes those from
 * routing entirely and the probe would silently 404.
 */
export const GET = withAuth((_request, auth) =>
  NextResponse.json({ ok: true, userId: auth.userId }),
);
