/**
 * Sends one real transactional email, to prove Resend actually delivers.
 *
 * `tests/unit/emails.test.ts` renders all eight and reads them, which proves
 * the HTML is right and proves nothing about the account: a wrong API key, an
 * unverified sending domain, or a `from` address Resend refuses all render
 * perfectly and deliver nothing. Those failures are invisible until a customer
 * does not get their receipt.
 *
 *   npx tsx scripts/send-test-email.ts you@example.com
 *   npx tsx scripts/send-test-email.ts you@example.com receipt
 *
 * SENDS REAL MAIL to a real inbox. It exists to be run deliberately, by hand,
 * which is why it is not wired into `npm run verify`.
 *
 * It renders the templates directly rather than through `src/lib/email.ts`,
 * which is `server-only` and throws outside Next. The `from`, `replyTo` and
 * subject all come from the same modules the real path uses, so the only thing
 * duplicated here is the six-line Resend call.
 */

import { render } from "@react-email/render";
import { Resend } from "resend";
import { FROM_ADDRESS, REPLY_TO } from "../src/emails/theme";
import { subjectFor, TEMPLATES, type TransactionalTemplate } from "../src/emails/subjects";
import {
  PasswordResetEmail,
  PaymentFailedEmail,
  PaymentFailedFinalEmail,
  PaymentFailedReminderEmail,
  ReceiptEmail,
  SubscriptionCancelledEmail,
  VerifyEmail,
  WelcomeEmail,
} from "../src/emails/templates";
import { loadLocalEnv } from "../tests/support/load-local-env";

loadLocalEnv();

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://suitedpoker.com";

/**
 * Realistic sample data, not lorem.
 *
 * A test send with "Test User" and "$0.00" proves the pipe works and tells you
 * nothing about whether the email reads right in a real inbox — which is half
 * the reason to send one.
 */
const SAMPLES: Record<TransactionalTemplate, () => React.ReactElement> = {
  welcome: () =>
    WelcomeEmail({
      displayName: "Milan",
      leakLabel: "playing the wrong hands before the flop",
      leakBb100: 4.2,
      firstLessonTitle: "Which hands to play, and from where",
      firstLessonHref: `${SITE}/learn`,
    }),
  password_reset: () => PasswordResetEmail({ resetUrl: `${SITE}/reset?token=sample` }),
  verify_email: () => VerifyEmail({ verifyUrl: `${SITE}/auth/confirm?token=sample` }),
  receipt: () =>
    ReceiptEmail({
      amount: "$119.99",
      planLabel: "Yearly",
      invoiceUrl: `${SITE}/account`,
      nextBillingDate: "7 August 2027",
    }),
  payment_failed: () => PaymentFailedEmail({ amount: "$119.99", updateUrl: `${SITE}/account` }),
  payment_failed_reminder: () =>
    PaymentFailedReminderEmail({
      amount: "$119.99",
      updateUrl: `${SITE}/account`,
      streakDays: 12,
      rating: 1180,
      handsPlayed: 640,
    }),
  payment_failed_final: () =>
    PaymentFailedFinalEmail({
      amount: "$119.99",
      updateUrl: `${SITE}/account`,
      accessEndsOn: "14 August 2026",
    }),
  subscription_cancelled: () => SubscriptionCancelledEmail({ accessEndsOn: "7 September 2026" }),
};

async function main(): Promise<void> {
  const [to, requested = "welcome"] = process.argv.slice(2);

  if (to === undefined || !to.includes("@")) {
    console.error("Usage: npx tsx scripts/send-test-email.ts <address> [template]");
    console.error(`Templates: ${TEMPLATES.join(", ")}`);
    process.exit(1);
  }

  if (!TEMPLATES.includes(requested as TransactionalTemplate)) {
    console.error(`Unknown template "${requested}". One of: ${TEMPLATES.join(", ")}`);
    process.exit(1);
  }
  const template = requested as TransactionalTemplate;

  const key = process.env.RESEND_API_KEY ?? "";
  if (key === "") {
    console.error("RESEND_API_KEY is not set in .env.local — nothing would be sent.");
    process.exit(1);
  }

  const element = SAMPLES[template]();
  const html = await render(element);
  // The plain-text part is not optional: a mail client that refuses HTML, and
  // every spam filter, reads this one.
  const text = await render(element, { plainText: true });
  const subject = subjectFor(template);

  console.log(`  template   ${template}`);
  console.log(`  from       ${FROM_ADDRESS}`);
  console.log(`  reply-to   ${REPLY_TO}`);
  console.log(`  to         ${to}`);
  console.log(`  subject    ${subject}`);
  console.log(`  html       ${html.length} bytes`);
  console.log(`  text       ${text.length} bytes\n`);

  const { data, error } = await new Resend(key).emails.send({
    from: FROM_ADDRESS,
    replyTo: REPLY_TO,
    to,
    subject,
    html,
    text,
  });

  if (error !== null) {
    // Resend's own message names the real cause — an unverified domain, a
    // revoked key — and is far more useful than "send failed".
    console.error(`  FAILED: ${error.name} — ${error.message}`);
    process.exit(1);
  }

  console.log(`  SENT. Resend id ${data?.id ?? "(none returned)"}`);
}

void main();
