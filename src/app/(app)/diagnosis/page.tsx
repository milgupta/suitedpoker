import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { APP_HOME } from "@/lib/app-chrome";
import { buildDiagnosis } from "@/lib/diagnosis";
import { hasActiveSubscription } from "@/lib/entitlement";
import { resumeIndex, TOTAL_STEPS, type Answers } from "@/lib/onboarding";
import { DiagnosisClient } from "./diagnosis-client";
import type { DemoHandRecord } from "@/lib/demo-hand";

export const metadata: Metadata = { title: "Your leak", robots: { index: false, follow: false } };

/**
 * The screen immediately before the paywall.
 *
 * Computed server-side from the profile's onboarding answers — the client
 * receives finished numbers, never the model. Arriving here without having
 * answered the quiz redirects back into it: a diagnosis of nothing would have
 * to fabricate, and fabricating is the competitor's mistake this screen exists
 * to not make.
 */
export default async function DiagnosisPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) redirect("/login");

  let answers: Answers = {};
  let demoHand: DemoHandRecord | null = null;
  try {
    const [row] = await getDb()
      .select({ onboarding: profiles.onboarding })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    answers = (row?.onboarding ?? {}) as Answers;
    // 7.2b writes this. Absent for anyone who dropped out mid-funnel and came
    // back, which the screen is built to survive.
    demoHand = (row?.onboarding as { demoHand?: DemoHandRecord } | null)?.demoHand ?? null;
  } catch {
    redirect("/onboarding");
  }

  // The quiz must actually be finished — a partial diagnosis reads as broken.
  if (resumeIndex(answers) < TOTAL_STEPS) redirect("/onboarding");

  // Subscribers who reopen this URL should train, not see "See my plan".
  let entitled = false;
  try {
    entitled = await hasActiveSubscription(user.id);
  } catch {
    // Fail toward the paywall CTA — wrong for a subscriber only if the
    // entitlement check itself is down, which the paywall page also guards.
  }

  return (
    <div className="mx-auto w-full max-w-[30rem] pb-16">
      <DiagnosisClient
        diagnosis={buildDiagnosis(answers)}
        demoHand={demoHand}
        nextHref={entitled ? APP_HOME : "/paywall"}
        nextLabel={entitled ? "Start practicing →" : "See my plan →"}
      />
    </div>
  );
}
