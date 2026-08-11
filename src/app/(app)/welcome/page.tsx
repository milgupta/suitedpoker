import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { continueAfterWelcome, type Answers } from "@/lib/onboarding";
import { WelcomeClient } from "./welcome-client";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

/**
 * Exempt from the entitlement gate on purpose (see ENTITLEMENT_EXEMPT_PREFIXES).
 *
 * Stripe redirects here the moment checkout succeeds, which can be before its
 * webhook has written the subscription row. Gating this page would bounce a
 * user who has just paid straight back to the paywall — the most damaging bug
 * in the whole payment flow, and the reason /welcome exists at all.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let continueHref: "/onboarding" | "/practice" = "/practice";
  if (user !== null) {
    try {
      const [row] = await getDb()
        .select({ onboarding: profiles.onboarding })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      continueHref = continueAfterWelcome((row?.onboarding ?? {}) as Answers);
    } catch {
      // A DB miss must not strand them on Start → nowhere. Practice is gated;
      // if entitlement is not ready yet they will wait on this page instead.
      continueHref = "/practice";
    }
  }

  return <WelcomeClient hasSession={user !== null} continueHref={continueHref} />;
}
