import type { Metadata } from "next";
import { Suspense } from "react";
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
export default function PaywallPage() {
  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-8 pb-16">
      {/* annualCost is the price, not a results claim — see the note in analytics.ts. */}
      <TrackView
        event="paywall_viewed"
        properties={{ annualCost: PLANS.annual.amountCents / 100 }}
      />

      <Suspense fallback={null}>
        <PaywallClient />
      </Suspense>

      <SignOutButton />
    </div>
  );
}
