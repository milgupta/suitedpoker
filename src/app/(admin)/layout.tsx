import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { adminEmails } from "@/lib/env.server";

/**
 * The admin group, deliberately OUTSIDE `(app)`.
 *
 * Inside it, 1.3's entitlement middleware would redirect an admin who does not
 * happen to hold a subscription straight to /paywall — so the cost dashboard
 * would be unreachable exactly when you are trying to work out why the cost is
 * high.
 *
 * `notFound()` rather than a redirect or a 403: a non-admin should not learn
 * that /admin/costs exists.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  const allowed = adminEmails();

  // An empty allowlist means NOBODY, never everybody. A misconfigured env var
  // must not open the admin area to every signed-in user.
  if (user === null || allowed.length === 0) notFound();
  if (!allowed.includes((user.email ?? "").toLowerCase())) notFound();

  return <div className="mx-auto max-w-(--container-app) px-4 py-(--app-shell-py)">{children}</div>;
}
