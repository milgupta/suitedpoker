import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { LEAK_BB100, LEAK_HEADLINE } from "@/lib/diagnosis";
import { SignOutButton } from "../sign-out-button";
import { TrackView } from "@/components/track-view";
import { PaywallClient } from "./paywall-client";
import { PLANS } from "@/lib/stripe/plans";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false, follow: false } };

/**
 * The paywall.
 *
 * Exempt from the entitlement gate for the obvious reason. The diagnosis scrim
 * is a slot: 7.2 builds the diagnosis and passes it in, and until then the page
 * opens on the benefits rather than on an empty blurred box.
 */
export default async function PaywallPage() {
  // The loss framing, from their own diagnosis. bb/100 only — a dollar figure
  // attached to a poker result is a compliance boundary, not copy.
  let leakBb100: number | null = null;
  let leakLabel: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user !== null) {
      const [row] = await getDb()
        .select({ leak: profiles.primaryLeakKey })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      if (row?.leak != null) {
        leakBb100 = LEAK_BB100[row.leak] ?? null;
        leakLabel = LEAK_HEADLINE[row.leak]?.toLowerCase() ?? null;
      }
    }
  } catch {
    // No diagnosis is no reason to hide the paywall.
  }

  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-8 pb-16">
      {/* annualCost is the price, not a results claim — see the note in analytics.ts. */}
      <TrackView
        event="paywall_viewed"
        properties={{ annualCost: PLANS.annual.amountCents / 100 }}
      />

      <Suspense fallback={null}>
        <PaywallClient leakBb100={leakBb100} leakLabel={leakLabel} />
      </Suspense>

      <SignOutButton />
    </div>
  );
}
