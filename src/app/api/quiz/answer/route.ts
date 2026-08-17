import { NextResponse } from "next/server";
import { z } from "zod";
import { withEntitlement } from "@/lib/api-guard";
import { getSession, putSession } from "@/lib/sessionstore";
import { limit, RULES } from "@/lib/ratelimit";
import { getDb } from "@/db";
import { quizAttempts } from "@/db/schema";
import { generateQuizQuestion, gradeQuizAnswer } from "@/poker/quiz";
import { QUIZ_TTL_SECONDS, type StoredQuizQuestion } from "../next/route";

const bodySchema = z.object({
  questionId: z.string().min(1),
  chosenIndex: z.number().int().min(0).max(2),
  timeMs: z.number().int().nonnegative().max(600_000).optional(),
});

/**
 * Grades one maths answer.
 *
 * The question is REGENERATED from the stored seed rather than reconstructed
 * from anything the client sends — same rule as the drill answer route. A body
 * that carried the options back could carry different ones.
 *
 * A question can be answered once. The session is burned before the row is
 * written, so a resubmit loses rather than double-counting.
 */
export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.QUIZ_ANSWER);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { questionId, chosenIndex, timeMs } = parsed.data;

  const stored = await getSession<StoredQuizQuestion>("quiz", questionId, auth.userId);
  if (stored === null) {
    // Missing, expired, or somebody else's — indistinguishable on purpose.
    return NextResponse.json({ error: "question_not_found" }, { status: 404 });
  }
  if (stored.answered) {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  const question = generateQuizQuestion({ family: stored.family }, stored.seed);
  if (chosenIndex >= question.options.length) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const correct = gradeQuizAnswer(question, chosenIndex);

  // Burn first, so a concurrent second submit loses.
  await putSession<StoredQuizQuestion>(
    "quiz",
    questionId,
    auth.userId,
    { ...stored, answered: true },
    QUIZ_TTL_SECONDS,
  );

  // Best-effort: a failed write must not cost the user their explanation.
  try {
    await getDb()
      .insert(quizAttempts)
      .values({
        userId: auth.userId,
        family: question.family,
        questionPayload: {
          prompt: question.prompt,
          options: question.options,
          correctIndex: question.correctIndex,
        },
        chosenIndex,
        correct,
        timeMs: timeMs ?? null,
      });
  } catch (error) {
    // Logged rather than swallowed. A bare `catch {}` here is exactly how
    // `rememberCustomer` hid a broken write for a whole substage.
    console.error("[quiz] attempt insert failed", error);
  }

  return NextResponse.json({
    correct,
    correctIndex: question.correctIndex,
    correctPercent: question.options[question.correctIndex],
    exactPercent: Math.round(question.exactPercent * 100) / 100,
    explanation: question.explanation,
  });
});
