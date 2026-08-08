import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { loadDashboard } from "@/lib/dashboard-server";
import { ProgressView } from "@/components/progress/progress-view";

export const metadata: Metadata = { title: "Progress", robots: { index: false, follow: false } };

/**
 * Analytics for the player — rating, leaks, accuracy — off the home screen so
 * Home can stay a hub of "what now?".
 */
export default async function ProgressPage() {
  const user = await getUser();
  if (user === null) redirect("/login");

  const data = await loadDashboard(user.id);
  return <ProgressView data={data} />;
}
