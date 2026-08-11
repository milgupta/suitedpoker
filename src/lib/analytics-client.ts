"use client";

import posthog from "posthog-js";
import { clientEnv } from "@/lib/env";
import type { EventMap, EventName, UserTraits } from "@/lib/analytics";

/**
 * The client capture surface.
 *
 * Typed against the schema so a typo'd event name is a compile error rather
 * than a silently missing funnel step discovered three weeks later, when the
 * data is gone.
 */

let started = false;

export function isAnalyticsConfigured(): boolean {
  const key = clientEnv.NEXT_PUBLIC_POSTHOG_KEY;
  return typeof key === "string" && key !== "";
}

export function initAnalytics(): void {
  // Guarded because React 18+ mounts effects twice in development, and an
  // init-per-mount produces duplicate pageviews in the funnel.
  if (started || !isAnalyticsConfigured() || typeof window === "undefined") return;
  started = true;

  posthog.init(clientEnv.NEXT_PUBLIC_POSTHOG_KEY as string, {
    // Same-origin, so an adblocker that blocks posthog.com does not eat the
    // data. The rewrite lives in next.config.ts.
    api_host: "/ingest",
    ui_host: clientEnv.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: "identified_only",
    // Pageviews are captured manually — the App Router does not do a full
    // navigation, so the automatic one fires once and never again.
    capture_pageview: false,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
    },
    autocapture: false,
  });
}

/**
 * Every capture path goes through this, never a bare `started` check.
 *
 * React runs CHILD effects before PARENT effects, so a `TrackView` inside the
 * tree fires before PostHogProvider's init effect has run. Reading `started`
 * directly dropped the first event of every page load — landing_viewed among
 * them — silently, with the client otherwise healthy. initAnalytics is
 * idempotent, so the ordering simply stops mattering.
 */
function ready(): boolean {
  initAnalytics();
  return started;
}

export function capture<E extends EventName>(event: E, properties: EventMap[E]): void {
  if (!ready()) return;
  posthog.capture(event, properties);
}

export function identify(userId: string, traits: Partial<UserTraits>): void {
  if (!ready()) return;
  posthog.identify(userId, traits);
}

/**
 * Pause/resume rrweb session recording. The table screens re-render an
 * animated table per hand, and recording those mutations costs real CPU on
 * mid-tier phones — the provider pauses recording there and resumes elsewhere.
 * Idempotent: PostHog treats repeat calls as no-ops.
 */
export function setSessionRecording(enabled: boolean): void {
  if (!ready()) return;
  if (enabled) posthog.startSessionRecording();
  else posthog.stopSessionRecording();
}

export function resetAnalytics(): void {
  if (!ready()) return;
  // On logout, or the next user on a shared device inherits the last one's
  // identity and every funnel is wrong.
  posthog.reset();
}

export function capturePageview(url: string): void {
  if (!ready()) return;
  posthog.capture("$pageview", { $current_url: url });
}
