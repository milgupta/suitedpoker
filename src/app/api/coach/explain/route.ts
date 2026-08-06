import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { withEntitlement } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getSession } from "@/lib/sessionstore";
import { getDb } from "@/db";
import { aiUsage, coachMessages, drillAttempts, profiles } from "@/db/schema";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot } from "@/poker/generator";
import { grade as gradePreflop } from "@/poker/grader";
import { nodeRefOf, type PreflopActionName } from "@/poker/solutions";
import { streamExplanation, type ExplainEvent } from "@/lib/ai/coach";
import { COACH_MODEL } from "@/lib/ai/client";
import { tierOf } from "@/lib/explain-policy";
import { canGenerate, recordSpend } from "@/lib/ai/budget";
import { spotConfigSchema } from "@/lib/arena-preset";

const bodySchema = z.object({
  spotId: z.string().min(1),
  action: z.string().min(1),
});

interface StoredSpot {
  seed: string;
  nodeRef: string;
  handKey: string;
  config: z.infer<typeof spotConfigSchema>;
  answered: boolean;
}

/**
 * Explains a decision the user has ALREADY made, as a stream.
 *
 * The spot must be answered first — explaining before the user acts would hand
 * them the answer, which is what /api/coach/hint exists to do safely.
 *
 * The wire format is newline-delimited JSON rather than SSE: the client needs
 * three message kinds (text, reset, done) and NDJSON expresses that in a few
 * lines of parsing, where SSE would add a framing layer for no benefit.
 *
 * `reset` matters. The guard runs server-side before any sentence is emitted,
 * so a wrong claim is never rendered — but if the guard trips partway, the
 * already-sent sentences are true yet the explanation is now half of one. The
 * server sends `reset` and then the template, and the client discards.
 */
export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.COACH_EXPLAIN);
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

  const stored = await getSession<StoredSpot>("drill", parsed.data.spotId, auth.userId);
  if (stored === null) return NextResponse.json({ error: "spot_not_found" }, { status: 404 });

  if (!stored.answered) {
    // Explaining an unanswered spot is handing over the answer.
    return NextResponse.json({ error: "not_answered_yet" }, { status: 409 });
  }

  const data = loadSolutionData();
  const spot = generateSpot(stored.config, data, stored.seed);
  const node = data.preflop.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) return NextResponse.json({ error: "node_missing" }, { status: 500 });

  if (!spot.legalActions.includes(parsed.data.action)) {
    return NextResponse.json({ error: "illegal_action" }, { status: 400 });
  }

  const result = gradePreflop(node, spot.handKey, parsed.data.action as PreflopActionName);

  let skillTier = tierOf(null);
  let leaks: string[] = [];
  try {
    const [profile] = await getDb()
      .select({ skillTier: profiles.skillTier, primaryLeak: profiles.primaryLeakKey })
      .from(profiles)
      .where(eq(profiles.id, auth.userId))
      .limit(1);
    skillTier = tierOf(profile?.skillTier);
    leaks = profile?.primaryLeak == null ? [] : [profile.primaryLeak];
  } catch {
    // A missing profile is not a reason to withhold the explanation, and every
    // default here is the careful end of its scale.
  }

  /**
   * A correct decision is a CHEAP path: the template already explains "you
   * found the best action" well, so it is the first thing to give up when the
   * budget tightens. A mistake or a blunder is the expensive path — that
   * explanation is the product, and it survives until the hard cap.
   */
  const path = result.evLoss > 0 ? "expensive" : "cheap";
  const generationAllowed = await canGenerate(path);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ExplainEvent): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let full = "";

      try {
        for await (const event of streamExplanation(
          spot,
          result,
          { skillTier, leaks },
          node.notes,
          generationAllowed,
        )) {
          if (event.type === "text") full += event.text;
          if (event.type === "reset") full = "";
          send(event);

          if (event.type === "done") {
            await persist(auth.userId, full.trim(), event);
            await recordSpend(event.costUsd);
          }
        }
      } catch {
        // The generator is written not to throw, but a stream that ends without
        // a `done` leaves the client spinning forever.
        send({
          type: "done",
          source: "template",
          redactedFor: "stream_failed",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // Without this a proxy may buffer the whole body and deliver it in one
      // lump, which looks exactly like streaming being broken.
      "x-accel-buffering": "no",
    },
  });
});

/**
 * History and telemetry. Best-effort on purpose: the user has already read the
 * explanation by the time this runs, and a failed insert must not surface.
 */
async function persist(
  userId: string,
  text: string,
  event: Extract<ExplainEvent, { type: "done" }>,
): Promise<void> {
  const db = getDb();

  try {
    // The attempt row is written by /api/drills/answer moments earlier. Link to
    // the most recent one when it is there, and keep the message when it is not.
    const [attempt] = await db
      .select({ id: drillAttempts.id })
      .from(drillAttempts)
      .where(eq(drillAttempts.userId, userId))
      .orderBy(desc(drillAttempts.createdAt))
      .limit(1);

    await db.insert(coachMessages).values({
      userId,
      attemptId: attempt?.id ?? null,
      // "explanation", not "assistant". The chat transcript for this hand
      // reads the same table, and an explanation replayed as a chat turn would
      // be counted against the 10-turn cap and fed back as conversation the
      // user never had.
      role: "explanation",
      content: text,
      tokens: event.outputTokens,
    });
  } catch {
    // History is a nicety; the explanation was already delivered.
  }

  try {
    await db.insert(aiUsage).values({
      userId,
      endpoint: "coach_explain",
      model: event.source === "model" ? COACH_MODEL : event.source,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      costUsd: event.costUsd.toFixed(6),
      cached: event.source === "cache",
    });
  } catch {
    // Same. Telemetry never costs the user their explanation.
  }
}
