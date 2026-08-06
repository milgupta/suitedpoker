import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/api-guard";
import { limit, RULES } from "@/lib/ratelimit";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { derive, QUESTION_IDS, type Answers } from "@/lib/onboarding";

/**
 * Persists onboarding answers, one at a time.
 *
 * Every answer is written the moment it is given rather than at the end. This
 * is the top of the paid funnel and people put their phone down halfway
 * through — coming back to question one is how a half-finished signup becomes
 * no signup.
 *
 * Derivation happens on `complete`, server-side. A client that could post its
 * own skill tier and rating could post itself a rating it never earned, and the
 * whole difficulty system reads that number.
 */

const answersSchema = z.object({
  venue: z.string().max(40).optional(),
  pain: z.string().max(40).optional(),
  frequency: z.string().max(40).optional(),
  goal: z.string().max(40).optional(),
  study: z.string().max(40).optional(),
  leaks: z.array(z.string().max(40)).max(10).optional(),
  minutes: z.string().max(4).optional(),
  // The one free-text field in the product. Capped because it goes into the
  // coach's context, where every character is a token someone pays for.
  hand: z.string().max(500).optional(),
});

const bodySchema = z.object({
  answers: answersSchema,
  complete: z.boolean().optional(),
});

export const POST = withAuth(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.API_GENERIC);
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

  // Merge rather than replace: the client sends what it has, and a stale tab
  // posting a partial set must not wipe answers given in another one.
  const [existing] = await db
    .select({ onboarding: profiles.onboarding })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  const previous = (existing?.onboarding ?? {}) as Answers;
  const answers: Answers = { ...previous };
  for (const id of QUESTION_IDS) {
    const value = parsed.data.answers[id];
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (answers as any)[id] = value;
    }
  }

  if (parsed.data.complete !== true) {
    await db.update(profiles).set({ onboarding: answers }).where(eq(profiles.id, auth.userId));
    return NextResponse.json({ ok: true, answers });
  }

  const derived = derive(answers);

  await db
    .update(profiles)
    .set({
      onboarding: { ...answers, derived, completedAt: new Date().toISOString() },
      skillTier: derived.skillTier,
      primaryLeakKey: derived.primaryLeakKey,
      rating: derived.rating,
      ratingDeviation: derived.ratingDeviation,
    })
    .where(eq(profiles.id, auth.userId));

  return NextResponse.json({ ok: true, answers, derived });
});

/** Resume support. Returns whatever has been answered so far. */
export const GET = withAuth(async (_request, auth) => {
  const [row] = await getDb()
    .select({ onboarding: profiles.onboarding })
    .from(profiles)
    .where(eq(profiles.id, auth.userId))
    .limit(1);

  return NextResponse.json({ answers: (row?.onboarding ?? {}) as Answers });
});
