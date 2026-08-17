import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadDashboard } from "@/lib/dashboard-server";
import { ProgressView } from "@/components/progress/progress-view";
import { QuizProgress } from "@/components/progress/quiz-progress";
import { loadQuizStats } from "@/lib/quiz-stats-server";

export const metadata: Metadata = { title: "Progress", robots: { index: false, follow: false } };

/**
 * Analytics for the player — rating, leaks, accuracy — off the home screen so
 * Home can stay a hub of "what now?".
 */
export default async function ProgressPage() {
  const user = await getUser();
  if (user === null) redirect("/login");

  // Fired together: the quiz breakdown is independent of the dashboard, and
  // running them in sequence would put a second Postgres round trip behind the
  // first for a section that sits below the fold.
  const [data, quiz] = await Promise.all([loadDashboard(user.id), loadQuizStats(user.id)]);
  return (
    <div className="flex flex-col gap-10">
      <ProgressView data={data} />
      <QuizProgress stats={quiz} />
    </div>
  );
}
