import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { captureAttributionOnce } from "@/lib/attribution-server";

/**
 * Everything in this group requires a session.
 *
 * Middleware already redirects unauthenticated requests, but this is checked
 * again here on purpose: middleware can be bypassed by a misconfigured matcher,
 * and a layout that assumes a user without proving it is how a page ends up
 * rendering null-dereferenced data.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  if (user === null) redirect("/login");

  // The first authenticated render, whichever page it is. There is no single
  // entry point — /onboarding, /paywall and /welcome are all first pages for
  // somebody — and a buyer who never finished onboarding still needs
  // attribution on their profile before the Stripe webhook reads it.
  await captureAttributionOnce(user.id);

  return <div className="mx-auto max-w-(--container-app) px-4 py-(--app-shell-py)">{children}</div>;
}
