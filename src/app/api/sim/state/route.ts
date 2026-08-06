import { NextResponse } from "next/server";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { heroLegalActions } from "@/lib/sim-server";
import { loadLive } from "@/lib/sim-store";
import { toClientSimState } from "@/lib/sim";

/**
 * The resume endpoint. A refresh mid-hand lands here and gets back exactly the
 * decision point it left — the state is server-side, so the refresh cost the
 * client nothing but its scroll position.
 */
export const GET = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (sessionId === null || sessionId === "") {
    return NextResponse.json({ error: "missing_session" }, { status: 400 });
  }

  const live = await loadLive(sessionId, auth.userId);
  if (live === null) return NextResponse.json({ error: "session_not_found" }, { status: 404 });

  return NextResponse.json({
    state: toClientSimState(sessionId, live, heroLegalActions(live), null),
    botMoves: [],
  });
});
