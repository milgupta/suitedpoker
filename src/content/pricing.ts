/**
 * The pricing page's copy.
 *
 * Separate from the landing copy because it is scanned separately and because
 * it is the page a payment-risk reviewer reads most carefully: what is
 * included, what renews, and how to stop it all have to be answerable without
 * clicking anything.
 */

/**
 * What the subscription contains. One tier, so this is a list and not a matrix.
 *
 * Every line here is held against the product, not the roadmap: "the
 * leaderboard" was listed while no leaderboard existed in the UI, "every spot
 * in the solution set" while 11 of 43 nodes are deliberately quarantined, and
 * "every range" while postflop ranges are not browsable. A claim goes back on
 * this list the day the feature ships, never the day it is planned.
 */
export const INCLUDED: readonly string[] = [
  "Unlimited drills across the served solution set",
  "The full strategy after every decision — frequencies and the cost of each action",
  "Plain-English explanations, and a coach you can ask follow-up questions",
  "The guided curriculum, from preflop fundamentals to board texture and sizing",
  "Full-hand sessions against distinct opponent types, with a post-session review",
  "The daily challenge and streaks",
  "Every preflop range in the set, browsable cell by cell",
  "Leak detection that builds your practice around what you actually get wrong",
];

export interface PricingFaqItem {
  readonly q: string;
  readonly a: string;
}

export const PRICING_FAQ: readonly PricingFaqItem[] = [
  {
    q: "Is there a free trial?",
    a: "There is no time-limited trial. Before you are asked for a card you answer eight questions and play one real hand, and the read you get at the end is built from what you did in it — that is the trial, and it costs nothing.",
  },
  {
    q: "What happens when I subscribe?",
    a: "The subscription starts immediately and renews automatically at the end of each period until you cancel. Prices are in US dollars and are charged by Stripe.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account settings. You keep access until the end of the period you have already paid for, and nothing is charged after that.",
  },
  {
    q: "Can I switch from monthly to yearly?",
    a: "Yes, from your account settings. The change takes effect straight away and the remaining time on your monthly period is credited against the yearly price.",
  },
  {
    q: "Do you offer refunds?",
    a: "Our refund policy is set out in the Terms. If something is genuinely wrong, write to support@suitedpoker.com and we would rather fix it than argue about it.",
  },
  {
    q: "Is this gambling?",
    a: "No. SuitedPoker is educational software. There is no wagering, no real money at stake, and nothing to win or lose — you are paying for training, not for a game.",
  },
];
