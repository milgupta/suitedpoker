import "server-only";

import { createHash } from "node:crypto";
import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { getRedis } from "@/lib/redis";
import {
  isValidEventTime,
  normaliseForHash,
  purchaseEventId,
  type Attribution,
  type MetaEvent,
  type MetaEventName,
  type UserData,
} from "@/lib/meta";

/**
 * Meta Conversions API — the server side of the pixel.
 *
 * A dropped Purchase is not a missing log line. Meta's optimiser learns from
 * conversions, so an event that never arrives permanently mis-trains the ad
 * account against the audience that actually bought. That is why a failure here
 * goes on a retry queue rather than into a console.error.
 */

const GRAPH_VERSION = "v21.0";

export function isCapiConfigured(): boolean {
  const pixelId = clientEnv.NEXT_PUBLIC_META_PIXEL_ID;
  const token = serverEnv().META_CAPI_ACCESS_TOKEN;
  return typeof pixelId === "string" && pixelId !== "" && typeof token === "string" && token !== "";
}

/** SHA-256 of the value after Meta's normalisation. */
export function hashPii(value: string): string {
  return createHash("sha256").update(normaliseForHash(value)).digest("hex");
}

export function buildUserData(input: {
  email?: string | null;
  attribution?: Partial<Attribution> | null;
  ip?: string | null;
  userAgent?: string | null;
}): UserData {
  const data: UserData = {};

  // Hashed, never raw. Meta rejects unhashed email, and sending one would be a
  // plaintext PII disclosure to a third party.
  if (typeof input.email === "string" && input.email !== "") {
    data.em = [hashPii(input.email)];
  }

  // fbp and fbc are NOT hashed — Meta matches them verbatim, and hashing them
  // silently produces a payload that is accepted and matches nothing.
  const fbp = input.attribution?.fbp;
  if (typeof fbp === "string" && fbp !== "") data.fbp = fbp;

  const fbc = input.attribution?.fbc;
  if (typeof fbc === "string" && fbc !== "") data.fbc = fbc;

  if (typeof input.ip === "string" && input.ip !== "") data.client_ip_address = input.ip;
  if (typeof input.userAgent === "string" && input.userAgent !== "") {
    data.client_user_agent = input.userAgent;
  }

  return data;
}

export interface SendOptions {
  readonly eventName: MetaEventName;
  readonly eventId: string;
  readonly userData: UserData;
  readonly sourceUrl?: string;
  readonly customData?: Record<string, string | number>;
  readonly actionSource?: MetaEvent["action_source"];
  readonly nowMs?: number;
}

export function buildEvent(options: SendOptions): MetaEvent {
  const nowMs = options.nowMs ?? Date.now();
  return {
    event_name: options.eventName,
    // SECONDS. Meta silently rejects milliseconds, and the failure looks like
    // "no events received" rather than "bad timestamp".
    event_time: Math.floor(nowMs / 1000),
    event_id: options.eventId,
    event_source_url: options.sourceUrl,
    action_source: options.actionSource ?? "website",
    user_data: options.userData,
    custom_data: options.customData,
  };
}

/* ── the retry queue ─────────────────────────────────────────────────────── */

const QUEUE_KEY = "meta:capi:retry";
const QUEUE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_ATTEMPTS = 4;

interface QueuedEvent {
  readonly event: MetaEvent;
  readonly attempts: number;
}

/**
 * Backoff between attempts, in ms: 1s, 4s, 16s.
 *
 * The first retry covers a transient network blip; the later ones cover a Meta
 * outage. Beyond that the event goes on the durable queue for the cron rather
 * than holding a request open.
 */
export function backoffMs(attempt: number): number {
  return 1000 * 4 ** (attempt - 1);
}

async function enqueue(event: MetaEvent): Promise<void> {
  try {
    const redis = getRedis();
    const raw = await redis.get(QUEUE_KEY);
    const queue: QueuedEvent[] = raw === null ? [] : (JSON.parse(raw) as QueuedEvent[]);
    // Bounded: a sustained Meta outage must not turn into an unbounded value.
    queue.push({ event, attempts: 0 });
    await redis.set(QUEUE_KEY, JSON.stringify(queue.slice(-500)), QUEUE_TTL_SECONDS);
    console.warn(`[meta-capi] queued ${event.event_name} ${event.event_id} for retry`);
  } catch {
    // The queue itself is best-effort. Nothing here may throw into a webhook.
  }
}

export async function queuedEvents(): Promise<QueuedEvent[]> {
  try {
    const raw = await getRedis().get(QUEUE_KEY);
    return raw === null ? [] : (JSON.parse(raw) as QueuedEvent[]);
  } catch {
    return [];
  }
}

export async function clearQueue(): Promise<void> {
  await getRedis().del(QUEUE_KEY);
}

