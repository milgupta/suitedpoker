import type { Metadata } from "next";
import { HandClient } from "./hand-client";

export const metadata: Metadata = {
  title: "One hand",
  robots: { index: false, follow: false },
};

/**
 * Between the questionnaire and the diagnosis, before the paywall.
 *
 * Inside the (app) group but under /onboarding, which 1.3 exempts from the
 * entitlement gate — nobody here has paid, and that is the point.
 */
export default function OnboardingHandPage() {
  return <HandClient />;
}
