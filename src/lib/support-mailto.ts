import { SUPPORT_EMAIL } from "@/emails/theme";

/**
 * The mailto links behind the account page's support section.
 *
 * There is no ticketing system and deliberately so — at launch every user is a
 * paying subscriber and there are few of them, so the thing worth optimising is
 * a person replying, not aggregation. What a mailto CAN buy is triage: the two
 * kinds of mail arrive under different subjects, which is the cheap substitute
 * for the feature-request board this product does not need yet.
 */

export type SupportKind = "support" | "feature";

export interface SupportContext {
  readonly email: string;
  readonly userId: string;
  readonly planLabel: string | null;
}

const SUBJECTS: Record<SupportKind, string> = {
  support: "SuitedPoker support",
  feature: "SuitedPoker feature request",
};

/** Shown when someone has no subscription — never an empty field, which reads as a bug. */
const NO_PLAN = "No subscription";

/**
 * The details support would otherwise spend a round-trip asking for.
 *
 * They sit at the BOTTOM, under a rule. A mail client drops the cursor at the
 * start of the body, so leading with the account id makes someone scroll past
 * their own reference number to find where to type.
 */
function contextBlock(context: SupportContext): string {
  const lines = [
    "Account: " + context.email,
    "Plan: " + (context.planLabel ?? NO_PLAN),
    "Reference: " + context.userId,
  ];
  return "\n\n\n—\nSent from my account page — please keep the lines below:\n" + lines.join("\n");
}

export function supportMailto(kind: SupportKind, context: SupportContext): string {
  const subject = encodeURIComponent(SUBJECTS[kind]);
  const body = encodeURIComponent(contextBlock(context));
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export { SUPPORT_EMAIL };
