"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { capturePageview, initAnalytics, setSessionRecording } from "@/lib/analytics-client";

/**
 * Screens where rrweb session recording is paused: each renders a poker table
 * with an infinite pulse animation and a full re-render per hand, and
 * recording every DOM mutation of that costs real CPU on the mid-tier phones
 * most users play on. Event capture (the funnel) is unaffected.
 */
const RECORDING_PAUSED_PREFIXES = ["/arena", "/daily", "/table"];

/**
 * Initialises PostHog once and captures a pageview per App Router navigation.
 *
 * The App Router does not do a full page load between routes, so PostHog's own
 * automatic pageview fires exactly once and then never again. Capturing on
 * pathname change is the only way the funnel sees the journey.
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    const query = searchParams.toString();
    const url = query === "" ? pathname : `${pathname}?${query}`;

    // React re-renders and Strict Mode's double effect must not produce two
    // pageviews for one navigation.
    if (lastUrl.current === url) return;
    lastUrl.current = url;

    capturePageview(`${window.location.origin}${url}`);
    setSessionRecording(!RECORDING_PAUSED_PREFIXES.some((p) => pathname.startsWith(p)));
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <>
      {/* useSearchParams needs a Suspense boundary, or every route that renders
          this opts out of static rendering entirely. */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}
