import "server-only";

import { PostHog } from "posthog-node";
import { clientEnv } from "@/lib/env";
import type { EventMap, EventName } from "@/lib/analytics";

/**
 * Server-side capture, for events the browser cannot be trusted to send —
 * above all `purchase_completed`, which arrives on a Stripe webhook.
 *
 * The distinctId MUST be the user's id, never an anonymous one. A purchase
 * attributed to an anonymous visitor breaks every revenue-by-source report,
 * and it is the single easiest thing to get wrong here.
 */

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = clientEnv.NEXT_PUBLIC_POSTHOG_KEY;
  if (typeof key !== "string" || key === "") return null;
  if (client !== null) return client;

  client = new PostHog(key, {
    host: clientEnv.NEXT_PUBLIC_POSTHOG_HOST,
    // A webhook handler exits before a batch would flush, so send immediately.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function captureServer<E extends EventName>(
  userId: string,
  event: E,
  properties: EventMap[E],
): Promise<void> {
  const posthog = getClient();
  if (posthog === null) return;

  posthog.capture({ distinctId: userId, event, properties });
  // Awaited so a serverless function cannot exit before the request leaves.
  await posthog.flush();
}

export async function shutdownAnalytics(): Promise<void> {
  await client?.shutdown();
  client = null;
}
