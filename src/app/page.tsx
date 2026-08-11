import Link from "next/link";
import { TrackView } from "@/components/track-view";
import { AppFrame } from "@/components/marketing/AppFrame";
import { DecisionShowcase } from "@/components/marketing/DecisionShowcase";
import { RangeShowcase } from "@/components/marketing/RangeShowcase";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { landingShowcase } from "@/lib/landing-showcase-server";
import { methodologyFacts } from "@/lib/methodology-server";
import { provenanceHeadline } from "@/lib/methodology";
import { PLANS } from "@/lib/stripe/plans";
import { FAQ, FEATURES, FINAL_CTA, HERO, HERO_PROOF, MIX, PROBLEM, STEPS } from "@/content/landing";
import { TestimonialCarousel } from "@/components/marketing/TestimonialCarousel";

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

              <p className="text-text-tertiary text-body-md mt-4">{HERO.ctaNote}</p>

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
          </div>
        </section>

        {/* ── The idea, with the whole range behind it ─────────────────────── */}
        <section id="mix" className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <p className="text-accent-bright text-overline font-mono tracking-widest uppercase">
                  {MIX.eyebrow}
                </p>
                <h2 className="text-display-md sm:text-display-lg mt-4 text-balance">
                  {MIX.title}
                </h2>
                <p className="text-text-secondary text-body-lg mt-6 text-pretty">{MIX.body}</p>
                <p className="text-text-secondary text-body-lg mt-4 text-pretty">{MIX.closing}</p>
              </div>

              <div>
                <AppFrame label="suitedpoker.com/ranges">
                  <RangeShowcase showcase={showcase} />
                </AppFrame>
                <p className="text-text-tertiary text-body-md mt-4">{MIX.gridCaption}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how" className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-20">
            <h2 className="text-display-md sm:text-display-lg">How it works</h2>

            <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-5">
                  {/*
                   * Fixed height, not intrinsic aspect — same reason as the
                   * features page. Phone captures are tall; sizing from the
                   * image would make each column a different height and the
                   * section lurch as they load.
                   */}
                  <div className="border-border bg-surface-1 overflow-hidden rounded-lg border">
                    <picture>
                      <source srcSet={`/screenshots/${step.shot}.avif`} type="image/avif" />
                      <source srcSet={`/screenshots/${step.shot}.webp`} type="image/webp" />
                      <img
                        src={`/screenshots/${step.shot}.png`}
                        alt={step.alt}
                        width={780}
                        height={1688}
                        loading="lazy"
                        decoding="async"
                        className="h-56 w-full object-cover sm:h-64"
                        style={
                          step.objectPosition ? { objectPosition: step.objectPosition } : undefined
                        }
                      />
                    </picture>
                  </div>
                  <div className="hairline-top pt-5">
                    <span className="text-text-tertiary text-body-sm font-mono tabular-nums">
                      Step {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-heading-lg mt-3">{step.title}</h3>
                    <p className="text-text-secondary text-body-md mt-3 text-pretty">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

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
                <Fact label="Game" value={`6-max, ${facts.effStackBb}bb`} />
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

            {/* Open, never an accordion. The ad-account scan reads rendered
                text, and collapsed answers are not in it — the "is this
                gambling?" denial is the single most important sentence on the
                page for ad review, and it has to be visible to be counted. */}
            <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <dt className="text-heading-md">{item.q}</dt>
                  <dd className="text-text-secondary text-body-md mt-2 text-pretty">{item.a}</dd>
                </div>
              ))}
            </dl>
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
