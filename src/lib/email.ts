import "server-only";

import { render } from "@react-email/render";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env.server";
import { FROM_ADDRESS, REPLY_TO } from "@/emails/theme";
import {
  PasswordResetEmail,
  PaymentFailedEmail,
  PaymentFailedFinalEmail,
  PaymentFailedReminderEmail,
  ReceiptEmail,
  SubscriptionCancelledEmail,
  VerifyEmail,
  WelcomeEmail,
  type DunningProps,
  type ReceiptProps,
  type WelcomeProps,
} from "@/emails/templates";

/**
 * Transactional email.
 *
 * Every send is fire-and-forget from the caller's point of view: an email
 * provider outage must never fail a Stripe webhook or a cancellation. The
 * caller gets a boolean it is free to ignore.
 *
 * EVERY EMAIL SHIPS A PLAIN-TEXT PART. Without one, spam filters score the
 * message worse, and the clients that show text-only render a blank message —
 * which for a dunning email means a customer who never learns their card
 * failed.
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

export interface TemplateData {
  welcome: WelcomeProps;
  password_reset: { resetUrl: string };
  verify_email: { verifyUrl: string };
  receipt: ReceiptProps;
  payment_failed: DunningProps;
  payment_failed_reminder: DunningProps;
  payment_failed_final: DunningProps;
  subscription_cancelled: { accessEndsOn?: string | null };
}

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

function elementFor<T extends TransactionalTemplate>(
  template: T,
  data: TemplateData[T],
): React.ReactElement {
  switch (template) {
    case "welcome":
      return WelcomeEmail(data as WelcomeProps);
    case "password_reset":
      return PasswordResetEmail(data as { resetUrl: string });
    case "verify_email":
      return VerifyEmail(data as { verifyUrl: string });
    case "receipt":
      return ReceiptEmail(data as ReceiptProps);
    case "payment_failed":
      return PaymentFailedEmail(data as DunningProps);
    case "payment_failed_reminder":
      return PaymentFailedReminderEmail(data as DunningProps);
    case "payment_failed_final":
      return PaymentFailedFinalEmail(data as DunningProps);
    case "subscription_cancelled":
      return SubscriptionCancelledEmail(data as { accessEndsOn?: string | null });
    default: {
      // Exhaustiveness: a new template that is not wired up fails to compile
      // rather than sending a blank message.
      const never: never = template;
      throw new Error(`no email template for ${String(never)}`);
    }
  }
}

export interface Rendered {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export async function renderEmail<T extends TransactionalTemplate>(
  template: T,
  data: TemplateData[T],
): Promise<Rendered> {
  const element = elementFor(template, data);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  return { subject: SUBJECTS[template], html, text };
}

let client: Resend | null = null;

export function isEmailConfigured(): boolean {
  const key = serverEnv().RESEND_API_KEY;
  return typeof key === "string" && key !== "";
}

function getResend(): Resend {
  if (client !== null) return client;
  const key = serverEnv().RESEND_API_KEY;
  if (key === undefined || key === "") throw new Error("RESEND_API_KEY is not set.");
  client = new Resend(key);
  return client;
}

export interface SendOptions<T extends TransactionalTemplate> {
  readonly to: string;
  readonly template: T;
  readonly data: TemplateData[T];
  /**
   * Resend's own idempotency key. The dunning cron can run twice in a minute
   * on a redeploy, and a customer receiving the same "your card failed" email
   * twice reads it as a system that is broken as well as a card that is.
   */
  readonly idempotencyKey?: string;
}

export async function sendTransactional<T extends TransactionalTemplate>(
  options: SendOptions<T>,
): Promise<boolean> {
  let rendered: Rendered;
  try {
    rendered = await renderEmail(options.template, options.data);
  } catch (error) {
    console.error(`[email] render failed for ${options.template}: ${String(error)}`);
    return false;
  }

  if (!isEmailConfigured()) {
    console.info(`[email] ${options.template} → ${options.to} (not configured; not sent)`);
    return false;
  }

  try {
    const { error } = await getResend().emails.send(
      {
        from: FROM_ADDRESS,
        replyTo: REPLY_TO,
        to: options.to,
        subject: rendered.subject,
        html: rendered.html,
        // The plain-text part. Not optional.
        text: rendered.text,
      },
      options.idempotencyKey === undefined ? undefined : { idempotencyKey: options.idempotencyKey },
    );

    if (error !== null) {
      console.error(`[email] ${options.template} → ${options.to} failed: ${error.message}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[email] ${options.template} → ${options.to} threw: ${String(error)}`);
    return false;
  }
}
