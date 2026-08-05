import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "../sign-out-button";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false, follow: false } };

/**
 * PLACEHOLDER — 7.2 builds the real paywall. It exists now so the entitlement
 * gate has somewhere to send people, and so 1.3's tests assert a real
 * destination rather than a 404.
 */
export default function PaywallPage() {
  return (
    <div>
      <h1 className="text-display-md">Subscribe to keep going</h1>
      <p className="text-text-secondary text-body-lg mt-3 max-w-[45ch]">
        Placeholder. 7.2 builds this. Checkout arrives with Stripe in 7.3.
      </p>
      <Button variant="accent" size="lg" className="mt-8" disabled>
        Checkout coming in 7.3
      </Button>
      <SignOutButton />
    </div>
  );
}
