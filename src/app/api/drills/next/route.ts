import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withEntitlement } from "@/lib/api-guard";
import { putSession } from "@/lib/sessionstore";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot, toClientSpot, type SpotConfig } from "@/poker/generator";
import { spotConfigSchema } from "@/lib/arena-preset";
import { applyArenaMix, isOpenArenaConfig } from "@/lib/arena-mix";
import { leakToSpotConfig } from "@/lib/leak-targeting";
import { limit, RULES } from "@/lib/ratelimit";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { drillAttempts, profiles } from "@/db/schema";
import { selectNextDifficulty } from "@/lib/rating";
import type { GradeName } from "@/poker/grader";

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

  // Adaptive difficulty. Best-effort: a user with no rating yet, or a database
  // hiccup, gets the config's difficulty rather than no spot at all.
  const requested = parsed.data as SpotConfig;
  let config: SpotConfig = requested;
  let leakTag: string | null = null;
  let rating: number | null = null;

  try {
    const db = getDb();
    const [profile] = await db
      .select({ rating: profiles.rating, primaryLeak: profiles.primaryLeakKey })
      .from(profiles)
      .where(eq(profiles.id, auth.userId))
      .limit(1);

    if (profile?.rating != null) {
      rating = profile.rating;
      const recent = await db
        .select({ grade: drillAttempts.grade })
        .from(drillAttempts)
        .where(eq(drillAttempts.userId, auth.userId))
        .orderBy(desc(drillAttempts.createdAt))
        .limit(3);

      // Only the primary leak is persisted — Q6's list is not. Targeting still
      // fires ~30% when one exists; the chip tells the user why this hand feels
      // different from a random one.
      const leakTags = profile.primaryLeak == null ? [] : [profile.primaryLeak];

      const selection = selectNextDifficulty({
        rating: profile.rating,
        // Newest first from the query; the selector wants oldest first.
        recentGrades: recent.map((r) => r.grade as GradeName).reverse(),
        roll: Math.random(),
        leakTags,
      });

      leakTag = selection.leakTag;
      config = { ...config, difficulty: selection.targetDifficulty };
    }
  } catch {
    // Fall through with the requested config.
  }

  // Leak filter wins over the rating mix: when the chip fires it must name a
  // family we actually dealt. Open Arena gets the postflop lottery only when
  // no lesson/hub pin and no leak slot claimed the hand.
  if (leakTag !== null) {
    const leakConfig = leakToSpotConfig(leakTag);
    if (leakConfig !== null) {
      config = {
        ...config,
        ...leakConfig,
        difficulty: config.difficulty,
      };
    }
  } else if (isOpenArenaConfig(requested) && rating !== null) {
    config = applyArenaMix(config, {
      rating,
      mixRoll: Math.random(),
      familyRoll: Math.random(),
    });
  }

  const seed = randomUUID();
  let spot;
  try {
    spot = generateSpot(config, loadSolutionData(), seed);
  } catch {
    // A leak/mix filter can miss if the served set has no matching template
    // yet — fall back to the difficulty-adjusted request rather than 500.
    config = { ...requested, difficulty: config.difficulty };
    spot = generateSpot(config, loadSolutionData(), seed);
    leakTag = null;
  }

  const spotId = randomUUID();

  const stored = await putSession(
    "drill",
    spotId,
    auth.userId,
    {
      seed,
      nodeRef: spot.nodeRef,
      handKey: spot.handKey,
      config,
      answered: false,
    },
    SPOT_TTL_SECONDS,
  );

  if (!stored) {
    // A lost write means /answer could never grade this spot. Better to fail
    // now than to let the user play a hand that cannot be scored.
    return NextResponse.json({ error: "session_unavailable" }, { status: 503 });
  }

  // leakTag names the category we filtered toward — never anything about the
  // spot's answer. Cleared above when the filter had to be abandoned.
  return NextResponse.json({ spotId, spot: toClientSpot(spot), leakTag });
});
