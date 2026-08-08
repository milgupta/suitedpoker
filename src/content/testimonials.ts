/**
 * SOCIAL PROOF FOR THE PAYMENT SCREEN, AND THE RULE THAT GOVERNS IT.
 *
 * Every entry in `TESTIMONIALS` must be something a real person actually said,
 * with a `source` specific enough to find it again. That is not a style
 * preference:
 *
 *   - The FTC's rule on consumer reviews and testimonials (16 CFR Part 465,
 *     effective October 2024) makes writing or commissioning a testimonial from
 *     someone who is not a real customer a violation carrying civil penalties
 *     per instance. It applies to a checkout page more squarely than to
 *     anything else on a site.
 *   - Stripe's risk team reads the payment screen. Invented reviews on it are
 *     one of the specific signals that gets an account reviewed.
 *   - And the audience is numerate. Somebody who can be sold a poker trainer
 *     can spot a manufactured quote, and one of those discounts every honest
 *     number on the page with it.
 *
 * So the array starts empty, and `ProofMarquee` slides `PROOF_POINTS` — claims
 * about the product that are true today and checkable in this repo — until
 * there is something real to put in it. The moment a quote arrives, add it
 * here and the marquee switches over on its own.
 *
 * `tests/unit/testimonials.test.ts` refuses an entry with no source.
 */

export interface Testimonial {
  /** Their words. Trimmed for length is fine; rewritten is not. */
  readonly quote: string;
  /** The name as they agreed it could appear — a first name and initial is fine. */
  readonly name: string;
  /** Who they were when they said it: "six weeks in", "2NL", "home game only". */
  readonly context: string;
  /**
   * Where this came from, specifically enough to find again — a support thread
   * id, a review url, the date of the survey response. Nobody outside sees it;
   * it exists so a claim on the payment screen can always be traced to a person.
   */
  readonly source: string;
}

/**
 * Empty on purpose. See the header. Fill it from real collected quotes with
 * written permission to use the name.
 */
export const TESTIMONIALS: readonly Testimonial[] = [];

/**
 * What slides until then.
 *
 * Every line is a property of the product that is true right now and verified
 * somewhere in this repo — not a benefit we hope someone feels. A band of
 * capability statements is honest; a band of invented people is not, and it is
 * the same amount of movement on screen.
 */
export const PROOF_POINTS: readonly string[] = [
  "Graded against a solved solution, not an opinion",
  "Every position, every street, six-handed",
  "The coach explains the part you could not see",
  "169-hand ranges you can look up mid-hand",
  "Hints that guide without naming the answer",
  "A leak report that updates as you play",
  "One daily challenge, five spots, no scrolling",
  "Cancel any time from your account page",
];
