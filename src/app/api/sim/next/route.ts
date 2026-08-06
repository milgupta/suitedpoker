import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { dealNextHand, heroLegalActions } from "@/lib/sim-server";
import { loadLive, persistHand, saveLive } from "@/lib/sim-store";
import { toClientSimState } from "@/lib/sim";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  version: z.number().int(),
});

/**
 * Deals the next hand once the client has shown the result of the last one.
 *
 * A separate call rather than an auto-deal in /action so the result line gets
 * its beat on screen — and so a duplicate submit deals nothing twice.
 */
export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.SIM_ACTION);
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
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const live = await loadLive(parsed.data.sessionId, auth.userId);
  if (live === null) return NextResponse.json({ error: "session_not_found" }, { status: 404 });

  if (live.version !== parsed.data.version) {
    return NextResponse.json(
      {
        error: "version_mismatch",
        state: toClientSimState(parsed.data.sessionId, live, heroLegalActions(live), null),
      },
      { status: 409 },
    );
  }

  if (live.game !== null && !live.game.complete) {
    return NextResponse.json({ error: "hand_in_progress" }, { status: 409 });
  }

  const before = live.records.length;
  const next = dealNextHand(live, parsed.data.sessionId);

  // A walkover chain may have settled hands with no hero input; persist them.
  for (const record of next.records.slice(before)) {
    await persistHand(parsed.data.sessionId, next, record);
  }

  await saveLive(parsed.data.sessionId, auth.userId, next);

  return NextResponse.json({
    state: toClientSimState(parsed.data.sessionId, next, heroLegalActions(next), null),
    botMoves: [],
  });
});
