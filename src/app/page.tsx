import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { TrackView } from "@/components/track-view";
import { AppFrame } from "@/components/marketing/AppFrame";
import { DecisionShowcase } from "@/components/marketing/DecisionShowcase";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { TestimonialCarousel } from "@/components/marketing/TestimonialCarousel";
import {
  FAQ,
  FEATURES,
  FINAL_CTA,
  HERO,
  HERO_PROOF,
  PROBLEM,
  SECTION_CTAS,
} from "@/content/landing";
import { landingShowcase } from "@/lib/landing-showcase-server";
import { provenanceHeadline } from "@/lib/methodology";
import { methodologyFacts } from "@/lib/methodology-server";
import { PLANS } from "@/lib/stripe/plans";
import { amountFromBb } from "@/lib/units";

/**
 * THE LANDING PAGE.
 *
 * Two decisions shape everything below.
 *
 * 1. **No prices.** They live on /pricing, which is what both products in this
 *    category do. A price on the front page is a number to react to before
 *    there is anything to weigh it against, and this product's whole argument
 *    — that it shows you the real strategy rather than an answer key — takes a
 *    screenful to make.
 *
 * 2. **The product is rendered, not photographed.** The frequency bar and the
 *    range grid on this page are the components the app grades with, fed the
 *    shipped solution node. That is the difference between a page that claims
 *    to show real strategy and one that does.
 *
 * The scan in `tests/e2e/landing.spec.ts` reads the RENDERED text of this page.
 * Copy lives in `src/content/landing.ts` so it can be read in one place.
 */
