"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { GoogleButton } from "../google-button";
import { START_CONTINUE_PATH } from "@/lib/start-answers";
import { SignupForm } from "./signup-form";

/**
 * Reads `?from=start` so the ads funnel can change copy and the post-auth
 * destination without a second signup route.
 */
export function SignupFromStart() {
  const searchParams = useSearchParams();
  const fromStart = searchParams.get("from") === "start";
  const afterAuth = fromStart ? START_CONTINUE_PATH : "/onboarding";

  return (
    <AuthShell
      title="Create your account"
      lead={
        fromStart
          ? "Save your answers — your leak breakdown is next."
          : "Ten minutes a day. Real spots, graded on what they cost you."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={fromStart ? `/login?next=${encodeURIComponent(START_CONTINUE_PATH)}` : "/login"}
            className="text-accent-bright hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <GoogleButton next={afterAuth} />
        <SignupForm />
      </div>
    </AuthShell>
  );
}
