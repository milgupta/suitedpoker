"use client";

import { clientEnv } from "@/lib/env";
import type { MetaEventName } from "@/lib/meta";

/**
 * The browser half of the pixel.
 *
 * Every deduplicated event goes out TWICE — once through `fbq` here, once
 * through /api/meta/capi — carrying the same `eventID`. Meta collapses the
 * pair. The pixel alone loses roughly a third of conversions to ATT and
 * adblockers; CAPI alone loses the browser-side signals that make matching
 * work. Both, deduplicated, is the only configuration that scales.
 */

interface Fbq {
  (command: "init" | "track" | "trackSingle", ...args: unknown[]): void;
  queue?: unknown[];
  loaded?: boolean;
}

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export function isPixelConfigured(): boolean {
  const id = clientEnv.NEXT_PUBLIC_META_PIXEL_ID;
  return typeof id === "string" && id !== "";
}

/**
 * A dedup key both sides can agree on.
 *
 * `crypto.randomUUID` where available; the fallback matters because it runs on
 * exactly the locked-down browsers this whole mechanism exists for.
 */
export function newEventId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

/** Fires the pixel only. Used for PageView, which is not deduplicated. */
export function trackPixel(
  event: MetaEventName,
  eventId?: string,
  customData?: Record<string, string | number>,
): void {
  if (!isPixelConfigured()) return;
  if (typeof window === "undefined" || window.fbq === undefined) return;

  try {
    window.fbq("track", event, customData ?? {}, eventId === undefined ? {} : { eventID: eventId });
  } catch {
    // An adblocker that stubs fbq badly must not take a page down with it.
  }
}

/**
 * Fires both halves with one id.
 *
 * The CAPI call is fire-and-forget: an attribution event must never delay the
 * user's next screen, and the server queues its own failures for retry.
 */
export function trackDeduplicated(
  event: Extract<MetaEventName, "ViewContent" | "InitiateCheckout" | "Lead">,
  customData?: Record<string, string | number>,
): string {
  const eventId = newEventId(event.toLowerCase());

  trackPixel(event, eventId, customData);

  void fetch("/api/meta/capi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventName: event,
      eventId,
      sourceUrl: typeof window === "undefined" ? undefined : window.location.href,
      customData,
    }),
    keepalive: true,
  }).catch(() => undefined);

  return eventId;
}
