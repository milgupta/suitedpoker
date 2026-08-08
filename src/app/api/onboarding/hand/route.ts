import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { putSession } from "@/lib/sessionstore";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot, toClientSpot } from "@/poker/generator";
import { nodeRefOf } from "@/poker/solutions";
import type { HandKey } from "@/poker/range";
import { tierOf } from "@/lib/explain-policy";
import {
  demoSeedFor,
  demoSpotCandidates,
  demoSpotFor,
  mixedHandsAt,
  pickMixedHand,
  type DemoHandRecord,
} from "@/lib/demo-hand";
import { SPOT_TTL_SECONDS } from "../../drills/next/route";

/**
 * Deals the one pre-paywall hand.
 *
 * `withAuth`, NOT `withEntitlement` — this runs before anyone has paid, and
 * that is the entire point. Which makes it the app's only unpaid drill surface
 * and therefore its most obvious abuse target, so it is bounded three ways:
 *
 *   1. The seed is DERIVED FROM THE USER ID, so refreshing deals the identical
 *      hand rather than a fresh one. There is nothing to farm.
 *   2. Once answered, the record exists on the profile and this route refuses.
 *   3. A rate limit on top, for the case where both of those are somehow wrong.
 *
 * The response is a ClientSpot and nothing else — same contract as the paid
 * drill route. No strategy, no EV, no nodeRef.
 */
export const POST = withAuth(async (_request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  const db = getDb();
  const [profile] = await db
    .select({ onboarding: profiles.onboarding, skillTier: profiles.skillTier })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  const onboarding = (profile?.onboarding ?? {}) as { demoHand?: DemoHandRecord };
  if (onboarding.demoHand !== undefined) {
    // Already played. The diagnosis has its evidence; there is no second hand.
    return NextResponse.json({ error: "already_played" }, { status: 409 });
  }

  const tier = tierOf(profile?.skillTier);
  const data = loadSolutionData();
  const seed = demoSeedFor(auth.userId);

  /**
   * Pick the hand, then build the spot around it.
   *
   * The previous version did the opposite: generate a spot, check whether the
   * sampled hand happened to be mixed, retry 24 times. Mixed hands are 2-4% of
   * an RFI node, so that found one about half the time and 503'd otherwise —
   * and never at all for the `never` tier, whose users are the whole audience
   * for this screen. Enumerating first cannot fail for a node that has any
   * mixed hand, and it is one pass instead of twenty-four.
   */
  let spot: ReturnType<typeof generateSpot> | null = null;
  let choice = demoSpotFor(auth.userId, tier);

  for (const candidate of demoSpotCandidates(auth.userId, tier)) {
    const ref = nodeRefOf(candidate.heroPos, candidate.actionSeq);
    const node = data.preflop.find((n) => n.ref === ref);
    if (node === undefined) continue;

    const handKey = pickMixedHand(mixedHandsAt(node.strategy), auth.userId);
    if (handKey === null) continue;

    spot = generateSpot(
      {
        type: "preflop",
        heroPos: candidate.heroPos,
        actionSeq: candidate.actionSeq,
        difficulty: candidate.difficulty,
        forceHandKey: handKey as HandKey,
      },
      data,
      seed,
    );
    choice = candidate;
    break;
  }

  if (spot === null) {
    // Not one shortlisted node has a mixed hand, which means the solution data
    // changed shape under us. Better to say so than to serve a pure spot.
    console.error(`[demo-hand] no mixed hand at any shortlisted node (tier ${tier})`);
    return NextResponse.json({ error: "no_demo_spot" }, { status: 503 });
  }

  const spotId = randomUUID();
  await putSession(
    "drill",
    spotId,
    auth.userId,
    {
      seed,
      nodeRef: spot.nodeRef,
      handKey: spot.handKey,
      config: {
        type: "preflop",
        heroPos: choice.heroPos,
        actionSeq: choice.actionSeq,
        difficulty: choice.difficulty,
      },
      answered: false,
      demo: true,
    },
    SPOT_TTL_SECONDS,
  );

  return NextResponse.json({ spotId, spot: toClientSpot(spot), spotKind: choice.id });
});