export default function Home() {
  const facts = methodologyFacts();
  const showcase = landingShowcase();

  return (
    <>
      <SiteHeader />

      <main>
        <TrackView event="landing_viewed" properties={{}} />

        {/* SoftwareApplication, category EducationalApplication. The category is
            not decoration — it is the same claim the copy makes, in the format a
            crawler and an ad reviewer both read. The offers stay here even
            though no price is visible: structured data is where a crawler looks
            for one, and /pricing is one click away. */}
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
                  url: "https://suitedpoker.com/pricing",
                },
                {
                  "@type": "Offer",
                  price: (PLANS.annual.amountCents / 100).toFixed(2),
                  priceCurrency: "USD",
                  name: "Yearly",
                  url: "https://suitedpoker.com/pricing",
                },
              ],
            }),
          }}
        />

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="ambient-host">
          {/* z-0, not the class's own z-index: `.ambient-blob` carries
              `z-index: -1`, which inside an isolated host hides it behind the
              host's background entirely. The utility wins over the layer. */}
          <div
            aria-hidden
            className="ambient-blob -top-40 -left-40 z-0 opacity-60"
            style={{ position: "absolute" }}
          />
          <div
            aria-hidden
            className="ambient-blob ambient-blob--accent top-10 -right-60 z-0 opacity-70"
            style={{ position: "absolute" }}
          />

          <div className="mx-auto grid max-w-(--container-app) gap-12 px-6 pt-12 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:pb-24">
            <div>
              <p className="text-text-tertiary text-overline font-mono tracking-widest uppercase">
                {HERO.eyebrow}
              </p>

              <h1 className="text-display-lg sm:text-display-xl mt-4 text-balance">
                {HERO.title}
                <br />
                {/* --accent is 4.37 on canvas — AA for large text, which this
                    is. Body-size accent text must use --accent-bright. */}
                <span className="text-accent">{HERO.titleAccent}</span>
              </h1>

              <p className="text-text-secondary text-body-lg mt-5 max-w-lg text-pretty">
                {HERO.body}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* The one lit button on the page. DESIGN.md 5.2: this
                    treatment is reserved for a single primary action. */}
                <Link
                  href="/signup"
                  data-cta="hero"
                  className="btn-accent text-body-lg inline-flex min-h-12 items-center justify-center rounded-full px-7"
                >
                  {HERO.cta}
                </Link>
                <Link
                  href="#how"
                  className="text-text-secondary hover:text-text-primary text-body-lg inline-flex min-h-12 items-center justify-center px-2 font-medium transition"
                >
                  {HERO.secondary} →
                </Link>
              </div>

              <ul className="text-text-tertiary text-caption mt-8 flex flex-wrap gap-x-5 gap-y-2">
                {HERO_PROOF.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <span aria-hidden className="text-accent-bright">
                      ✓
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* Below the CTA in DOM order on a phone, beside it on a wide
                screen. The e2e asserts the CTA clears 844px at 390px wide, and
                DOM order is what decides that. */}
            <AppFrame label="suitedpoker.com/arena">
              <DecisionShowcase showcase={showcase} />
            </AppFrame>
          </div>
        </section>

        {/* ── The problem ──────────────────────────────────────────────────── */}
        <section id="problem" className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-20">
            <h2 className="text-display-md sm:text-display-lg max-w-2xl text-balance">
              You know the rules. You still lose.
            </h2>

            {/* Hairline rows, not a row of three cards. The page already has
                two heavy panels; a third grid of boxes here is what makes a
                site read as one template repeated. */}
            <dl className="border-border mt-10 border-t">
              {PROBLEM.map((point, index) => (
                // A <div> inside a <dl> may contain ONLY <dt> and <dd>. The
                // index started as a sibling <span> here, which axe reports as
                // a serious `definition-list` violation, so it lives inside the
                // term it numbers.
                <div
                  key={point.title}
                  className="border-border grid gap-2 border-b py-6 sm:grid-cols-[20rem_1fr] sm:items-baseline sm:gap-6"
                >
                  <dt className="text-heading-lg flex items-baseline gap-4">
                    <span className="text-text-tertiary text-body-sm w-6 shrink-0 font-mono tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {point.title}
                  </dt>
                  <dd className="text-text-secondary text-body-lg text-pretty">{point.body}</dd>
                </div>
              ))}
            </dl>

            {/* Bordered, not lit — the one `.btn-accent` on this page is the
                hero's, and the white fill is the final CTA's weight. */}
            <Link
              href="/signup"
              data-cta="problem"
              className="border-border text-text-primary hover:border-text-tertiary text-body-lg mt-8 inline-flex min-h-12 items-center justify-center rounded-full border px-7 font-medium transition"
            >
              {SECTION_CTAS.problem}
            </Link>
          </div>
        </section>

        {/* ── How it works. One hand, three screens — rendered, not photographed. */}
        <HowItWorks showcase={showcase} />

        {/* After the loop is clear, social proof — not in the first viewport. */}
        <TestimonialCarousel />

        {/* ── What you get ─────────────────────────────────────────────────── */}
        <section className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-20">
            <h2 className="text-display-md sm:text-display-lg">What you get</h2>

            <dl className="border-border mt-10 grid border-t sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="border-border border-b py-6 sm:pe-10">
                  <dt className="text-heading-md">{feature.title}</dt>
                  <dd className="text-text-secondary text-body-md mt-2 max-w-md text-pretty">
                    {feature.body}
                  </dd>
                </div>
              ))}
            </dl>

            <Link
              href="/signup"
              data-cta="features"
              className="border-border text-text-primary hover:border-text-tertiary text-body-lg mt-8 inline-flex min-h-12 items-center justify-center rounded-full border px-7 font-medium transition"
            >
              {SECTION_CTAS.features}
            </Link>
          </div>
        </section>

        {/* ── Provenance. Cheap to build, and the claim a competitor cannot
             answer without doing the work. ──────────────────────────────────── */}
        <section className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-20">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
              <div>
                <p className="text-text-tertiary text-overline font-mono tracking-widest uppercase">
                  Provenance
                </p>
                <h2 className="text-display-md mt-4 text-balance">Where the strategy comes from</h2>
                <p className="text-text-secondary text-body-lg mt-6 text-pretty">
                  {provenanceHeadline(facts)}
                </p>
                {/* No link out to /methodology. The paragraph above IS the
                    disclosure; sending someone to a long read from here was
                    pulling them out of the funnel two sections before pricing. */}
              </div>

              <dl className="border-border grid grid-cols-3 gap-px overflow-hidden rounded-lg border">
                <Fact label="Game" value={`6-max, ${amountFromBb(facts.effStackBb)}`} />
                <Fact label="Preflop spots" value={String(facts.preflopNodes)} />
                <Fact label="Postflop templates" value={String(facts.postflopTemplates)} />
              </dl>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-20">
            <h2 className="text-display-md sm:text-display-lg">Questions</h2>

            {/* An accordion, with ONE exception that is not cosmetic.

                `bodyText()` in the landing spec reads `innerText`, which does
                not include the contents of a closed <details>. Collapse the
                gambling answer and the rendered page shows "Is this gambling?"
                with no denial anywhere near it — which is both a failing test
                and, far worse, exactly what a Meta reviewer would see. So the
                first item ships open. Everything after it collapses.

                Native <details>, not the Radix accordion: this keeps the page a
                server component, and a marketing page should not ship a
                JavaScript bundle to open a paragraph. */}
            <div className="mt-10 max-w-3xl">
              {FAQ.map((item, index) => (
                <details
                  key={item.q}
                  open={index === 0 || item.openByDefault === true}
                  className="group border-border border-b"
                  data-faq
                >
                  <summary className="text-heading-md flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 py-5 marker:content-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="text-text-secondary size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <p className="text-text-secondary text-body-md pb-5 text-pretty">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="border-border ambient-host border-t">
          <div
            aria-hidden
            className="ambient-blob ambient-blob--accent -bottom-60 left-1/2 z-0 -translate-x-1/2 opacity-70"
            style={{ position: "absolute" }}
          />
          <div className="mx-auto max-w-(--container-marketing) px-6 py-24 text-center">
            <h2 className="text-display-md sm:text-display-lg text-balance">{FINAL_CTA.title}</h2>
            <p className="text-text-secondary text-body-lg mx-auto mt-6 max-w-xl text-pretty">
              {FINAL_CTA.body}
            </p>
            <Link
              href="/signup"
              data-cta="final"
              className="bg-text-primary text-canvas text-body-lg mt-10 inline-flex min-h-12 items-center justify-center rounded-full px-7 font-semibold"
            >
              {FINAL_CTA.cta}
            </Link>
            <p className="text-text-tertiary text-body-md mt-4">
              <Link href="/pricing" className="underline underline-offset-4">
                See pricing
              </Link>
            </p>
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
      </main>

      <SiteFooter />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-1 p-4">
      <dt className="text-text-tertiary text-body-sm">{label}</dt>
      <dd className="text-heading-md mt-1 tabular-nums">{value}</dd>
    </div>
  );
}
