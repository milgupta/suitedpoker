import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { APP_HOME } from "@/lib/app-chrome";
import { LEAK_BB100, LEAK_HEADLINE } from "@/lib/diagnosis";
import { hasActiveSubscription } from "@/lib/entitlement";
import { SignOutButton } from "../sign-out-button";
import { TrackView } from "@/components/track-view";
import { PaywallClient } from "./paywall-client";
import { PLANS } from "@/lib/stripe/plans";
import { ComplianceFooter } from "@/components/ComplianceFooter";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false, follow: false } };

/**
 * The paywall.
 *
 * Exempt from the entitlement gate for the obvious reason. The diagnosis scrim
 * is a slot: 7.2 builds the diagnosis and passes it in, and until then the page
 * opens on the benefits rather than on an empty blurred box.
 *
 * Already-subscribed visitors are sent home. Without that, a paid user who
 * re-enters the onboarding funnel (or bookmarks this URL) sees a second
 * checkout for a plan they already have.
 */
export default async function PaywallPage() {
  // The loss framing, from their own diagnosis. bb/100 only — a dollar figure
  // attached to a poker result is a compliance boundary, not copy.
  let leakBb100: number | null = null;
  let leakLabel: string | null = null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user !== null) {
    // Entitlement check stays OUTSIDE any catch — redirect() throws, and a
    // bare catch would swallow it and leave a subscriber on the paywall.
    let entitled = false;
    try {
      entitled = await hasActiveSubscription(user.id);
    } catch {
      // Fail open to checkout rather than soft-locking a paying path.
    }
    if (entitled) redirect(APP_HOME);

    try {
      const [row] = await getDb()
        .select({ leak: profiles.primaryLeakKey })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      if (row?.leak != null) {
        leakBb100 = LEAK_BB100[row.leak] ?? null;
        leakLabel = LEAK_HEADLINE[row.leak]?.toLowerCase() ?? null;
      }
    } catch {
      // No diagnosis is no reason to hide the paywall.
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-8 pb-16 lg:max-w-none">
      {/*
       * The atmosphere. Fixed to the viewport and behind everything, so it does
       * not scroll away a third of the way down the page and does not enter
       * layout — a payment screen is the last place to spend a CLS point.
       *
       * DESIGN.md permits ambient glow on marketing, onboarding, diagnosis and
       * the paywall, and forbids it behind the training canvas. This is one of
       * the four.
       */}
      <div
        aria-hidden
        className="paywall-wash pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        {/* z-0 beats .ambient-blob's own z-index:-1, which would otherwise put
            both blobs behind this container's own background. */}
        <span className="ambient-blob ambient-blob--accent top-[-14rem] right-[-8rem] z-0" />
        <span className="ambient-blob bottom-[-14rem] left-[-10rem] z-0 opacity-70" />
      </div>

      {/* annualCost is the price, not a results claim — see the note in analytics.ts. */}
      <TrackView
        event="paywall_viewed"
        properties={{ annualCost: PLANS.annual.amountCents / 100 }}
      />

      <Suspense fallback={null}>
        <PaywallClient leakBb100={leakBb100} leakLabel={leakLabel} />
      </Suspense>

      <SignOutButton />

      {/* The payment screen is the one page behind the login that a Stripe
          risk reviewer actually reaches. */}
      <ComplianceFooter />
    </div>
  );
}
