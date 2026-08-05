import type { Metadata } from "next";
import { SignOutButton } from "../sign-out-button";

export const metadata: Metadata = { title: "Onboarding", robots: { index: false, follow: false } };

/**
 * PLACEHOLDER — Stage 3.1 builds the real onboarding. It exists now so signup
 * has a genuine destination.
 */
export default function OnboardingPage() {
  return (
    <div>
      <h1 className="text-display-md">Onboarding</h1>
      <p className="text-text-secondary text-body-lg mt-3">Placeholder. Stage 3.1 builds this.</p>
      <SignOutButton />
    </div>
  );
}
