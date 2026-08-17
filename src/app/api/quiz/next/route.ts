import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withEntitlement } from "@/lib/api-guard";
import { putSession } from "@/lib/sessionstore";
import { limit, RULES } from "@/lib/ratelimit";
import {
  generateQuizQuestion,
  QUIZ_FAMILIES,
  toClientQuestion,
  type QuizConfig,
  type QuizFamily,
} from "@/poker/quiz";

export const QUIZ_TTL_SECONDS = 30 * 60;

/**
 * Hands out the next maths question.
 *
 * SAME BOUNDARY AS A DRILL, for a slightly different reason. The answer to
 * "how often does an open-ender get there" is public arithmetic — a determined
 * user can compute it, and good luck to them. What must not happen is the
 * correct INDEX arriving in the payload, because the per-family breakdown on
 * /progress is only worth showing if it reflects what somebody actually knew.
 * A stat anybody can farm from devtools is not a stat.
 *
 * So the question is generated server-side from a seed the client never sees,
 * `toClientQuestion` strips the answer by omission, and the answer route
 * regenerates from the stored seed rather than trusting anything sent back.
 */
export interface StoredQuizQuestion {
  seed: string;
  family: QuizFamily;
  answered: boolean;
}

function isFamily(value: unknown): value is QuizFamily {
  return typeof value === "string" && (QUIZ_FAMILIES as readonly string[]).includes(value);
}

export const POST = withEntitlement(async (request, auth) => {
  const gate = await limit(auth.userId, RULES.QUIZ_NEXT);
  if (!gate.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: gate.resetAt }, { status: 429 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is the ordinary case — "give me any question".
  }

  const requested = (body as { family?: unknown }).family;
  const config: QuizConfig = isFamily(requested) ? { family: requested } : {};

  const seed = randomUUID();
  const question = generateQuizQuestion(config, seed);
  const questionId = randomUUID();

  await putSession<StoredQuizQuestion>(
    "quiz",
    questionId,
    auth.userId,
    { seed, family: question.family, answered: false },
    QUIZ_TTL_SECONDS,
  );

  return NextResponse.json({ questionId, question: toClientQuestion(question) });
});
