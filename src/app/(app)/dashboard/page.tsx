import type { Metadata } from "next";
import { SignOutButton } from "../sign-out-button";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

/**
 * PLACEHOLDER — Stage 3 builds the real dashboard. It exists now so auth has a
 * genuine destination to redirect to and the e2e tests assert something real.
 */
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-display-md">Dashboard</h1>
      <p className="text-text-secondary text-body-lg mt-3">Placeholder. Stage 3 builds this.</p>
      <SignOutButton />
    </div>
  );
}
