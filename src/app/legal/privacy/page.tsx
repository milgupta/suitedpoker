export const metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: August 2026</p>

      <h2>What we collect</h2>
      <p>
        <strong>Account data</strong> — your email address and, if you provide one, a display name.
        <br />
        <strong>Onboarding answers</strong> — the responses you give when setting up your training
        plan, used to personalise what the product shows you.
        <br />
        <strong>Practice data</strong> — the decisions you make in drills, so we can track your
        progress and identify patterns in your play.
        <br />
        <strong>Usage data</strong> — pages visited and features used, to understand how the product
        is working.
      </p>

      <h2>What we do not collect</h2>
      <p>
        We do not collect payment card details. Payments are handled entirely by Stripe. We never
        see or store your card number.
      </p>

      <h2>How we use it</h2>
      <p>
        To operate your account, personalise your training, generate explanations of your decisions,
        process payments, send transactional email such as receipts and password resets, and improve
        the product.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Only the service providers needed to run SuitedPoker: <strong>Stripe</strong> (payments),
        <strong> Supabase</strong> (database and authentication), <strong>Vercel</strong> (hosting),
        <strong> Google</strong> (AI-generated explanations), <strong>Resend</strong> (email), and
        <strong> PostHog</strong> (product analytics). We do not sell your personal information.
      </p>

      <h2>AI processing</h2>
      <p>
        Explanations of your decisions are generated using Google&rsquo;s Gemini models. The context
        sent includes the poker situation and your choice. It does not include your name, email, or
        payment information.
      </p>

      <h2>Your rights</h2>
      <p>
        You may request a copy of your data, correct it, or delete your account and everything
        associated with it at any time. Email <strong>support@suitedpoker.com</strong> and we will
        action it within 30 days.
      </p>

      <h2>Retention</h2>
      <p>
        We keep your data while your account is active. If you delete your account, we remove your
        personal data within 30 days, except where we are required to retain records for tax or
        legal purposes.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies that are strictly necessary to keep you signed in, and analytics cookies to
        understand product usage.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: <strong>support@suitedpoker.com</strong>
      </p>

      <p className="text-text-tertiary text-caption pt-6">
        This document is a working draft and should be reviewed by a qualified attorney before
        commercial launch.
      </p>
    </>
  );
}
