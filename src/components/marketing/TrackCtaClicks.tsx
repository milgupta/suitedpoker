"use client";

import { useEffect } from "react";
import { capture } from "@/lib/analytics-client";

/**
 * One delegated listener for every `[data-cta]` on the public surface.
 *
 * Mounted from `SiteHeader`, so any page carrying the header is covered and a
 * new CTA is tracked by giving it a `data-cta` — no per-link client component.
 * Capture phase, because the CTAs are Next `<Link>`s and the router's own
 * click handling must not decide whether the event fires. Navigation is
 * client-side on these links, so the page never unloads under the capture.
 */
export function TrackCtaClicks() {
  useEffect(() => {
    function onClick(event: MouseEvent): void {
      if (!(event.target instanceof Element)) return;
      const cta = event.target.closest("[data-cta]")?.getAttribute("data-cta");
      if (cta == null || cta === "") return;
      capture("landing_cta_clicked", { cta, page: window.location.pathname });
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