/* ── sending ─────────────────────────────────────────────────────────────── */

export interface SendResult {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly attempts: number;
  readonly queued: boolean;
}

async function postOnce(event: MetaEvent): Promise<{ ok: boolean; reason: string | null }> {
  const pixelId = clientEnv.NEXT_PUBLIC_META_PIXEL_ID ?? "";
  const token = serverEnv().META_CAPI_ACCESS_TOKEN ?? "";
  const testCode = process.env.META_TEST_EVENT_CODE;

  const body: Record<string, unknown> = { data: [event] };
  // Routes the event to Meta's Test Events panel instead of production
  // reporting. Present only when the env var is set, so it cannot leak into a
  // real run by being forgotten in code.
  if (typeof testCode === "string" && testCode !== "") body.test_event_code = testCode;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (response.ok) return { ok: true, reason: null };

    const text = await response.text().catch(() => "");
    // A 4xx will not succeed on a retry — a malformed payload stays malformed.
    // Only 5xx and network errors are worth queueing.
    return { ok: false, reason: `${response.status}:${text.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, reason: `network:${error instanceof Error ? error.message : "unknown"}` };
  }
}

function retryable(reason: string | null): boolean {
  if (reason === null) return false;
  if (reason.startsWith("network:")) return true;
  const status = Number(reason.split(":")[0]);
  return !Number.isFinite(status) || status >= 500 || status === 429;
}

export async function sendEvent(
  options: SendOptions & { sleep?: (ms: number) => Promise<void> },
): Promise<SendResult> {
  if (!isCapiConfigured()) {
    return { ok: false, reason: "not_configured", attempts: 0, queued: false };
  }

  const event = buildEvent(options);
  if (!isValidEventTime(event.event_time, options.nowMs ?? Date.now())) {
    return { ok: false, reason: "stale_event_time", attempts: 0, queued: false };
  }

  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let reason: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await postOnce(event);
    if (result.ok) return { ok: true, reason: null, attempts: attempt, queued: false };

    reason = result.reason;
    if (!retryable(reason)) break;
    if (attempt < 3) await sleep(backoffMs(attempt));
  }

  // Queued rather than dropped. A lost Purchase permanently mis-optimises the
  // ad account, which costs far more than a delayed one.
  if (retryable(reason)) {
    await enqueue(event);
    return { ok: false, reason, attempts: 3, queued: true };
  }

  console.error(`[meta-capi] ${event.event_name} ${event.event_id} failed: ${reason}`);
  return { ok: false, reason, attempts: 1, queued: false };
}

/** Drains the retry queue. Called by a cron. */
export async function drainQueue(now: Date = new Date()): Promise<{ sent: number; kept: number }> {
  void now;
  const queue = await queuedEvents();
  if (queue.length === 0) return { sent: 0, kept: 0 };

  const keep: QueuedEvent[] = [];
  let sent = 0;

  for (const item of queue) {
    // An event Meta will no longer accept is dropped rather than retried
    // forever — it is already lost, and keeping it starves the live ones.
    if (!isValidEventTime(item.event.event_time, Date.now())) continue;

    const result = await postOnce(item.event);
    if (result.ok) {
      sent += 1;
      continue;
    }

    const attempts = item.attempts + 1;
    if (attempts < MAX_ATTEMPTS && retryable(result.reason)) {
      keep.push({ event: item.event, attempts });
    } else {
      console.error(
        `[meta-capi] giving up on ${item.event.event_name} ${item.event.event_id} after ${attempts}`,
      );
    }
  }

  try {
    if (keep.length === 0) await getRedis().del(QUEUE_KEY);
    else await getRedis().set(QUEUE_KEY, JSON.stringify(keep), QUEUE_TTL_SECONDS);
  } catch {
    // Best-effort.
  }

  return { sent, kept: keep.length };
}

/* ── the call the webhook makes ──────────────────────────────────────────── */

export interface PurchaseEvent {
  readonly eventId: string;
  readonly userId: string;
  readonly email?: string;
  readonly valueUsd: number;
  readonly currency: string;
  readonly plan: string;
  readonly attribution?: Partial<Attribution> | null;
  readonly sourceUrl?: string;
}

export async function sendPurchase(event: PurchaseEvent): Promise<SendResult> {
  return sendEvent({
    eventName: "Purchase",
    eventId: event.eventId,
    userData: buildUserData({ email: event.email, attribution: event.attribution }),
    sourceUrl: event.sourceUrl,
    customData: {
      // Must match the Stripe amount EXACTLY. A rounded value here makes every
      // ROAS figure in Ads Manager quietly wrong.
      value: event.valueUsd,
      currency: event.currency,
      content_name: event.plan,
    },
    // No browser in a webhook.
    actionSource: "system_generated",
  });
}

export { purchaseEventId };
