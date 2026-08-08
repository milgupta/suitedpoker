import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { getSession, putSession } from "@/lib/sessionstore";
import { loadSolutionData } from "@/lib/solution-data";
import { gradeSpot } from "@/lib/grade-spot";
import { generateSpot } from "@/poker/generator";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { drillAttempts, profiles } from "@/db/schema";
import { MAX_RD, difficultyToRating, scoreForGrade, tieredUp, updateRating } from "@/lib/rating";
import { spotConfigSchema } from "@/lib/arena-preset";
import { applyHintPenalty } from "@/lib/hints";
import { SPOT_TTL_SECONDS } from "../next/route";

const answerSchema = z.object({
  spotId: z.string().min(1),
  action: z.string().min(1),
  timeMs: z.number().int().min(0).max(3_600_000),
  hintsUsed: z.number().int().min(0).max(10).optional(),
});

interface StoredSpot {
  seed: string;
  nodeRef: string;
  handKey: string;
  config: z.infer<typeof spotConfigSchema>;
  answered: boolean;
  /** Hints served for this spot, keyed by level. Server-recorded, never client-supplied. */
  hints?: Record<string, string>;
}

/**
 * Grades an answer. Server-side, always.
 *
 * Three things make a forged answer useless:
 *
 *   1. The stored spot is fetched FOR THIS USER — getSession compares the owner
 *      and returns null otherwise, so another user's spotId is simply absent.
 *   2. The spot is regenerated from the stored seed and its nodeRef compared
 *      with the stored one. A mismatch means the solution set moved underneath
 *      the session, and grading against a different node would be wrong.
 *   3. The chosen action is checked against the spot's own legal actions, so a
 *      client cannot invent one that happens to grade well.
 *
 * A second answer for the same spotId is rejected rather than double-counted —
 * otherwise a user could resubmit until the rating moved the right way.
 */
export const POST = withEntitlement(async (request, auth) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { spotId, action, timeMs } = parsed.data;

  const stored = await getSession<StoredSpot>("drill", spotId, auth.userId);
  if (stored === null) {
    // Missing, expired, or belonging to someone else — indistinguishable on
    // purpose. Confirming that a spot exists but is not yours is a disclosure.
    return NextResponse.json({ error: "spot_not_found" }, { status: 404 });
  }

  if (stored.answered) {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  const data = loadSolutionData();
  const spot = generateSpot(stored.config, data, stored.seed);

  if (spot.nodeRef !== stored.nodeRef || spot.handKey !== stored.handKey) {
    return NextResponse.json({ error: "spot_mismatch" }, { status: 409 });
  }

  if (!spot.legalActions.includes(action)) {
    return NextResponse.json({ error: "illegal_action" }, { status: 400 });
  }

  const result = gradeSpot(data, spot, action, stored.config.type);

  if (result === null) {
    return NextResponse.json({ error: "node_missing" }, { status: 500 });
  }

  // The level the user actually reached, from the session. The client sends its
  // own `hintsUsed` for analytics, but a rating penalty computed from a number
  // the client controls is not a penalty at all.
  const hintLevelReached = Math.max(0, ...Object.keys(stored.hints ?? {}).map(Number));

  // Burn the spot before persisting, so a concurrent second submit loses.
  await putSession("drill", spotId, auth.userId, { ...stored, answered: true }, SPOT_TTL_SECONDS);

  // Returned to the client, because 4.4's hand-scoped chat is keyed on it.
  // Null when the insert failed — the chat is simply unavailable for that hand
  // rather than the feedback being withheld.
  let attemptId: string | null = null;

  try {
    const [inserted] = await getDb()
      .insert(drillAttempts)
      .values({
        userId: auth.userId,
        nodeRef: spot.nodeRef,
        spotSnapshot: { handKey: spot.handKey, difficulty: spot.difficulty, seed: stored.seed },
        heroHand: spot.handKey,
        board: spot.board.length > 0 ? spot.board.join(" ") : null,
        chosenAction: action,
        grade: result.grade,
        evLoss: result.evLoss.toFixed(3),
        timeMs,
        source: stored.config.tags?.[0] ?? "arena",
        hintsUsed: hintLevelReached,
      })
      .returning({ id: drillAttempts.id });
    attemptId = inserted?.id ?? null;
  } catch {
    // A failed write must not cost the user their feedback — the whole point of
    // the loop is the explanation, and the attempt row is telemetry.
  }

  // Rating update. Failures here must not cost the user their feedback, so the
  // whole block is best-effort and the response still carries the grade.
  let ratingDelta = 0;
  let newRating: number | null = null;
  let crossedTier = false;

  try {
    const db = getDb();
    const rows = await db
      .select({ rating: profiles.rating, ratingDeviation: profiles.ratingDeviation })
      .from(profiles)
      .where(eq(profiles.id, auth.userId))
      .limit(1);

    const before = rows[0];
    if (before?.rating != null) {
      const updated = updateRating(
        { rating: before.rating, rd: before.ratingDeviation ?? MAX_RD },
        [
          {
            opponentRating: difficultyToRating(spot.difficulty),
            // The spot's difficulty is an authored estimate, so it carries real
            // uncertainty of its own rather than being treated as exact.
            opponentRd: 80,
            score: scoreForGrade(result.grade),
          },
        ],
      );

      // A hint shrinks the GAIN, never the loss. Zeroing it out would teach
      // users to guess rather than ask, which is the opposite of the point.
      ratingDelta = applyHintPenalty(Math.round(updated.rating) - before.rating, hintLevelReached);
      newRating = before.rating + ratingDelta;
      crossedTier = tieredUp(before.rating, newRating);

      await db
        .update(profiles)
        .set({ rating: newRating, ratingDeviation: Math.round(updated.rd) })
        .where(eq(profiles.id, auth.userId));
    }
  } catch {
    // Leave the delta at zero rather than failing the request.
  }

  return NextResponse.json({
    ...result,
    ratingDelta,
    rating: newRating,
    tieredUp: crossedTier,
    hintsUsed: hintLevelReached,
    attemptId,
  });
});
