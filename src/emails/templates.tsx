import { Link, Text } from "@react-email/components";
import { CtaButton, EmailLayout, Heading, Paragraph, StatRow } from "./layout";
import { email, link, SUPPORT_EMAIL, type } from "./theme";
import { rateFromBb100, RATE_LABEL } from "@/lib/units";

/**
 * The eight transactional emails.
 *
 * Every one is a real message with something specific in it. "Thanks for
 * subscribing!" is not an email, it is an apology for sending one — and the
 * dunning sequence in particular is worth real money only if it reads like a
 * person noticing a problem rather than a system issuing a notice.
 */

export interface WelcomeProps {
  displayName?: string | null;
  /** From the 7.2 diagnosis, so this is not a generic welcome. */
  leakLabel?: string | null;
  leakBb100?: number | null;
  firstLessonTitle?: string | null;
  firstLessonHref?: string | null;
}

export function WelcomeEmail({
  displayName,
  leakLabel,
  leakBb100,
  firstLessonTitle,
  firstLessonHref,
}: WelcomeProps) {
  const name = displayName == null || displayName === "" ? "" : `, ${displayName}`;
  const href = firstLessonHref ?? "/learn";

  return (
    <EmailLayout preview="Your first lesson is picked out. Twelve minutes a day is the whole ask.">
      <Heading>You&apos;re in{name}.</Heading>

      {leakLabel == null ? (
        <Paragraph>
          Everything is unlocked. The fastest way to start is the first lesson — it is short, and it
          ends with hands rather than a quiz.
        </Paragraph>
      ) : (
        <>
          <Paragraph>
            We already know where to start. Your quiz pointed at one leak above the others:
          </Paragraph>
          {/* bb/100, never dollars. A dollar figure attached to a poker result
              is an ad-account and compliance boundary, not a copy preference. */}
          <StatRow
            label="Your biggest leak"
            value={
              leakBb100 == null
                ? leakLabel
                : `${leakLabel} — costing ${rateFromBb100(leakBb100)} ${RATE_LABEL}`
            }
          />
          <Paragraph>That is what the first lesson is about.</Paragraph>
        </>
      )}

      <CtaButton href={link(href)}>
        {firstLessonTitle == null ? "Start the first lesson" : `Start: ${firstLessonTitle}`}
      </CtaButton>

      <Paragraph>
        One thing worth setting expectations on: <strong>twelve minutes a day</strong> beats two
        hours on a Sunday, every time. The rating moves when the reps are spaced out.
      </Paragraph>

      <Text style={{ ...type.small, color: email.textTertiary, margin: 0 }}>
        Reply to this email if anything is confusing. It reaches a person.
      </Text>
    </EmailLayout>
  );
}

export function PasswordResetEmail({ resetUrl }: { resetUrl: string }) {
  return (
    <EmailLayout
      preview="Reset your SuitedPoker password."
      footerNote="If you did not ask for this, you can ignore it — your password has not changed."
    >
      <Heading>Reset your password</Heading>
      <Paragraph>
        Click below and you can set a new one. The link works once, for an hour.
      </Paragraph>
      <CtaButton href={resetUrl}>Set a new password</CtaButton>
      <Text style={{ ...type.small, color: email.textTertiary, margin: 0, wordBreak: "break-all" }}>
        Or paste this into your browser: {resetUrl}
      </Text>
    </EmailLayout>
  );
}

export function VerifyEmail({ verifyUrl }: { verifyUrl: string }) {
  return (
    <EmailLayout preview="Confirm your email and your account is ready.">
      <Heading>Confirm your email</Heading>
      <Paragraph>One click and your account is ready.</Paragraph>
      <CtaButton href={verifyUrl}>Confirm my email</CtaButton>
      <Text style={{ ...type.small, color: email.textTertiary, margin: 0, wordBreak: "break-all" }}>
        Or paste this into your browser: {verifyUrl}
      </Text>
    </EmailLayout>
  );
}

export interface ReceiptProps {
  amount: string;
  planLabel: string;
  invoiceUrl?: string | null;
  nextBillingDate?: string | null;
}

export function ReceiptEmail({ amount, planLabel, invoiceUrl, nextBillingDate }: ReceiptProps) {
  return (
    <EmailLayout preview={`Receipt — ${amount} for SuitedPoker ${planLabel}.`}>
      <Heading>Receipt</Heading>
      <StatRow label="Plan" value={planLabel} />
      <StatRow label="Amount" value={amount} />
      {nextBillingDate != null && <StatRow label="Next billed" value={nextBillingDate} />}

      <Paragraph>
        Nothing to do — this is just for your records.
        {nextBillingDate == null ? "" : " You can cancel any time before the date above."}
      </Paragraph>

      {invoiceUrl != null && invoiceUrl !== "" && (
        <Text style={{ ...type.body, color: email.textSecondary, margin: 0 }}>
          <Link href={invoiceUrl} style={{ color: email.accentBright }}>
            View the full invoice
          </Link>
        </Text>
      )}
    </EmailLayout>
  );
}

