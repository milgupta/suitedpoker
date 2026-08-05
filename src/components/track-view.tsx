"use client";

import { useEffect, useRef } from "react";
import { capture } from "@/lib/analytics-client";
import type { EventMap, EventName } from "@/lib/analytics";

/**
 * Fires a view event exactly once for a server-rendered page.
 *
 * The ref guard matters: React Strict Mode runs effects twice in development,
 * and without it every funnel step would be double-counted locally and the
 * numbers would never reconcile with production.
 */
export function TrackView<E extends EventName>({
  event,
  properties,
}: {
  event: E;
  properties: EventMap[E];
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    capture(event, properties);
  }, [event, properties]);

  return null;
}
