import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { OnboardingClient } from "./onboarding-client";
import type { Answers } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Onboarding", robots: { index: false, follow: false } };

/**
 * The quiz, resumed.
 *
 * Answers are read on the server so a returning user lands on the question they
 * stopped at with no flash of question one. Dropping off halfway and being made
 * to start again is how a half-finished signup becomes no signup.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let answers: Answers = {};
  if (user !== null) {
    try {
      const [row] = await getDb()
        .select({ onboarding: profiles.onboarding })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      answers = (row?.onboarding ?? {}) as Answers;
    } catch {
      // A database hiccup costs the resume, never the quiz.
    }
  }

  return (
    <div className="mx-auto w-full max-w-[30rem]">
      <OnboardingClient initialAnswers={answers} />
    </div>
  );
}
