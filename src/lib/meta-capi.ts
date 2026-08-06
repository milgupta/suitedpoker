import "server-only";

/**
 * Meta Conversions API — the server side of the Pixel.
 *
 * STUB. 8.2 implements the transport; the call sites are written now because
 * the one event that matters most, Purchase, fires from a Stripe webhook where
 * no browser is present. Wiring that in later means editing the webhook, and
 * the webhook is the file you least want to reopen once money is flowing.
 *
 * A no-op here is deliberately silent: a missing pixel must never fail a
 * webhook. Ad attribution is worth less than a correctly recorded payment.
 */

export interface PurchaseEvent {
  readonly eventId: string;
  readonly userId: string;
  readonly email?: string;
  readonly valueUsd: number;
  readonly currency: string;
  readonly plan: string;
}

export async function sendPurchase(event: PurchaseEvent): Promise<void> {
  // `eventId` is the deduplication key against the browser-side Pixel event of
  // the same name. Both sides must send the SAME id or Meta counts one purchase
  // twice and every reported CAC is half of the real one.
  console.info(
    `[meta-capi] Purchase ${event.eventId} · ${event.plan} · ${event.valueUsd} ${event.currency} (stub — 8.2)`,
  );
  await Promise.resolve();
}
