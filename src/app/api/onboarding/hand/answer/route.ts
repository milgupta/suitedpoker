import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getSession, putSession } from "@/lib/sessionstore";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot } from "@/poker/generator";
import type { HandKey } from "@/poker/range";
import { grade as gradePreflop } from "@/poker/grader";
import { nodeRefOf, type PreflopActionName } from "@/poker/solutions";
import { spotConfigSchema } from "@/lib/arena-preset";
import type { DemoHandRecord } from "@/lib/demo-hand";
import { DEMO_VERDICT, type DemoAction } from "@/lib/demo-script";
import { SPOT_TTL_SECONDS } from "../../../drills/next/route";

/** Narrows a submitted action to one the written table covers. */
function isDemoAction(action: string): action is DemoAction {
  return action === "fold" || action === "call" || action === "raise";
}

const bodySchema = z.object({
  spotId: z.string().min(1),
  action: z.string().min(1),
  timeMs: z.number().int().min(0).max(3_600_000),
});

interface StoredSpot {
  seed: string;
  nodeRef: string;
  handKey: HandKey;
  config: z.infer<typeof spotConfigSchema>;
  answered: boolean;
  demo?: boolean;
  /** True when the deal route served the FIXED hand, which has written copy. */
  scripted?: boolean;
}

/**
 * Grades the demo hand and writes it onto the profile.
 *
 * The record is what the diagnosis opens with, so it carries everything that
 * screen needs to be SPECIFIC — the hand, the position, what they did, what a
 * solver does and how often, and what the difference costs. A diagnosis that
 * says "you may be too passive" is a horoscope; one that says "you folded AJo
 * from the button" is evidence.
 *
 * Graded through the same 2.7 grader as every paid drill. A second grading
 * path would make this number incomparable with every other number in the
 * product.
 */
export const POST = withAuth(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.DRILL_ANSWER);
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

  const db = getDb();
  const [profile] = await db
    .select({ onboarding: profiles.onboarding })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  const onboarding = (profile?.onboarding ?? {}) as Record<string, unknown> & {
    demoHand?: DemoHandRecord;
  };
  if (onboarding.demoHand !== undefined) {
    return NextResponse.json({ error: "already_played" }, { status: 409 });
  }

  const stored = await getSession<StoredSpot>("drill", parsed.data.spotId, auth.userId);
  if (stored === null) return NextResponse.json({ error: "spot_not_found" }, { status: 404 });
  if (stored.demo !== true) {
    // A paid-drill spot id must not be gradeable through the unpaid route.
    return NextResponse.json({ error: "not_a_demo_spot" }, { status: 400 });
  }
  if (stored.answered) return NextResponse.json({ error: "already_answered" }, { status: 409 });

  const data = loadSolutionData();
  const spot = generateSpot(stored.config, data, stored.seed);
  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return NextResponse.json({ error: "node_missing" }, { status: 500 });

  if (!spot.legalActions.includes(parsed.data.action)) {
    return NextResponse.json({ error: "illegal_action" }, { status: 400 });
  }

  /**
   * GRADE THE STORED HAND, NOT THE REGENERATED ONE.
   *
   * The deal route CHOOSES its hand (it needs a mixed strategy, and mixed hands
   * are a few percent of a node), so regenerating from the config alone
   * re-samples and lands somewhere else — which graded a different hand than
   * the one the user was looking at, usually a pure one. The e2e caught it as
   * "the demo served a pure spot".
   *
   * `stored.handKey` is written server-side at deal time and is the only record
   * of what was actually on screen. It is also the authoritative one: it cannot
   * be influenced by the request.
   */
  const result = gradePreflop(node, stored.handKey, parsed.data.action as PreflopActionName);

  // Burned before the write, so a double submit cannot produce two records.
  await putSession(
    "drill",
    parsed.data.spotId,
    auth.userId,
    { ...stored, answered: true },
    SPOT_TTL_SECONDS,
  );

  const record: DemoHandRecord = {
    nodeRef: spot.nodeRef,
    // Same reason as the grade above: the stored key is what was on screen.
    handKey: stored.handKey,
    heroPos: spot.heroPos,
    chosenAction: parsed.data.action,
    bestAction: result.bestAction,
    grade: result.grade,
    evLoss: result.evLoss,
    topFreq: result.topFreq,
    displayMode: result.displayMode,
    timeMs: parsed.data.timeMs,
    playedAt: new Date().toISOString(),
  };

  try {
    await db
      .update(profiles)
      .set({ onboarding: { ...onboarding, demoHand: record } })
      .where(eq(profiles.id, auth.userId));
  } catch (error) {
    // The user has their feedback either way; the diagnosis degrades to the
    // questionnaire-only version, which it is built to do.
    console.error(`[demo-hand] could not persist for ${auth.userId}: ${String(error)}`);
  }

  /**
   * The written verdict, keyed on what they PRESSED.
   *
   * Sent from the server rather than looked up client-side for one reason: the
   * verdict names the strategy, and a client that holds the whole verdict table
   * before answering holds a map from action to "this is the one the solver
   * never takes". That is the same leak the drill payload exists to prevent, so
   * only the verdict for the action actually taken crosses the wire, and only
   * after it has been graded.
   */
  const verdict =
    stored.scripted === true && isDemoAction(parsed.data.action)
      ? DEMO_VERDICT[parsed.data.action]
      : null;

  return NextResponse.json({ ...result, demo: true, verdict, scripted: stored.scripted === true });
});
