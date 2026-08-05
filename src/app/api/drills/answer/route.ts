import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { getSession, putSession } from "@/lib/sessionstore";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot } from "@/poker/generator";
import { grade as gradePreflop } from "@/poker/grader";
import { nodeRefOf, type PreflopActionName } from "@/poker/solutions";
import { getDb } from "@/db";
import { drillAttempts } from "@/db/schema";
import { spotConfigSchema } from "@/lib/arena-preset";
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

  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) {
    return NextResponse.json({ error: "node_missing" }, { status: 500 });
  }

  const result = gradePreflop(node, spot.handKey, action as PreflopActionName);

  // Burn the spot before persisting, so a concurrent second submit loses.
  await putSession("drill", spotId, auth.userId, { ...stored, answered: true }, SPOT_TTL_SECONDS);

  try {
    await getDb()
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
        hintsUsed: parsed.data.hintsUsed ?? 0,
      });
  } catch {
    // A failed write must not cost the user their feedback — the whole point of
    // the loop is the explanation, and the attempt row is telemetry.
  }

  return NextResponse.json({
    ...result,
    // 3.3 replaces this with the real rating update.
    ratingDelta: 0,
  });
});
