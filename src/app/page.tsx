import Link from "next/link";
import { TrackView } from "@/components/track-view";
import { annualisedCents, formatUsd, PLANS, savingPercent } from "@/lib/stripe/plans";
import { methodologyFacts } from "@/lib/methodology-server";
import { provenanceHeadline } from "@/lib/methodology";

const FEATURES = [
  {
    title: "Real spots, not flashcards",
    body: "Every hand is a genuine situation you will face at the table — position, stack depth, and action history included.",
  },
  {
    title: "See the whole strategy",
    body: "Not just 'right' or 'wrong'. See how often a solver takes each action, and what choosing differently actually costs you.",
  },
  {
    title: "Graded on what it costs",
    body: "Poker is a distribution, not an answer key. Decisions are scored on expected value lost, so a reasonable line is never marked wrong.",
  },
  {
    title: "A coach that explains",
    body: "Ask why. Get a plain-English explanation of the spot, written for someone who does not already speak solver.",
  },
  {
    title: "A path, not a firehose",
    body: "A guided curriculum from preflop fundamentals through board texture and bet sizing, plus a daily challenge to keep the habit.",
  },
  {
    title: "Practise against real opponents",
    body: "Play full hands against opponent types you actually meet — the calling station, the nit, the maniac — then review what went wrong.",
  },
];

const FAQ = [
  {
    q: "Is this gambling?",
    a: "No. SuitedPoker is educational software. There is no wagering, no real money at stake, and nothing to win or lose. You practise decisions against precomputed strategy and get feedback on them.",
  },
  {
    q: "Do I need to know poker already?",
    a: "You need to know the rules and hand rankings. Everything after that — position, ranges, board texture, bet sizing — is what the curriculum teaches, starting from the beginning.",
  },
  {
    q: "What is a solver?",
    a: "A program that calculates the mathematically optimal way to play a poker situation. Professionals have used them for years. They are expensive and hard to read, which is the gap this fills.",
  },
  {
    q: "How much time does it take?",
    a: "Around ten minutes a day. The daily challenge is five hands and takes about three.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. It is built for mobile first and runs in the browser — nothing to install.",
  },
  {
    q: "Is this actually GTO?",
    a: "It is a simplified approximation of GTO, and we say so on the methodology page rather than hiding it. The range shapes follow published solver-derived output; the exact frequencies are our model. For learning why a hand mixes at all, that is the right level of precision. For the last fraction of a big blind in a specific river spot, it is not — and nothing at this price is.",
  },
  {
    q: "Will this work for my home game?",
    a: "Yes, and it is probably where it helps most. The strategy is built for 6-max at 100 big blinds, which is close to how a typical home game plays. The ideas — position, which hands to open, why you fold a good hand sometimes — transfer directly.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account settings. You keep access until the end of the period you have already paid for. See our refund policy in the Terms.",
  },
];

