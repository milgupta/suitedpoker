export const metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: August 2026</p>

      <h2>What SuitedPoker is</h2>
      <p>
        SuitedPoker is <strong>educational software</strong> for learning poker strategy. It is not
        a gambling service. There is no wagering, no real-money play, no deposits or withdrawals,
        and nothing of monetary value can be won or lost through the service. All play within the
        product uses play-money chips for instructional purposes only.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 18 years old to use SuitedPoker. The service is intended for
        jurisdictions where poker training software is lawful; you are responsible for compliance
        with the laws that apply to you.
      </p>

      <h2>Subscriptions and billing</h2>
      <p>
        Access is sold as a subscription, billed monthly at $39.99 USD or annually at $149.99 USD.
        Subscriptions renew automatically at the end of each billing period until cancelled.
        Payments are processed by Stripe; we do not store your card details.
      </p>

      <h2>Cancellation and refunds</h2>
      <p>
        You may cancel at any time from your account settings. Cancellation takes effect at the end
        of the current billing period, and you retain full access until that date. If SuitedPoker is
        not what you expected, contact <strong>support@suitedpoker.com</strong> within 7 days of a
        charge and we will refund it, no questions asked.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Your account is for your personal use. Do not share credentials, resell access, scrape or
        redistribute the strategy content, or attempt to circumvent access controls.
      </p>

      <h2>No guarantee of results</h2>
      <p>
        SuitedPoker teaches strategy. It does not promise, predict, or guarantee any financial
        outcome. Nothing in the service is financial advice, and we make no representation that
        using it will produce any particular result at a poker table.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We aim for continuous availability but do not guarantee uninterrupted service. We may modify
        or discontinue features, and will give reasonable notice of material changes to these terms
        or to pricing.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, SuitedPoker&rsquo;s total liability arising from
        your use of the service is limited to the amount you paid in the twelve months preceding the
        claim.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <strong>support@suitedpoker.com</strong>
      </p>

      <p className="text-text-tertiary pt-6 text-xs">
        This document is a working draft and should be reviewed by a qualified attorney before
        commercial launch.
      </p>
    </>
  );
}
