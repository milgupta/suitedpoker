import { Suspense } from "react";
import { ConfirmClient } from "./confirm-client";

export const metadata = { robots: { index: false, follow: false } };

/**
 * The client half of the auth callback.
 *
 * Supabase can return a session two ways. PKCE puts a `code` in the query
 * string, which /auth/callback exchanges server-side. The implicit flow puts
 * the tokens in the URL FRAGMENT — and a fragment is never sent to the server,
 * so no route handler can ever see it. Admin-generated links always take this
 * path, because the PKCE verifier lives in the browser that started the flow
 * and a server-generated link has none.
 *
 * So this page exists to let the browser client consume the fragment.
 */
export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmClient />
    </Suspense>
  );
}
