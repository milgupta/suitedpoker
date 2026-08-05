import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "../auth-shell";
import { GoogleButton } from "../google-button";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to SuitedPoker.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      lead="Pick up where you left off."
      footer={
        <>
          No account?{" "}
          <Link href="/signup" className="text-accent-bright hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {/* useSearchParams needs a boundary or the whole route opts out of prerendering. */}
        <Suspense fallback={null}>
          <GoogleButton />
        </Suspense>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </AuthShell>
  );
}
