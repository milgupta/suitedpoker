import {
  QUESTION_IDS,
  QUESTIONS,
  isAnswered,
  type Answers,
  type QuestionId,
} from "@/lib/onboarding";

/**
 * Pre-account quiz answers for the paid-ads funnel (`/start`).
 *
 * Organic traffic still signs up first and answers on `/onboarding`. Ads land
 * on `/start`, answer anonymously, then create an account. The answers live in
 * localStorage until signup commits them through the same `/api/onboarding`
 * path the authenticated quiz uses — one derivation, one profile write.
 */

export const START_ANSWERS_KEY = "suitedpoker:start-answers:v1";

/** Signup and OAuth land here so a confirmed email still picks up the quiz. */
export const START_CONTINUE_PATH = "/onboarding/continue";

export function coerceAnswers(raw: unknown): Answers {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

  const source = raw as Record<string, unknown>;
  const answers: Answers = {};

  for (const id of QUESTION_IDS) {
    const value = source[id];
    if (id === "leaks") {
      if (Array.isArray(value)) {
        const leaks = value
          .filter((v): v is string => typeof v === "string")
          .filter((v) => v.length > 0 && v.length <= 40)
          .slice(0, 10);
        if (leaks.length > 0) answers.leaks = leaks;
      }
      continue;
    }
    if (typeof value === "string" && value.length > 0 && value.length <= 40) {
      answers[id] = value;
    }
  }

  return answers;
}

export function answersAreComplete(answers: Answers): boolean {
  for (const question of QUESTIONS) {
    if (question.optional) continue;
    if (!isAnswered(question, answers)) return false;
  }
  return true;
}

/** True when every required question id is present — used by tests and commit. */
export function requiredIdsAnswered(answers: Answers): QuestionId[] {
  return QUESTION_IDS.filter((id) => {
    const question = QUESTIONS.find((q) => q.id === id);
    if (question === undefined || question.optional) return false;
    return isAnswered(question, answers);
  });
}
