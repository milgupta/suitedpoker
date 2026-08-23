import { PROOF_POINTS, TESTIMONIALS, type Testimonial } from "@/content/testimonials";

/**
 * The slow band of proof that slides across the payment screen.
 *
 * Three things it does deliberately:
 *
 *   1. **It is slow.** A full pass takes over a minute. A marquee at reading
 *      speed makes someone chase a line of text at the exact moment they are
 *      deciding whether to pay, which is the opposite of reassuring.
 *   2. **It stops on hover and on focus.** Anything moving that carries words
 *      has to be stoppable, or the words are decoration.
 *   3. **The second copy is `aria-hidden`.** The loop needs the list twice; a
 *      screen reader needs it once.
 *
 * Content comes from `src/content/testimonials.ts` and switches on its own:
 * real quotes when there are any, product facts until then. There is no path
 * through this component that renders an invented person.
 */

/** Enough entries that the track is wider than any viewport and the loop hides. */
const MIN_ENTRIES = 8;

function repeated<T>(items: readonly T[]): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  while (out.length < MIN_ENTRIES) out.push(...items);
  return out;
}

export function ProofMarquee({ className = "" }: { className?: string }) {
  const quotes = repeated(TESTIMONIALS);
  const points = repeated(PROOF_POINTS);

  const half =
    quotes.length > 0 ? (
      <Row>
        {quotes.map((quote, i) => (
          <QuoteChip key={`${quote.name}-${i}`} testimonial={quote} />
        ))}
      </Row>
    ) : (
      <Row>
        {points.map((point, i) => (
          <PointChip key={`${point}-${i}`} point={point} />
        ))}
      </Row>
    );

  return (
    // tabindex: below `sm` the band scrolls (`overflow-x: auto`), and axe
    // requires a scroll region to be keyboard-reachable. On desktop the same
    // tab stop pauses the marquee via `:focus-within`.
    <div
      className={`marquee ${className}`}
      data-proof={quotes.length > 0 ? "quotes" : "points"}
      tabIndex={0}
      role="region"
      aria-label={quotes.length > 0 ? "What players say" : "What is included"}
    >
      <div className="marquee-track">
        {half}
        {/* The duplicate exists only so translateX(-50%) lands seamlessly. */}
        <div aria-hidden>{half}</div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  // The trailing padding equals the gap, so each half is exactly the same
  // width including its trailing space — which is what makes -50% seamless.
  return <ul className="flex shrink-0 items-stretch gap-4 pe-4">{children}</ul>;
}

function PointChip({ point }: { point: string }) {
  return (
    <li className="border-border bg-surface-1/60 text-text-secondary text-body-sm flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 whitespace-nowrap">
      <span aria-hidden className="text-accent-bright">
        ✓
      </span>
      {point}
    </li>
  );
}

function QuoteChip({ testimonial }: { testimonial: Testimonial }) {
  const { quote, name, context } = testimonial;
  const detail = context != null && context.trim() !== "" ? ` · ${context}` : "";

  return (
    <li className="border-border bg-surface-1/60 flex w-[20rem] shrink-0 flex-col gap-2 rounded-lg border px-4 py-3">
      <p className="text-star text-caption tracking-wide" aria-hidden>
        ★★★★★
      </p>
      {/* Long beta reviews — clamp so the paywall band stays a skim, not a wall. */}
      <p className="text-text-primary text-body-sm line-clamp-3">“{quote}”</p>
      <p className="text-text-tertiary text-caption">
        {name}
        {detail}
      </p>
    </li>
  );
}
