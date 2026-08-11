import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { APP_HOME } from "@/lib/app-chrome";
import { OnboardingClient } from "@/components/onboarding/onboarding-client";
import { hasActiveSubscription } from "@/lib/entitlement";
import { resumeIndex, TOTAL_STEPS, type Answers } from "@/lib/onboarding";
import type { DemoHandRecord } from "@/lib/demo-hand";

export const metadata: Metadata = { title: "Onboarding", robots: { index: false, follow: false } };

/**
 * The quiz, resumed.
 *
 * Answers are read on the server so a returning user lands on the question they
 * stopped at with no flash of question one. Dropping off halfway and being made
 * to start again is how a half-finished signup becomes no signup.
 *
 * A finished quiz must not reopen on the last step: that re-fires the demo
 * hand → diagnosis → paywall chain, which is how a subscriber ends up buying
 * again. Paid users go home; unpaid users pick up at the hand or diagnosis.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let answers: Answers = {};
  let demoHand: DemoHandRecord | null = null;
  if (user !== null) {
    try {
      const [row] = await getDb()
        .select({ onboarding: profiles.onboarding })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      answers = (row?.onboarding ?? {}) as Answers;
      demoHand = (row?.onboarding as { demoHand?: DemoHandRecord } | null)?.demoHand ?? null;
    } catch {
      // A database hiccup costs the resume, never the quiz.
    }

    if (resumeIndex(answers) >= TOTAL_STEPS) {
      let entitled = false;
      try {
        entitled = await hasActiveSubscription(user.id);
      } catch {
        // Treat as unpaid so we still advance past a finished quiz.
      }
      if (entitled) redirect(APP_HOME);
      redirect(demoHand !== null ? "/diagnosis" : "/onboarding/hand");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[30rem]">
      <OnboardingClient initialAnswers={answers} />
    </div>
  );
}