export interface DunningProps {
  amount: string;
  updateUrl?: string;
  /** Real numbers from the account. Placeholders here would be a lie. */
  streakDays?: number | null;
  rating?: number | null;
  handsPlayed?: number | null;
  lessonsCompleted?: number | null;
  /** The exact day access ends, for the final email. */
  accessEndsOn?: string | null;
}

/**
 * Dunning #1, immediate.
 *
 * Calm, short, one button. A card declines for a hundred boring reasons and the
 * person on the other end has usually done nothing wrong — sounding like a
 * collections notice loses a customer who was about to fix it in ten seconds.
 */
export function PaymentFailedEmail({ amount, updateUrl }: DunningProps) {
  return (
    <EmailLayout
      preview="Your card was declined — updating it takes about ten seconds."
      footerNote="Your access is unaffected for now."
    >
      <Heading>Your card was declined</Heading>
      <Paragraph>
        The {amount} renewal did not go through. This is usually the bank rather than you — an
        expired card, or a routine block on a recurring charge.
      </Paragraph>
      <Paragraph>Nothing has changed on your account. Updating the card fixes it.</Paragraph>
      <CtaButton href={updateUrl ?? link("/account")}>Update my card</CtaButton>
    </EmailLayout>
  );
}

/**
 * Dunning #2, day three.
 *
 * This one names what is at stake, with the user's OWN numbers. A generic "you
 * will lose access" is ignorable; a streak they built over 40 days is not.
 */
export function PaymentFailedReminderEmail({
  amount,
  updateUrl,
  streakDays,
  rating,
  handsPlayed,
  lessonsCompleted,
}: DunningProps) {
  const hasStats =
    (streakDays ?? 0) > 0 ||
    (rating ?? 0) > 0 ||
    (handsPlayed ?? 0) > 0 ||
    (lessonsCompleted ?? 0) > 0;

  return (
    <EmailLayout preview="Still can't take payment — here is what is on the account.">
      <Heading>We still can&apos;t take payment</Heading>
      <Paragraph>
        The {amount} renewal has not gone through. Here is what is sitting on your account right
        now:
      </Paragraph>

      {hasStats ? (
        <>
          {(streakDays ?? 0) > 0 && <StatRow label="Current streak" value={`${streakDays} days`} />}
          {(rating ?? 0) > 0 && <StatRow label="Rating" value={String(rating)} />}
          {(handsPlayed ?? 0) > 0 && (
            <StatRow label="Hands played" value={(handsPlayed ?? 0).toLocaleString("en-US")} />
          )}
          {(lessonsCompleted ?? 0) > 0 && (
            <StatRow label="Lessons completed" value={String(lessonsCompleted)} />
          )}
        </>
      ) : (
        <Paragraph>
          You have only just started, which is exactly the wrong moment to stop.
        </Paragraph>
      )}

      <Paragraph>
        None of it is deleted if payment fails — but you will not be able to add to it.
      </Paragraph>
      <CtaButton href={updateUrl ?? link("/account")}>Update my card</CtaButton>
    </EmailLayout>
  );
}

/** Dunning #3, day six. States the exact date and then stops asking. */
export function PaymentFailedFinalEmail({ amount, updateUrl, accessEndsOn }: DunningProps) {
  return (
    <EmailLayout preview="Last one about this — access ends soon unless the card is updated.">
      <Heading>Last one about this</Heading>
      <Paragraph>
        We have not been able to take the {amount} renewal.{" "}
        {accessEndsOn == null ? "Access will end shortly." : `Access ends on ${accessEndsOn}.`}
      </Paragraph>
      <Paragraph>
        Your rating, your streak and every hand you have played stay exactly where they are. If you
        come back, you pick up from there rather than starting over.
      </Paragraph>
      <CtaButton href={updateUrl ?? link("/account")}>Update my card</CtaButton>
      <Text style={{ ...type.small, color: email.textTertiary, margin: 0 }}>
        This is the last email we will send about it. If something else is going on, reply — it
        reaches a person at {SUPPORT_EMAIL}.
      </Text>
    </EmailLayout>
  );
}

export function SubscriptionCancelledEmail({ accessEndsOn }: { accessEndsOn?: string | null }) {
  return (
    <EmailLayout preview="Cancelled. You keep access until the end of the period.">
      <Heading>That&apos;s cancelled</Heading>
      <Paragraph>
        {accessEndsOn == null
          ? "You keep full access until the end of your current period."
          : `You keep full access until ${accessEndsOn}. Nothing is charged after that.`}
      </Paragraph>
      <Paragraph>
        Your rating, streak and hand history stay put. If you come back, everything is where you
        left it.
      </Paragraph>
      <Paragraph>
        If something specific pushed you out, we would genuinely like to know — reply to this and it
        reaches a person.
      </Paragraph>
    </EmailLayout>
  );
}
