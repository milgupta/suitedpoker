import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { WelcomeClient } from "./welcome-client";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

/**
 * Exempt from the entitlement gate on purpose (see ENTITLEMENT_EXEMPT_PREFIXES).
 *
 * Stripe redirects here the moment checkout succeeds, which can be before its
 * webhook has written the subscription row. Gating this page would bounce a
 * user who has just paid straight back to the paywall — the most damaging bug
 * in the whole payment flow, and the reason /welcome exists at all.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <WelcomeClient hasSession={user !== null} />;
}
