"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_HOME } from "@/lib/app-chrome";

/** Only same-origin paths — this value arrives from an emailed URL. */
function safeNext(value: string | null): string {
  return value !== null && value.startsWith("/") && !value.startsWith("//") ? value : APP_HOME;
}

export function ConfirmClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = safeNext(params.get("next"));

    async function run(): Promise<void> {
      // The tokens are parsed out of the fragment by hand rather than relying
      // on the client's detectSessionInUrl: @supabase/ssr builds a PKCE client,
      // which looks for a `code` in the query string and does not reliably pick
      // up an implicit-flow hash. Doing it explicitly makes the behaviour the
      // same whatever the SDK defaults happen to be.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      if (hash.get("error") !== null || hash.get("error_description") !== null) {
        setFailed(true);
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken === null || refreshToken === null) {
        setFailed(true);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error !== null) {
        setFailed(true);
        return;
      }

      // Drop the tokens out of the address bar before navigating — they should
      // not sit in browser history or survive a copied URL.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      router.replace(next);
      router.refresh();
    }

    void run();
  }, [params, router]);

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      {failed ? (
        <>
          <h1 className="text-heading-lg">That link has expired</h1>
          <p className="text-text-secondary text-body-md mt-3">
            Links are single use and time limited.{" "}
            <a href="/login" className="text-accent-bright hover:underline">
              Back to log in
            </a>
          </p>
        </>
      ) : (
        <p className="text-text-secondary text-body-md" role="status">
          Signing you in…
        </p>
      )}
    </div>
  );
}
