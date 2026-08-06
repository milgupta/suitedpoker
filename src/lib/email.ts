import "server-only";

/**
 * Transactional email.
 *
 * STUB. 8.3 implements the Resend transport and the templates. As with the CAPI
 * stub, the call sites land now because they live inside the Stripe webhook,
 * and a dunning email that is not sent is a subscription that is not recovered.
 *
 * Every function here is fire-and-forget from the caller's point of view: an
 * email provider outage must never fail a webhook.
 */

export type TransactionalTemplate =
  "payment_failed" | "subscription_cancelled" | "welcome" | "receipt";

export interface TransactionalEmail {
  readonly to: string;
  readonly template: TransactionalTemplate;
  readonly data: Readonly<Record<string, string | number>>;
}

export async function sendTransactional(email: TransactionalEmail): Promise<void> {
  console.info(`[email] ${email.template} → ${email.to} (stub — 8.3)`);
  await Promise.resolve();
}
