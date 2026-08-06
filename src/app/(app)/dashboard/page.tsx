import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadDashboard } from "@/lib/dashboard-server";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

/**
 * The home screen.
 *
 * Server-rendered from one query pass, so the answer to "what do I do right
 * now?" is on screen with the first paint rather than after a spinner.
 */
export default async function DashboardPage() {
  const user = await getUser();
  if (user === null) redirect("/login");

  const data = await loadDashboard(user.id);
  return <DashboardView data={data} email={user.email ?? null} />;
}
