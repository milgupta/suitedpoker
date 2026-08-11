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

  // Already cancelling — send them back to the account panel that shows the end date.
  if (billing.cancelAtPeriodEnd) redirect("/account");

  // Entitled but price id does not match env (stale test price, live/test mismatch).
  // Still render a cancel shell so Account → Cancel never bounces to a blank loop.
  if (billing.plan === null) {
    if (!billing.entitled) redirect("/account");
    return (
      <CancelClient
        plan="monthly"
        periodEnd={billing.currentPeriodEnd?.toISOString() ?? null}
        planUnknown
      />
    );
  }

  return (
    <CancelClient plan={billing.plan} periodEnd={billing.currentPeriodEnd?.toISOString() ?? null} />
  );
}