export default function Home() {
  const facts = methodologyFacts();

  // <main>, not <div>: without a main landmark a screen-reader user cannot skip
  // the header, which is the only navigation aid this page has. Caught by the
  // Lighthouse accessibility audit rather than by review.
  return (
    <main className="min-h-screen">
      <TrackView event="landing_viewed" properties={{}} />

      {/* SoftwareApplication, category EducationalApplication. The category is
          not decoration — it is the same claim the copy makes, in the format a
          crawler and an ad reviewer both read. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SuitedPoker",
            applicationCategory: "EducationalApplication",
            applicationSubCategory: "Game strategy training",
            operatingSystem: "Web, iOS, Android",
            description:
              "Poker strategy training for beginners. Practise real spots, see the full strategy, and understand why — no real-money play.",
            offers: [
              {
                "@type": "Offer",
                price: (PLANS.monthly.amountCents / 100).toFixed(2),
                priceCurrency: "USD",
                name: "Monthly",
              },
              {
                "@type": "Offer",
                price: (PLANS.annual.amountCents / 100).toFixed(2),
                priceCurrency: "USD",
                name: "Yearly",
              },
            ],
          }),
        }}
      />
      <header className="mx-auto flex max-w-(--container-app) items-center justify-between px-6 py-6">
        <span className="text-accent-bright text-body-md font-mono font-bold tracking-widest">
          SUITEDPOKER
        </span>
        <Link
          href="#pricing"
          className="text-text-secondary hover:text-text-primary text-body-md transition"
        >
          Pricing
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-(--container-app) px-6 pt-10 pb-20 sm:pt-20">
        <h1 className="text-display-lg sm:text-display-xl max-w-3xl">
          Stop guessing.
          <br />
          {/* --accent is 4.37 on canvas — AA for large text, which this is. Body-size
              accent text must use --accent-bright instead. */}
          <span className="text-accent">Start knowing.</span>
        </h1>
        <p className="text-text-secondary text-body-lg mt-6 max-w-xl">
          Learn exactly what a solver would do — explained in plain English, one hand at a time.
          Built for players who know the rules and are stuck on everything after that.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            data-cta="hero"
            className="bg-text-primary text-canvas text-body-lg inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3.5 font-semibold"
          >
            Find my biggest leak
          </Link>
          <Link
            href="#how"
            className="border-border text-text-secondary hover:border-text-tertiary hover:text-text-primary text-body-lg inline-flex items-center justify-center rounded-full border px-7 py-3.5 font-medium transition"
          >
            How it works
          </Link>
        </div>
      </section>

      {/* The problem */}
      <section id="how" className="border-border border-t">
        <div className="mx-auto max-w-(--container-app) px-6 py-20">
          <h2 className="text-display-md sm:text-display-lg">
            You know the rules. You still lose.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              [
                "Videos don't stick.",
                "You watch an hour of strategy and remember none of it at the table.",
              ],
              [
                "Charts are dead ends.",
                "A range chart tells you what. It never tells you why, so it never transfers.",
              ],
              [
                "Solvers are unreadable.",
                "The right answer exists, buried in a tool that costs a fortune and assumes a maths degree.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="border-border bg-surface-1 rounded-lg border p-5">
                <h3 className="font-semibold">{title}</h3>
                <p className="text-text-secondary text-body-md mt-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — three steps */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-(--container-app) px-6 py-20">
          <h2 className="text-display-md sm:text-display-lg">How it works</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              [
                "Answer a spot",
                "A real hand, with the position, the stacks and the action so far. You pick what you would do.",
              ],
              [
                "See the whole strategy",
                "Not a tick or a cross — the full mix. How often each action is taken, and what yours costs in big blinds.",
              ],
              [
                "Understand why",
                "A plain-English explanation of the idea behind it, written for someone who does not already speak solver.",
              ],
            ].map(([title, body], index) => (
              <li key={title} className="border-border bg-surface-1 rounded-lg border p-5">
                <span className="text-accent-bright text-body-sm font-mono">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-semibold">{title}</h3>
                <p className="text-text-secondary text-body-md mt-2">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The frequency bar — the differentiated idea, and the one nobody else
          explains to beginners. Static rather than interactive on purpose: this
          is the LCP region of a page every ad click pays for. */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-(--container-marketing) px-6 py-20">
          <h2 className="text-display-md sm:text-display-lg">
            Good players don&apos;t always do the same thing.
          </h2>
          <p className="text-text-secondary text-body-lg mt-6">
            Most training tools mark one action correct and the rest wrong. Real strategy is a mix —
            the same hand raises some of the time and folds the rest, on purpose, so it cannot be
            read.
          </p>

          <figure className="border-border bg-surface-1 mt-10 rounded-lg border p-5">
            <figcaption className="text-text-tertiary text-body-sm">
              AQo on the button, first in
            </figcaption>

            <div className="mt-4 flex h-10 w-full overflow-hidden rounded-md">
              <div className="bg-accent flex items-center justify-center" style={{ width: "62%" }}>
                <span className="text-on-accent text-body-sm font-semibold">Raise 62%</span>
              </div>
              <div
                className="bg-surface-2 flex items-center justify-center"
                style={{ width: "38%" }}
              >
                <span className="text-text-secondary text-body-sm font-semibold">Fold 38%</span>
              </div>
            </div>

            <p className="text-text-secondary text-body-md mt-4">
              Fold this hand and you have not made a mistake — you have made the less common of two
              reasonable plays, and the app tells you exactly what that costs. Learning{" "}
              <em>why both exist</em> is the thing that transfers to the table.
            </p>
          </figure>
        </div>
      </section>

      {/* Features */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-(--container-app) px-6 py-20">
          <h2 className="text-display-md sm:text-display-lg">What you get</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="border-border bg-surface-1 rounded-lg border p-5">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-text-secondary text-body-md mt-2">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-border border-t">
        <div className="mx-auto max-w-(--container-app) px-6 py-20">
          <h2 className="text-display-md sm:text-display-lg">Pricing</h2>
          <p className="text-text-secondary text-body-lg mt-3">
            One subscription. Everything included. Cancel any time.
          </p>
          <div className="mt-10 grid max-w-2xl gap-5 sm:grid-cols-2">
            <div className="border-accent bg-surface-1 rounded-lg border-2 p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-text-secondary text-body-md font-medium">Yearly</span>
                <span className="bg-accent text-on-accent text-overline rounded-full px-2.5 py-0.5 font-mono uppercase">
                  Best value
                </span>
              </div>
              <p className="text-display-lg mt-4 font-mono tabular-nums">
                {formatUsd(PLANS.annual.amountCents)}
              </p>
              <p className="text-text-secondary text-body-md mt-1">
                per year — {formatUsd(Math.round(PLANS.annual.amountCents / 12))} a month
              </p>
              <p className="border-border text-text-tertiary text-body-md mt-4 border-t pt-4">
                Save {savingPercent()}% versus paying monthly (
                {formatUsd(annualisedCents("monthly"))} a year).
              </p>
            </div>
            <div className="border-border bg-surface-1 rounded-lg border p-5">
              <span className="text-text-secondary text-body-md font-medium">Monthly</span>
              <p className="text-display-lg mt-4 font-mono tabular-nums">
                {formatUsd(PLANS.monthly.amountCents)}
              </p>
              <p className="text-text-secondary text-body-md mt-1">per month</p>
              <p className="border-border text-text-tertiary text-body-md mt-4 border-t pt-4">
                Cancel any time.
              </p>
            </div>
          </div>
          <p className="text-text-tertiary text-body-md mt-6 max-w-2xl">
            Subscriptions renew automatically until cancelled. You keep access until the end of the
            period you have paid for. Prices in USD.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-(--container-marketing) px-6 py-20">
          <h2 className="text-display-md sm:text-display-lg">Questions</h2>
          <dl className="mt-10 space-y-8">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold">{item.q}</dt>
                <dd className="text-text-secondary text-body-md mt-2">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Methodology — cheap to build, and the claim a competitor cannot answer. */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-(--container-marketing) px-6 py-20">
          <h2 className="text-display-md sm:text-display-lg">Where the strategy comes from</h2>
          <p className="text-text-secondary text-body-lg mt-6">{provenanceHeadline(facts)}</p>

          <dl className="border-border mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border">
            <div className="bg-surface-1 p-4">
              <dt className="text-text-tertiary text-body-sm">Game</dt>
              <dd className="text-heading-md mt-1">6-max, {facts.effStackBb}bb</dd>
            </div>
            <div className="bg-surface-1 p-4">
              <dt className="text-text-tertiary text-body-sm">Preflop spots</dt>
              <dd className="text-heading-md mt-1 tabular-nums">{facts.preflopNodes}</dd>
            </div>
            <div className="bg-surface-1 p-4">
              <dt className="text-text-tertiary text-body-sm">Postflop templates</dt>
              <dd className="text-heading-md mt-1 tabular-nums">{facts.postflopTemplates}</dd>
            </div>
          </dl>

          <p className="mt-6">
            <Link href="/methodology" className="text-accent-bright text-body-md underline">
              Read the full methodology →
            </Link>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-(--container-marketing) px-6 py-20 text-center">
          <h2 className="text-display-md sm:text-display-lg">Find out where your game leaks.</h2>
          <p className="text-text-secondary text-body-lg mx-auto mt-6 max-w-xl">
            Eight questions, then a read on your game built from your own answers. It takes about
            two minutes.
          </p>
          <Link
            href="/signup"
            data-cta="final"
            className="bg-text-primary text-canvas text-body-lg mt-10 inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3.5 font-semibold"
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
            // Built from FAQ itself, so the structured data cannot drift from
            // what the page actually says.
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />

      <footer className="border-border border-t">
        <div className="mx-auto max-w-(--container-app) px-6 py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-accent-bright text-body-md font-mono font-bold tracking-widest">
                SUITEDPOKER
              </p>
              <p className="text-text-secondary text-body-md mt-2">
                Educational software. Play money only. No real-money gambling.
              </p>
            </div>
            <div className="text-text-secondary text-body-md flex gap-6">
              <Link href="/methodology" className="hover:text-text-primary transition">
                Methodology
              </Link>
              <Link href="/legal/terms" className="hover:text-text-primary transition">
                Terms
              </Link>
              <Link href="/legal/privacy" className="hover:text-text-primary transition">
                Privacy
              </Link>
              <a
                href="mailto:support@suitedpoker.com"
                className="hover:text-text-primary transition"
              >
                Contact
              </a>
            </div>
          </div>
          <p className="text-text-tertiary text-caption mt-8">
            Questions or support: support@suitedpoker.com · © {new Date().getFullYear()} SuitedPoker
          </p>
        </div>
      </footer>
    </main>
  );
}
