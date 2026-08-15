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
import { FIXED_DEMO, FIXED_DEMO_NODE_REF } from "@/lib/demo-script";
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
  let scripted = false;

  /**
   * THE FIXED HAND FIRST. Everyone gets T9o in the big blind against a button
   * open, so the words under it can be written rather than generated — see
   * `src/lib/demo-script.ts` for why that hand.
   *
   * The per-tier shortlist below is kept as a FALLBACK, not deleted: if the
   * node is ever quarantined or the hand repaired out of the strategy, the
   * screen has to degrade to a different real spot with template copy rather
   * than to "Couldn't deal a hand", which is what a beginner would otherwise
   * see as the first thing this product ever showed them.
   */
  const fixedNode = data.preflop.find((n) => n.ref === FIXED_DEMO_NODE_REF);
  if (fixedNode !== undefined && fixedNode.strategy[FIXED_DEMO.handKey] !== undefined) {
    spot = generateSpot(
      {
        type: "preflop",
        heroPos: FIXED_DEMO.heroPos,
        actionSeq: FIXED_DEMO.actionSeq,
        difficulty: FIXED_DEMO.difficulty,
        forceHandKey: FIXED_DEMO.handKey as HandKey,
      },
      data,
      seed,
    );
    choice = {
      id: "fixed-bb-vs-btn",
      heroPos: FIXED_DEMO.heroPos,
      actionSeq: FIXED_DEMO.actionSeq,
      difficulty: FIXED_DEMO.difficulty,
      teaches: "the most common decision in 6-max: defending the big blind against a button open",
    };
    scripted = true;
  }

  for (const candidate of spot === null ? demoSpotCandidates(auth.userId, tier) : []) {
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
      scripted,
    },
    SPOT_TTL_SECONDS,
  );

  // `scripted` tells the client it may show the written verdict and open the
  // mini chat. It carries no strategy — the client still cannot tell what the
  // right answer is until it has answered and the server has graded.
  return NextResponse.json({ spotId, spot: toClientSpot(spot), spotKind: choice.id, scripted });
});
