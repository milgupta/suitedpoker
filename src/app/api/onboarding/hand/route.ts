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
import { grade as gradePreflop } from "@/poker/grader";
import { nodeRefOf, type PreflopActionName } from "@/poker/solutions";
import { tierOf } from "@/lib/explain-policy";
import {
  demoSeedFor,
  demoSpotFor,
  isDemoWorthy,
  MAX_SEED_ATTEMPTS,
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
  const choice = demoSpotFor(auth.userId, tier);
  const data = loadSolutionData();

  /**
   * Walk seeds until the sampler lands on a hand whose strategy is genuinely
   * mixed.
   *
   * A pure spot defeats the demo entirely: the frequency capsules would show
   * one bar at 100% and the user would conclude this is another right/wrong
   * app, which is what every competitor already is. The walk is deterministic,
   * so a refresh reproduces the same hand rather than rerolling for an easier
   * one.
   */
  let spot: ReturnType<typeof generateSpot> | null = null;
  let seed = "";

  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt++) {
    const candidateSeed = demoSeedFor(auth.userId, attempt);
    const candidate = generateSpot(
      {
        type: "preflop",
        heroPos: choice.heroPos,
        actionSeq: choice.actionSeq,
        difficulty: choice.difficulty,
      },
      data,
      candidateSeed,
    );

    const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === candidate.nodeRef);
    if (node === undefined) continue;

    // Grade against the top action purely to read the display mode out.
    const probe = gradePreflop(
      node,
      candidate.handKey,
      candidate.legalActions[0] as PreflopActionName,
    );
    if (isDemoWorthy(probe.displayMode, probe.topFreq)) {
      spot = candidate;
      seed = candidateSeed;
      break;
    }
  }

  if (spot === null) {
    // Every shortlisted node has mixed hands, so this means the data changed
    // under us. Better to say so than to serve a pure spot as the demo.
    console.error(`[demo-hand] no mixed spot for ${choice.id} after ${MAX_SEED_ATTEMPTS} seeds`);
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
