import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadAccount } from "@/lib/account-server";
import { AccountClient } from "./account-client";
import { SignOutButton } from "../sign-out-button";

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
  return (
    <>
      <AccountClient account={account} />
      {/*
        The ONLY way a subscribed user can log out.
        SignOutButton lived on /paywall alone, so anyone who had paid had no
        sign-out control anywhere in the product — found by an auth e2e whose
        assertion had been stale since 5.3 replaced the dashboard header.
      */}
      <div className="mx-auto max-w-lg">
        <SignOutButton />
      </div>
    </>
  );
}
