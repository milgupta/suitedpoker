import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getDb } from "@/db";
import { simSessions } from "@/db/schema";
import { createLiveSession, heroLegalActions } from "@/lib/sim-server";
import { saveLive } from "@/lib/sim-store";
import { GRADED_STACK_BB, isPresetId, isSessionLength, toClientSimState } from "@/lib/sim";

const bodySchema = z.object({
  preset: z.string().refine(isPresetId, "unknown preset"),
  hands: z.number().int().refine(isSessionLength, "unknown session length"),
});

/**
 * Starts a session.
 *
 * The authoritative state goes to `sim_sessions.live_state` FIRST — that write
 * is the session existing at all, and it is what survives a serverless cold
 * start. The sessionstore copy is a read accelerator, written after and
 * best-effort.
 */
export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
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
  if (!parsed.success) return NextResponse.json({ error: "invalid_config" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .insert(simSessions)
    .values({
      userId: auth.userId,
      config: {
        preset: parsed.data.preset,
        hands: parsed.data.hands,
        stackBb: GRADED_STACK_BB,
      },
    })
    .returning({ id: simSessions.id });

  if (row === undefined) {
    return NextResponse.json({ error: "session_unavailable" }, { status: 503 });
  }

  const live = createLiveSession({
    presetId: parsed.data.preset,
    totalHands: parsed.data.hands,
    stackBb: GRADED_STACK_BB,
    seed: row.id,
  });

  await saveLive(row.id, auth.userId, live);

  return NextResponse.json({
    state: toClientSimState(row.id, live, heroLegalActions(live), null),
    botMoves: [],
  });
});
