import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withEntitlement } from "@/lib/api-guard";
import { putSession } from "@/lib/sessionstore";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot, toClientSpot } from "@/poker/generator";
import { spotConfigSchema } from "@/lib/arena-preset";
import { limit, RULES } from "@/lib/ratelimit";

export const SPOT_TTL_SECONDS = 30 * 60;

/**
 * Hands out the next spot.
 *
 * THE SECURITY BOUNDARY OF THE PRODUCT LIVES HERE. The response carries a
 * ClientSpot and nothing else — no strategy, no EV table, no correct action,
 * and no nodeRef. Without the nodeRef the client cannot even identify which
 * node it is looking at, so it cannot look the answer up either.
 *
 * The seed is generated server-side and stored, never sent. /answer regenerates
 * the spot from it and checks the result matches, which is what makes a forged
 * answer detectable.
 */
export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.DRILL_ANSWER);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = spotConfigSchema.safeParse(
    (body as { config?: unknown })?.config ?? {
      type: "preflop",
    },
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_config" }, { status: 400 });
  }

  const seed = randomUUID();
  const spot = generateSpot(parsed.data, loadSolutionData(), seed);
  const spotId = randomUUID();

  const stored = await putSession(
    "drill",
    spotId,
    auth.userId,
    {
      seed,
      nodeRef: spot.nodeRef,
      handKey: spot.handKey,
      config: parsed.data,
      answered: false,
    },
    SPOT_TTL_SECONDS,
  );

  if (!stored) {
    // A lost write means /answer could never grade this spot. Better to fail
    // now than to let the user play a hand that cannot be scored.
    return NextResponse.json({ error: "session_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ spotId, spot: toClientSpot(spot) });
});
