import { PAST_DUE_GRACE_DAYS } from "@/lib/entitlement-rule";

/**
 * The dunning schedule, pure.
 *
 * Driven entirely by `subscriptions.past_due_since` — the timestamp 7.4's
 * `invoice.payment_failed` handler stamps — and NEVER by a log of what was
 * already sent. A send log that fails to write once sends the same email
 * forever; a timestamp cannot drift from the thing it describes.
 *
 * The sequence stops the moment the status leaves past_due, which is what
 * "stop immediately if payment succeeds" actually means: there is no cancel
 * step, because the schedule is derived from a state that no longer holds.
 */

export type DunningStage = "immediate" | "reminder" | "final";

export const DUNNING_SCHEDULE: Record<DunningStage, number> = {
  /** Sent inline by the webhook, not by the cron. */
  immediate: 0,
  reminder: 3,
  final: 6,
};

export const DUNNING_TEMPLATES = {
  immediate: "payment_failed",
  reminder: "payment_failed_reminder",
  final: "payment_failed_final",
} as const;

export function daysSince(pastDueSince: Date, now: Date): number {
  return Math.floor((now.getTime() - pastDueSince.getTime()) / 86_400_000);
}

/**
 * Which email is due today, if any.
 *
 * Returns a stage only on the exact day it is due. The cron runs daily, so a
 * "day 3 or later" rule would re-send every day after the third — which is how
 * a dunning sequence becomes a spam complaint.
 */
export function stageDueOn(pastDueSince: Date | null, now: Date): DunningStage | null {
  if (pastDueSince === null) return null;

  const days = daysSince(pastDueSince, now);
  if (days === DUNNING_SCHEDULE.reminder) return "reminder";
  if (days === DUNNING_SCHEDULE.final) return "final";
  return null;
}

/**
 * When access actually ends.
 *
 * The final email states an exact date, and it has to be the SAME date the
 * entitlement rule enforces — telling someone access ends on the 9th and
 * cutting them off on the 8th is the kind of thing that becomes a chargeback.
 */
export function accessEndsAt(pastDueSince: Date): Date {
  return new Date(pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * An idempotency key that is stable for a given user, spell and stage.
 *
 * Two cron runs in the same minute — a redeploy, a manual trigger — must not
 * send the same email twice. Derived from data rather than from a timestamp, so
 * it is identical across runs.
 */
export function dunningIdempotencyKey(
  userId: string,
  pastDueSince: Date,
  stage: DunningStage,
): string {
  return `dunning:${userId}:${pastDueSince.toISOString().slice(0, 10)}:${stage}`;
}

export { PAST_DUE_GRACE_DAYS };
