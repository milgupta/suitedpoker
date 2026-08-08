"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { identify, isAnalyticsConfigured } from "@/lib/analytics-client";

/**
 * Ties the anonymous browser to the real user, on the first authenticated
 * render of any page in the (app) group.
 *
 * WITHOUT THIS THE FUNNEL CANNOT COMPLETE, and the failure is invisible in the
 * event stream. Client captures carry PostHog's device id; `captureServer`
 * carries the Supabase user id, because a purchase attributed to an anonymous
 * visitor breaks revenue-by-source. Those are two different PERSONS in PostHog
 * until an `identify` merges them — so `paywall_viewed` and the
 * `purchase_completed` it led to belonged to two strangers, every funnel
 * containing both ended at 0%, and every event on its own looked perfectly
 * healthy. Measured before the fix: 2 people reached checkout, 2 purchases
 * landed, the funnel scored zero conversions.
 *
 * Here rather than in the login form because there is no single entry point.
 * Login was the only place that identified, so anyone who SIGNED UP and bought
 * in the same session — the entire acquisition funnel — was never identified at
 * all. Same reasoning as `captureAttributionOnce` in the layout above it.
 */

/**
 * Module scope, not a ref: this component remounts on every navigation within
 * the group, and an identify per page view is a $identify event per page view.
 */
let identifiedAs: string | null = null;

export function AnalyticsIdentity({ userId, signupDate }: { userId: string; signupDate: string }) {
  useEffect(() => {
    if (!isAnalyticsConfigured() || identifiedAs === userId) return;

    // Already merged in a previous session on this device — re-identifying is
    // harmless but sends an event per load, which is noise on the person and
    // cost on the bill.
    if (posthog.get_distinct_id() === userId) {
      identifiedAs = userId;
      return;
    }

    identifiedAs = userId;
    identify(userId, { signupDate });
  }, [userId, signupDate]);

  return null;
}
