"use client";

import { TESTIMONIALS, type Testimonial } from "@/content/testimonials";
import { TRUST } from "@/content/landing";
import { cn } from "@/lib/utils";

/**
 * Landing social proof: every review slides continuously across the page.
 *
 * Same marquee mechanics as the paywall proof band — cards enter from the
 * right, leave on the left, loop seamlessly. Hover / focus pauses so the
 * words stay readable. Quotes come only from `TESTIMONIALS`.
 */

/** Enough cards that the track is always wider than the viewport. */
const MIN_CARDS = 8;

function repeated(items: readonly Testimonial[]): Testimonial[] {
  if (items.length === 0) return [];
  const out: Testimonial[] = [];
  while (out.length < MIN_CARDS) out.push(...items);
  return out;
}

export function TestimonialCarousel({ className }: { className?: string }) {
  if (TESTIMONIALS.length === 0) return null;

  const cards = repeated(TESTIMONIALS);

  const half = (
    <ul className="flex shrink-0 items-stretch gap-4 pe-4">
      {cards.map((t, i) => (
        <TestimonialCard key={`${t.name}-${i}`} testimonial={t} />
      ))}
    </ul>
  );

  return (
    <section
      className={cn("border-border border-t", className)}
      aria-labelledby="trust-heading"
      data-section="testimonials"
    >
      <div className="mx-auto max-w-(--container-app) px-6 pt-20 pb-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <StarRow />
          <p className="text-accent-bright text-overline mt-5 font-mono tracking-widest uppercase">
            {TRUST.eyebrow}
          </p>
          <h2 id="trust-heading" className="text-display-md sm:text-display-lg mt-3 text-balance">
            {TRUST.headline}
          </h2>
        </div>
      </div>

      {/*
       * Full-bleed track — cards slide in and out of the viewport edges.
       * Duration is longer than the paywall chip band: these cards have full
       * paragraphs and need time to be read as they pass.
       */}
      <div
        className="marquee testimonial-marquee pb-20"
        data-testimonials-marquee
        style={{ ["--marquee-duration" as string]: "96s" }}
      >
        <div className="marquee-track">
          {half}
          <div aria-hidden>{half}</div>
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <li className="border-border bg-surface-1 flex w-[min(22rem,85vw)] shrink-0 flex-col gap-4 rounded-xl border px-5 py-5 sm:w-[24rem]">
      <StarRow size="sm" />
      <blockquote className="text-text-primary text-body-md flex-1 text-pretty">
        “{testimonial.quote}”
      </blockquote>
      <footer>
        <p className="text-text-primary text-body-md font-medium">{testimonial.name}</p>
        {testimonial.context != null && testimonial.context.trim() !== "" ? (
          <p className="text-text-tertiary text-caption">{testimonial.context}</p>
        ) : null}
      </footer>
    </li>
  );
}

function StarRow({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const dim = size === "sm" ? "size-3.5" : "size-5";
  return (
    <div
      className={cn("text-star flex items-center gap-1", className)}
      aria-label="5 out of 5 stars"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={cn("block fill-current", dim)} aria-hidden>
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.9l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}
