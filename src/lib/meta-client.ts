"use client";

import { clientEnv } from "@/lib/env";
import { metaDelivery, type MetaDelivery, type MetaEventName } from "@/lib/meta";

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
 * Whether this build may reach the live dataset.
 *
 * Read from the build-time-inlined `NEXT_PUBLIC_VERCEL_ENV`, so a preview
 * deploy and a laptop both resolve to `log` without any runtime check the
 * bundle could get wrong.
 *
 * NO TEST-EVENTS BRANCH HERE, unlike the CAPI half. `test_event_code` is a
 * field on the server API's payload and `fbq` has no equivalent — and
 * `META_TEST_EVENT_CODE` is a server variable that must stay one, since a
 * NEXT_PUBLIC copy would ship the code to every visitor. Outside production the
 * pixel therefore always logs, and Meta's Test Events panel is fed by the CAPI
 * half. That is not a gap in coverage: the pair carry the same event id and the
 * same custom data, so what lands in the panel is what the pixel would have
 * sent.
 */
export function pixelDelivery(): MetaDelivery {
  return metaDelivery(clientEnv.NEXT_PUBLIC_VERCEL_ENV);
}

/** True when the pixel script itself should be injected at all. */
export function shouldLoadPixel(): boolean {
  return isPixelConfigured() && pixelDelivery() === "send";
}

function logSuppressed(
  event: MetaEventName,
  eventId: string | undefined,
  customData: Record<string, string | number> | undefined,
): void {
  const env = clientEnv.NEXT_PUBLIC_VERCEL_ENV;
  const custom = customData === undefined ? "" : ` custom=${JSON.stringify(customData)}`;
  console.info(
    `[meta] SUPPRESSED pixel (${env === undefined || env === "" ? "no VERCEL_ENV" : env}) ${event} id=${eventId ?? "—"}${custom}`,
  );
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

  // Outside production the script was never injected, so `fbq` is undefined and
  // this would return silently either way — the log is the point. "Nothing
  // happened" and "it was suppressed" have to be distinguishable, or verifying
  // that an event fires in dev is impossible.
  if (pixelDelivery() === "log") {
    logSuppressed(event, eventId, customData);
    return;
  }

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
 *
 * OUTSIDE PRODUCTION THE CAPI CALL IS STILL MADE, and the server logs instead
 * of posting. The route is the only place that resolves the user data — the
 * hashed email, the fbp and the fbc — so skipping it in dev would hide exactly
 * the thing worth checking in dev. The pixel half logs here; the CAPI half logs
 * where its payload actually exists.
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
