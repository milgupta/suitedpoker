import type { Metadata } from "next";
import { ContinueClient } from "./continue-client";

export const metadata: Metadata = {
  title: "Onboarding",
  robots: { index: false, follow: false },
};

/**
 * Bridge after `/start` → signup (email confirm, Google, or immediate session).
 *
 * Commits localStorage answers to the profile, then sends them to the demo
 * hand. Organic signups never land here.
 */
export default function ContinuePage() {
  return <ContinueClient />;
}
