import type { Metadata } from "next";
import Link from "next/link";
import { AppFrame } from "@/components/marketing/AppFrame";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import {
  FEATURE_ROWS,
  FEATURES_CTA,
  FEATURES_HERO,
  MORE_FEATURES,
  type FeatureRow,
} from "@/content/features";

export const metadata: Metadata = {
  // Short form, no em dash of its own — the root template prefixes
  // "SuitedPoker — " to it.
  title: "Features",
  description:
    "Everything in a SuitedPoker subscription: solver-graded drills, the full range browser, a guided curriculum, table sessions and leak detection.",
};

/**
 * THE FEATURES PAGE.
 *
 * Every screenshot here is a DESKTOP capture from the running product
 * (`npm run screenshots:web`, 1280 wide), not the 390px phone shots the landing
 * page and the paywall use. A features page is read on a laptop, and the two
 * things worth showing — a 13x13 range grid and a graded decision with its
 * explanation — are unreadable inside a phone frame.
 *
 * Four rows with a picture each, then the rest as text. The temptation is a
 * screenshot per feature; the result of giving in is a page nobody scrolls to
 * the end of.
 */
export default function FeaturesPage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="ambient-host">
          <div
            aria-hidden
            className="ambient-blob left-1/2 z-0 -translate-x-1/2 opacity-50"
            style={{ position: "absolute", top: "-14rem" }}
          />

          <div className="mx-auto max-w-(--container-app) px-6 pt-16 pb-14 text-center">
            <p className="text-text-tertiary text-overline font-mono tracking-widest uppercase">
              {FEATURES_HERO.eyebrow}
            </p>
            <h1 className="text-display-lg sm:text-display-xl mt-4 text-balance">
              {FEATURES_HERO.title}
            </h1>
            <p className="text-text-secondary text-body-lg mx-auto mt-5 max-w-xl text-pretty">
              {FEATURES_HERO.body}
            </p>
            <Link
              href="/signup"
              data-cta="features-hero"
              className="btn-accent text-body-lg mt-8 inline-flex min-h-12 items-center justify-center rounded-full px-7"
            >
              {FEATURES_HERO.cta}
            </Link>
          </div>
        </section>

        {/* ── The four rows ────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-(--container-app) px-6 pb-8">
          {FEATURE_ROWS.map((row, index) => (
            <Row key={row.shot} row={row} index={index} />
          ))}
        </div>

        {/* ── Everything else ──────────────────────────────────────────────── */}
        <section className="border-border border-t">
          <div className="mx-auto max-w-(--container-app) px-6 py-20">
            <h2 className="text-display-md">And the rest of it</h2>

            <dl className="border-border mt-10 grid border-t sm:grid-cols-2 lg:grid-cols-3">
              {MORE_FEATURES.map((feature) => (
                <div key={feature.title} className="border-border border-b py-6 sm:pe-8">
                  <dt className="text-heading-md">{feature.title}</dt>
                  <dd className="text-text-secondary text-body-md mt-2 max-w-sm text-pretty">
                    {feature.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="border-border ambient-host border-t">
          <div
            aria-hidden
            className="ambient-blob ambient-blob--accent left-1/2 z-0 -translate-x-1/2 opacity-70"
            style={{ position: "absolute", bottom: "-15rem" }}
          />
          <div className="mx-auto max-w-(--container-marketing) px-6 py-24 text-center">
            <h2 className="text-display-md sm:text-display-lg text-balance">
              {FEATURES_CTA.title}
            </h2>
            <p className="text-text-secondary text-body-lg mx-auto mt-6 max-w-xl text-pretty">
              {FEATURES_CTA.body}
            </p>
            <Link
              href="/signup"
              data-cta="features-final"
              className="bg-text-primary text-canvas text-body-lg mt-10 inline-flex min-h-12 items-center justify-center rounded-full px-7 font-semibold"
            >
              {FEATURES_CTA.cta}
            </Link>
            <p className="text-text-tertiary text-body-md mt-4">
              <Link href="/pricing" className="underline underline-offset-4">
                See pricing
              </Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * One feature, alternating sides on `lg`.
 *
 * The image column is FIRST in the DOM on odd rows and moved by grid placement
 * rather than by `order`, so the reading order on a phone stays
 * heading-then-picture the whole way down. An alternation built with `order`
 * reads correctly on a laptop and shuffles itself on a phone.
 */
function Row({ row, index }: { row: FeatureRow; index: number }) {
  const imageRight = index % 2 === 0;

  return (
    <section className="border-border grid gap-8 border-b py-16 lg:grid-cols-2 lg:items-center lg:gap-14">
      <div className={imageRight ? "lg:col-start-1" : "lg:col-start-2"}>
        <p className="text-accent-bright text-overline font-mono tracking-widest uppercase">
          {row.tag}
        </p>
        <h2 className="text-display-md mt-3 text-balance">{row.title}</h2>
        <p className="text-text-secondary text-body-lg mt-5 max-w-md text-pretty">{row.body}</p>

        <ul className="mt-6 flex flex-col gap-3">
          {row.points.map((point) => (
            <li key={point} className="text-text-secondary text-body-md flex gap-3">
              <span aria-hidden className="text-accent-bright shrink-0">
                ✓
              </span>
              <span className="text-pretty">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <AppFrame
        label={row.route}
        className={imageRight ? "lg:col-start-2 lg:row-start-1" : "lg:col-start-1 lg:row-start-1"}
      >
        {/*
         * A FIXED CSS HEIGHT, not an intrinsic aspect ratio.
         *
         * `npm run screenshots:web` crops each capture to its own painted
         * content, so the shots are deliberately different widths — 598px for
         * the dashboard's column, 1116px for the range grid. Sizing from the
         * image would give every row a different frame height and the page a
         * lurch at each one. A fixed box also means the image reserves its
         * space before it loads, so this page cannot shift as it comes in.
         *
         * `object-top`: these are tall captures of real screens, and the top of
         * a screen is the part worth showing.
         */}
        <picture>
          <source srcSet={`/screenshots/web/${row.shot}.avif`} type="image/avif" />
          <source srcSet={`/screenshots/web/${row.shot}.webp`} type="image/webp" />
          <img
            src={`/screenshots/web/${row.shot}.png`}
            alt={row.alt}
            width={1116}
            height={1180}
            loading="lazy"
            decoding="async"
            className="border-border h-[20rem] w-full rounded-md border object-cover object-top sm:h-[26rem]"
          />
        </picture>
      </AppFrame>
    </section>
  );
}
