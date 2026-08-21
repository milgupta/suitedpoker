import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { INCLUDED, PRICING_FAQ } from "@/content/pricing";
import {
  annualisedCents,
  formatUsd,
  perMonthCents,
  PLAN_IDS,
  PLANS,
  savingPercent,
  type PlanId,
} from "@/lib/stripe/plans";

export const metadata: Metadata = {
  // Short form with no em dash of its own — the root template prefixes
  // "Suited Poker — " to it.
  title: "Pricing",
  description:
    "One subscription, everything included. Monthly or yearly, cancel any time. No real-money play and nothing to win or lose.",
};

/**
 * The page the landing page used to be the bottom third of.
 *
 * Splitting it out is not only tidiness: /pricing is the URL an ad reviewer, a
 * payment-risk analyst and a comparison shopper each ask for by name, and a
 * `#pricing` anchor is not a page any of them can link to. Both products in
 * this category do the same thing.
 *
 * Prices are read from `PLANS`, never typed. A hardcoded figure here outlives
 * the price change that made it wrong, and the first person to notice is
 * someone at checkout looking at a different number.
 */
export default function PricingPage() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="ambient-host">
          <div
            aria-hidden
            className="ambient-blob ambient-blob--accent -top-52 left-1/2 z-0 -translate-x-1/2 opacity-70"
            style={{ position: "absolute" }}
          />

          <div className="mx-auto max-w-(--container-app) px-6 pt-16 pb-12 text-center">
            <p className="text-text-tertiary text-overline font-mono tracking-widest uppercase">
              Pricing
            </p>
            <h1 className="text-display-lg sm:text-display-xl mt-4 text-balance">
              One subscription. Everything in it.
            </h1>
            <p className="text-text-secondary text-body-lg mx-auto mt-5 max-w-xl text-pretty">
              No tiers to compare and nothing held back for an upgrade. Cancel from your account
              settings whenever you like.
            </p>
          </div>
        </section>

        {/* Yearly first, so the ribbon has a card to sit on. Derived from
            PLAN_IDS rather than typed out, so a third plan cannot silently fall
            off the page — the same rule the paywall follows. */}
        <section>
          <div className="mx-auto grid max-w-3xl gap-5 px-6 pb-4 sm:grid-cols-2">
            {CARD_ORDER.map((id) => (
              <PlanCard key={id} plan={id} />
            ))}
          </div>

          <p className="text-text-tertiary text-body-md mx-auto max-w-3xl px-6 pt-6 pb-16 text-center">
            Prices in USD. Subscriptions renew automatically until cancelled; you keep access until
            the end of the period you have paid for.
          </p>
        </section>

        <section className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-16">
            <h2 className="text-display-md">What is included</h2>
            <ul className="mt-8 grid gap-x-10 gap-y-3 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="text-text-secondary text-body-md flex gap-3">
                  <span aria-hidden className="text-accent-bright shrink-0">
                    ✓
                  </span>
                  <span className="text-pretty">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-16">
            <h2 className="text-display-md">Billing questions</h2>
            <dl className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
              {PRICING_FAQ.map((item) => (
                <div key={item.q}>
                  <dt className="text-heading-md">{item.q}</dt>
                  <dd className="text-text-secondary text-body-md mt-2 text-pretty">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-border border-t">
          <div className="mx-auto max-w-(--container-marketing) px-6 py-20 text-center">
            <h2 className="text-display-md text-balance">
              See where your game leaks before you decide.
            </h2>
            <p className="text-text-secondary text-body-lg mx-auto mt-5 max-w-lg text-pretty">
              Four questions and one real hand, then a read built from what you actually did. About
              a minute, and no card.
            </p>
            <Link
              href="/signup"
              data-cta="pricing"
              // NOT `.btn-accent`. The lit treatment is one per screen and on
              // this screen it belongs on the plan being recommended.
              className="bg-text-primary text-canvas text-body-lg mt-8 inline-flex min-h-12 items-center justify-center rounded-full px-7 font-semibold"
            >
              Find my biggest leak
            </Link>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: PRICING_FAQ.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            }),
          }}
        />
      </main>

      <SiteFooter />
    </>
  );
}

const CARD_ORDER: readonly PlanId[] = [...PLAN_IDS].sort((a) => (a === "annual" ? -1 : 1));

function PlanCard({ plan }: { plan: PlanId }) {
  const { label, amountCents, intervalLabel, billedLabel } = PLANS[plan];
  const isAnnual = plan === "annual";

  return (
    <div className="flex flex-col">
      {/* The ribbon states the saving as a NUMBER. "Best value" alone is a
          superlative every discount banner has already spent; the percentage is
          arithmetic against the two prices sitting next to each other. */}
      {isAnnual ? (
        <p className="bg-accent text-on-accent text-caption rounded-t-lg px-4 py-2 text-center font-semibold">
          Best value — save {savingPercent()}%
        </p>
      ) : (
        // A spacer of exactly the ribbon's height, so the two prices sit on the
        // same baseline. Without it the recommended card is pushed down by its
        // own ribbon and the pair reads as misaligned rather than as a pair.
        <p aria-hidden className="text-caption px-4 py-2 font-semibold opacity-0">
          &nbsp;
        </p>
      )}

      <div
        className={
          isAnnual
            ? // The ribbon supplies the top edge, so the card must not draw one.
              "border-accent bg-surface-1 flex flex-1 flex-col rounded-b-lg border-2 border-t-0 p-6"
            : "border-border bg-surface-1 flex flex-1 flex-col rounded-lg border p-6"
        }
      >
        <h2 className="text-heading-md">{label}</h2>

        <p className="text-display-lg mt-4 font-mono tabular-nums">{formatUsd(amountCents)}</p>
        <p className="text-text-secondary text-body-md mt-1">{intervalLabel}</p>

        <p className="border-border text-text-tertiary text-body-md mt-5 border-t pt-5">
          {isAnnual ? (
            <>
              {formatUsd(perMonthCents(plan))} a month, {billedLabel}. Paying monthly for a year is{" "}
              {formatUsd(annualisedCents("monthly"))}.
            </>
          ) : (
            <>Billed monthly. Cancel any time, from your account settings.</>
          )}
        </p>

        <Link
          href="/signup"
          data-cta={`plan-${plan}`}
          className={
            isAnnual
              ? "btn-accent text-body-md mt-6 inline-flex min-h-12 items-center justify-center rounded-full px-6"
              : "border-border text-text-primary hover:border-text-tertiary text-body-md mt-6 inline-flex min-h-12 items-center justify-center rounded-full border px-6 font-medium transition"
          }
        >
          Get started
        </Link>
      </div>
    </div>
  );
}
