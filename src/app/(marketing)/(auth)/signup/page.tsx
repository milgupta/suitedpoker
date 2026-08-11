import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "../auth-shell";
import { SignupFromStart } from "./signup-from-start";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Start learning what a solver would do.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          title="Create your account"
          lead="Ten minutes a day. Real spots, graded on what they cost you."
        >
          <div className="bg-surface-2 h-40 animate-pulse rounded-lg" aria-hidden />
        </AuthShell>
      }
    >
      <SignupFromStart />
    </Suspense>
  );
}
