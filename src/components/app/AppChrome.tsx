"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppNav } from "@/components/app/AppNav";
import { chromeMode } from "@/lib/app-chrome";
import { cn } from "@/lib/utils";

/**
 * Entitled-product shell: glass bar on hubs, compact escape on immersive
 * sessions, nothing on the funnel. Padding lives here so a hidden chrome does
 * not leave a 56px gap above onboarding.
 */

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/practice";
  const mode = chromeMode(pathname);

  if (mode === "hidden") {
    return (
      <div className="mx-auto max-w-(--container-app) px-4 py-(--app-shell-py)">{children}</div>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-(--container-app) px-4 pt-4 pb-(--app-shell-py)",
        // Immersive play wants more horizontal room; hubs stay in the 1100 shell.
        mode === "compact" && "max-w-none",
      )}
    >
      <AppNav mode={mode} pathname={pathname} />
      {children}
    </div>
  );
}
