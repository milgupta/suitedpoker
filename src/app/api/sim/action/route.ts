import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { applyHeroAction, heroLegalActions, parseAction } from "@/lib/sim-server";
import { loadLive, persistHand, saveLive } from "@/lib/sim-store";
import { toClientSimState } from "@/lib/sim";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  action: z.object({ type: z.string(), amount: z.number().optional() }),
  /**
   * The state version the client acted on. A mismatch means the submit is a
   * duplicate (double-tap) or stale (a second tab) — both are rejected rather
   * than applied twice, which on a raise would commit chips twice.
   */
  version: z.number().int(),
});

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
  // Missing and someone else's are indistinguishable on purpose.
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

  const action = parseAction(parsed.data.action);
  if (action === null) return NextResponse.json({ error: "invalid_action" }, { status: 400 });

  const result = applyHeroAction(live, action, parsed.data.sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Persist the finished hand BEFORE the durable state write points past it.
  if (result.record !== null) {
    await persistHand(parsed.data.sessionId, result.live, result.record);
  }

  await saveLive(parsed.data.sessionId, auth.userId, result.live);

  return NextResponse.json({
    state: toClientSimState(
      parsed.data.sessionId,
      result.live,
      heroLegalActions(result.live),
      result.record,
    ),
    botMoves: result.moves,
  });
});
