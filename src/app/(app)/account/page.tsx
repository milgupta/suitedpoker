import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadAccount } from "@/lib/account-server";
import { AccountClient } from "./account-client";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

/**
 * Settings, billing and the way out.
 *
 * Exempt from the entitlement gate (see ENTITLEMENT_EXEMPT_PREFIXES) because a
 * cancelled or past-due user is exactly the person who needs to reach billing.
 * Gating this behind a subscription means the only people who can fix a failed
 * card are the ones whose card worked.
 */
export default async function AccountPage() {
  const user = await getUser();
  if (user === null) redirect("/login");

  const account = await loadAccount(user.id, user.email ?? "");
  return <AccountClient account={account} />;
}
