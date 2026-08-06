import { DISCLAIMER } from "@/lib/compliance";

/**
 * The line an ad reviewer and a payment-risk analyst both look for.
 *
 * Rendered on the PUBLIC surface — marketing, auth, legal, the unavailable
 * page — and on /paywall, which is the payment screen a Stripe reviewer would
 * actually reach. Not in the root layout, which was where it started: the
 * onboarding quiz is sized to fill exactly one viewport
 * (`100dvh - 2*var(--app-shell-py)`), and an extra paragraph after it pushed
 * every question 56px into a scroll.
 *
 * Nothing behind the login needs it. Nobody reviewing this product for ad or
 * payment eligibility has an account.
 */
export function ComplianceFooter({ className }: { className?: string }) {
  return (
    <p className={`text-text-tertiary text-caption px-4 pb-6 text-center ${className ?? ""}`}>
      {DISCLAIMER}
    </p>
  );
}
