import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

/**
 * PLACEHOLDER — 7.4 builds this properly.
 *
 * Exempt from the entitlement gate on purpose: Stripe redirects here the moment
 * checkout succeeds, which can be BEFORE its webhook has written the
 * subscription row. Gating this page would bounce a user who has just paid
 * straight back to the paywall.
 */
export default function WelcomePage() {
  return (
    <div>
      <h1 className="text-display-md">You&apos;re in</h1>
      <p className="text-text-secondary text-body-lg mt-3">Placeholder. 7.4 builds this.</p>
      <Button variant="primary" size="lg" className="mt-8" asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}
