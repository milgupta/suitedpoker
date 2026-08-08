/**
 * The template names and their subject lines.
 *
 * Separate from `src/lib/email.ts` only because that module is `server-only` —
 * it holds the Resend client — and the subjects have to be readable from a
 * plain script too: `npm run emails:supabase` prints them beside the HTML it
 * generates, and a subject typed a second time there is a subject free to
 * drift. `src/lib/email.ts` re-exports all of this, so nothing else needs to
 * know the split exists.
 */

export type TransactionalTemplate =
  | "welcome"
  | "password_reset"
  | "verify_email"
  | "receipt"
  | "payment_failed"
  | "payment_failed_reminder"
  | "payment_failed_final"
  | "subscription_cancelled";

/** The whole set, so a test can enumerate them rather than trusting a list. */
export const TEMPLATES: readonly TransactionalTemplate[] = [
  "welcome",
  "password_reset",
  "verify_email",
  "receipt",
  "payment_failed",
  "payment_failed_reminder",
  "payment_failed_final",
  "subscription_cancelled",
];

const SUBJECTS: Record<TransactionalTemplate, string> = {
  welcome: "You're in — here's where to start",
  password_reset: "Reset your SuitedPoker password",
  verify_email: "Confirm your email",
  receipt: "Your SuitedPoker receipt",
  // No "ACTION REQUIRED", no urgency theatre. A calm subject on a real problem
  // gets opened; a shouted one gets filtered.
  payment_failed: "Your card was declined",
  payment_failed_reminder: "We still can't take payment",
  payment_failed_final: "Last one about this",
  subscription_cancelled: "Your subscription is cancelled",
};

export function subjectFor(template: TransactionalTemplate): string {
  return SUBJECTS[template];
}
