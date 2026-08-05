import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "../auth-shell";
import { GoogleButton } from "../google-button";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Start learning what a solver would do.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      lead="Ten minutes a day. Real spots, graded on what they cost you."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent-bright hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Suspense fallback={null}>
          <GoogleButton next="/onboarding" />
        </Suspense>
        <SignupForm />
      </div>
    </AuthShell>
  );
}
