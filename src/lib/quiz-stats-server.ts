import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { quizAttempts } from "@/db/schema";
import { quizStats, type QuizStats } from "@/lib/quiz-stats";

/** How far back the breakdown looks. Enough to be stable, not so far it is stale. */
const WINDOW = 500;

/**
 * One query, then pure arithmetic.
 *
 * Best-effort: a database hiccup returns an empty breakdown rather than taking
 * the whole progress page down with it. The quiz section is additive — a
 * missing one costs a card, a thrown one costs the rating and the leak report
 * that sit above it.
 */
export async function loadQuizStats(userId: string): Promise<QuizStats> {
  try {
    const rows = await getDb()
      .select({ family: quizAttempts.family, correct: quizAttempts.correct })
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, userId))
      .orderBy(desc(quizAttempts.createdAt))
      .limit(WINDOW);
    return quizStats(rows);
  } catch (error) {
    console.error("[quiz] stats load failed", error);
    return quizStats([]);
  }
}
