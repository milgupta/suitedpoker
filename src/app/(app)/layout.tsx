import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { captureAttributionOnce } from "@/lib/attribution-server";
import { AnalyticsIdentity } from "@/components/AnalyticsIdentity";
import { AppChrome } from "@/components/app/AppChrome";

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

  return (
    <AppChrome>
      {/* Same "first authenticated render" hook as the attribution call above:
          without it the client stays anonymous and never joins the server-side
          purchase, so every funnel ending in a sale scores zero. */}
      <AnalyticsIdentity userId={user.id} signupDate={user.created_at} />
      {children}
    </AppChrome>
  );
}
