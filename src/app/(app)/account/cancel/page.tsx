import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadBilling } from "@/lib/account-server";
import { CancelClient } from "./cancel-client";

export const metadata: Metadata = {
  title: "Cancel subscription",
  robots: { index: false, follow: false },
};

export default async function CancelPage() {
  const user = await getUser();
  if (user === null) redirect("/login");

  const billing = await loadBilling(user.id);
  // Nothing to cancel — most likely a second visit after cancelling.
  if (billing.plan === null || billing.cancelAtPeriodEnd) redirect("/account");

  return (
    <CancelClient plan={billing.plan} periodEnd={billing.currentPeriodEnd?.toISOString() ?? null} />
  );
}
