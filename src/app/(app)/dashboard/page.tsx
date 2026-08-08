import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_HOME } from "@/lib/app-chrome";

export const metadata: Metadata = { title: "Home", robots: { index: false, follow: false } };

/**
 * Legacy entry. Bookmarks and old emails still hit /dashboard; Practice is the
 * product home now, so this only exists to forward them.
 */
export default function DashboardPage() {
  redirect(APP_HOME);
}
