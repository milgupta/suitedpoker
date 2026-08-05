"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";
import { capture } from "@/lib/analytics-client";
import { FormError } from "./auth-shell";

/**
 * Google sign-in.
 *
 * The provider has to be enabled in the Supabase dashboard against a Google
 * Cloud OAuth client. Until it is, Supabase returns `provider_disabled` and the
 * user sees "That sign-in method isn't switched on yet." rather than a raw
 * error — the button is wired, not pretending.
 */
export function GoogleButton({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");
    capture("signup_started", { method: "google" });

    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next !== undefined && next !== "") callback.searchParams.set("next", next);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    // On success the browser has already navigated away, so only a failure
    // reaches this line.
    if (oauthError !== null) {
      setError(authErrorMessage(oauthError));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={signIn}
        loading={pending}
      >
        {/*
          Google's logo is a third-party brand asset with mandated colours, not
          a design-system value. It lives in public/ so those hexes stay out of
          the codebase and the no-hardcoded-colour rule stays absolute.
        */}
        {!pending && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/google-logo.svg" alt="" width={20} height={20} aria-hidden="true" />
        )}
        Continue with Google
      </Button>

      <FormError message={error} />

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="border-border-subtle h-px flex-1 border-t" />
        <span className="text-text-tertiary text-caption">or</span>
        <span className="border-border-subtle h-px flex-1 border-t" />
      </div>
    </div>
  );
}
