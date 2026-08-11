/**
 * SOCIAL PROOF FOR THE PAYMENT SCREEN AND THE LANDING PAGE.
 *
 * Every entry in `TESTIMONIALS` must be something a real person actually said,
 * with a `source` specific enough to find it again. That is not a style
 * preference:
 *
 *   - The FTC's rule on consumer reviews and testimonials (16 CFR Part 465,
 *     effective October 2024) makes writing or commissioning a testimonial from
 *     someone who is not a real customer a violation carrying civil penalties
 *     per instance.
 *   - Stripe's risk team reads the payment screen. Invented reviews on it are
 *     one of the specific signals that gets an account reviewed.
 *   - And the audience is numerate. Somebody who can be sold a poker trainer
 *     can spot a manufactured quote, and one of those discounts every honest
 *     number on the page with it.
 *
 * `tests/unit/testimonials.test.ts` refuses an entry with no source.
 */

export interface Testimonial {
  /** Their words. Trimmed for length is fine; rewritten is not. */
  readonly quote: string;
  /** The name as they agreed it could appear — a first name and initial is fine. */
  readonly name: string;
  /**
   * Optional line under the name — stakes, seat, role, etc. Blank is fine;
   * the UI omits it when missing.
   */
  readonly context?: string;
  /**
   * Where this came from, specifically enough to find again — a support thread
   * id, a review url, the date of the survey response. Nobody outside sees it;
   * it exists so a claim on the payment screen can always be traced to a person.
   */
  readonly source: string;
}

/**
 * Closed-beta players who left 5-star written reviews and agreed to first-name
 * attribution. Source notes are for internal traceability, not display.
 */
export const TESTIMONIALS: readonly Testimonial[] = [
  {
    name: "Marcus T.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "Suited Poker has completely changed how I study the game. Instead of just playing more hands and hoping I improve, I can actually train specific spots and understand where my mistakes are coming from. It makes poker study feel structured instead of random.",
  },
  {
    name: "Sarah K.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "I'm still relatively new to poker, and Suited Poker made learning way less overwhelming. The training feels approachable, and I can work through concepts at my own pace instead of trying to piece everything together from YouTube videos and forums.",
  },
  {
    name: "Jake R.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "My favorite part is being able to practice decisions over and over again. I've noticed that spots I used to hesitate on now feel much more automatic. It's probably the most useful poker training tool I've added to my routine.",
  },
  {
    name: "Priya M.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "Suited Poker does a really good job of turning complicated poker strategy into something you can actually practice. I don't just want to memorize charts. I want to understand why a decision is correct, and the training has helped me build that intuition.",
  },
  {
    name: "Dylan C.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "I used to spend hours studying poker without really knowing if I was improving. Suited Poker gives my practice much more direction. I can focus on the situations I struggle with, work through them, and actually see myself getting more consistent.",
  },
  {
    name: "Emily S.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "As a casual player who wants to get better, this is exactly what I was looking for. A lot of poker training content feels like it's made only for extremely advanced players, but Suited Poker makes improvement feel accessible without dumbing anything down.",
  },
  {
    name: "Noah B.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "I've tried studying with videos, charts, and strategy articles, but active practice has helped me much more. Suited Poker forces me to actually make decisions instead of passively watching someone else explain them. That difference is huge.",
  },
  {
    name: "Aiden L.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "I've been playing poker for years and still found plenty of weaknesses in my game through Suited Poker. It's especially useful for sharpening spots that come up often but are easy to overlook. I've become much more confident in my decision-making.",
  },
  {
    name: "Maya P.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "What I like most is that training doesn't feel like studying from a textbook. It's interactive, quick, and easy to fit into my day. Even doing a short session makes me feel like I'm actually working toward becoming a better player.",
  },
  {
    name: "Connor J.",
    source: "Closed beta written review, Aug 2026 — publish permission for first name + initial",
    quote:
      "Suited Poker finally gave me a consistent way to train. Before, I would bounce between random videos, articles, and charts without a real system. Now I can sit down, practice actual poker decisions, identify what I'm getting wrong, and improve from there.",
  },
];

/**
 * Which of the two the band is showing. Exported so a caller can LABEL it
 * honestly — "what players say" over a list of product facts is the fabricated
 * testimonial this module exists to refuse, just written in a heading.
 */
export const PROOF_MODE: "quotes" | "points" = TESTIMONIALS.length > 0 ? "quotes" : "points";

/**
 * What slides on the paywall until there are quotes.
 *
 * Every line is a property of the product that is true right now and verified
 * somewhere in this repo — not a benefit we hope someone feels.
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
