/**
 * Every word on the landing page.
 *
 * Copy lives here rather than inside the component for the same reason the
 * onboarding quiz's does: the rendered page is scanned by
 * `tests/e2e/landing.spec.ts` for terms that cost an ad account, and a string
 * buried three levels into JSX is a string nobody re-reads. It also means the
 * page component is layout and nothing else.
 *
 * Rules that apply to everything in this file:
 *   - No dollar-denominated results claim, ever. bb/100 and accuracy only.
 *   - "gambling" may appear ONLY inside a sentence that denies it.
 *   - No superlative we cannot show the arithmetic for.
 */

export interface NavLink {
  readonly label: string;
  readonly href: string;
}

export const NAV: readonly NavLink[] = [
  { label: "Features", href: "/features" },
  { label: "How it works", href: "/#how" },
  // /methodology is deliberately absent from the public navigation — header
  // and footer both. The page still exists, still renders and is still in the
  // sitemap; it is a long read that was pulling people sideways out of the
  // funnel. The landing page keeps the short provenance paragraph, which is
  // the part that has to stay visible.
  { label: "Pricing", href: "/pricing" },
];

export const HERO = {
  eyebrow: "GTO training for beginners",
  /** Two lines. The break is deliberate — see the component. */
  title: "Stop guessing.",
  titleAccent: "Start knowing.",
  body: "Learn the strategy behind every decision — explained in plain English, one hand at a time. Built for players who know the rules and are stuck on everything after that.",
  cta: "Sign Up",
  secondary: "See how it works",
} as const;

/**
 * The thin row under the hero CTA.
 *
 * Facts about the product, not claims about the user's results — each one is
 * checkable against something in this repo, which is the only kind of proof
 * this page is allowed to make before there are real testimonials.
 */
export const HERO_PROOF: readonly string[] = [
  "No real money, ever",
  "Runs in the browser",
  "Cancel any time",
];

export interface ProblemPoint {
  readonly title: string;
  readonly body: string;
}

export const PROBLEM: readonly ProblemPoint[] = [
  {
    title: "Videos don't stick",
    body: "You watch an hour of strategy and remember none of it the moment a real decision is in front of you.",
  },
  {
    title: "Charts are dead ends",
    body: "A range chart tells you what. It never tells you why, so it never transfers to the spot that is not on the chart.",
  },
  {
    title: "Solvers are unreadable",
    body: "The right answer exists, buried in a tool that costs a fortune and assumes you already speak the language.",
  },
];

export const HOW = {
  eyebrow: "The loop",
  title: "How it works",
  lede: "The same hand, three screens.",
} as const;

export interface Step {
  readonly title: string;
  readonly body: string;
}

export const STEPS: readonly Step[] = [
  {
    title: "Answer a spot",
    body: "A real hand — position, stacks, the action so far. You pick what you would do.",
  },
  {
    title: "See the mix",
    body: "Not a tick or a cross. How often each action is taken. Both lines here cost the same — the split is the lesson.",
  },
  {
    title: "Understand why",
    body: "A plain-English explanation of the idea, written for someone who does not already speak solver.",
  },
];

export interface Feature {
  readonly title: string;
  readonly body: string;
}

export const FEATURES: readonly Feature[] = [
  {
    title: "Real spots, not flashcards",
    body: "Every hand is a genuine situation you will face — position, stack depth and action history included.",
  },
  {
    title: "Graded on what it costs",
    body: "Decisions are scored on expected value lost, so a reasonable line is never marked wrong.",
  },
  {
    title: "A path, not a firehose",
    body: "A guided curriculum from preflop fundamentals through board texture and bet sizing, plus a daily challenge.",
  },
  {
    title: "Full hands against real opponent types",
    body: "Play out sessions against the calling station, the nit and the maniac, then review what went wrong.",
  },
  {
    title: "Your leaks, found for you",
    body: "The app tracks where you lose the most and builds practice around it instead of dealing you random spots.",
  },
  {
    title: "Every range, browsable",
    body: "The full 13×13 grid for every spot in the solution set, with the frequency and the cost in each cell.",
  },
];

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

/**
 * Twelve, and the count is asserted by the FAQPage structured-data test. If
 * you add a thirteenth, update the test rather than deleting one to fit.
 *
 * Ordered as a sales arc, not a compliance sheet: barrier-removers first
 * (do I qualify, will it fit my game), then what you get and why it works,
 * then effort and the trial, then the technical-trust and legal answers. The
 * gambling denial stays on the page for ad reviewers — it just is not the
 * greeting.
 */
export const FAQ: readonly FaqItem[] = [
  {
    q: "Do I need to know poker already?",
    a: "You need to know the rules and hand rankings. Everything after that — position, ranges, board texture, bet sizing — is what the curriculum teaches, starting from the beginning.",
  },
  {
    q: "Will this work for my home game?",
    a: "Yes, and it is probably where it helps most. The strategy is built for 6-max at 100 big blinds, which is close to how a typical home game plays. The ideas — position, which hands to open, why you fold a good hand sometimes — transfer directly.",
  },
  {
    q: "What do I actually get?",
    a: "Unlimited practice hands graded against solved strategy, an AI coach that explains every decision in plain English, a daily five-hand challenge, a full table simulator with post-session review, a structured curriculum, and every range in the solution set, browsable. One subscription, everything included.",
  },
  {
    q: "How is this different from training videos?",
    a: "Videos show you someone else's decisions. Here you make your own — every hand is graded against solved strategy, and the feedback is about the exact spot in front of you. You find out which situations cost you, not which ones are interesting to talk about.",
  },
  {
    q: "How does it find my leaks?",
    a: "Every answer you give is scored by what it would cost against solved strategy. The app tracks where you give up the most — by position and by situation — and tilts your practice toward those spots until they stop leaking.",
  },
  {
    q: "How much time does it take?",
    a: "Around ten minutes a day. The daily challenge is five hands and takes about three.",
  },
  {
    q: "Is there a free trial?",
    a: "The signup quiz is the trial: four questions and one real hand, played and graded before you are ever asked for a card. If the read on your game feels right, the subscription unlocks everything.",
  },
  {
    q: "What is a solver?",
    a: "A program that calculates the mathematically optimal way to play a poker situation. Professionals have used them for years. They are expensive and hard to read, which is the gap this fills.",
  },
  {
    q: "Is this actually GTO?",
    a: "It is a simplified approximation of GTO, and we say so on the methodology page rather than hiding it. The range shapes follow published solver-derived output; the exact frequencies are our model. For learning why a hand mixes at all, that is the right level of precision. For the last fraction of a big blind in a specific river spot, it is not — and nothing at this price is.",
  },
  {
    q: "Is this gambling?",
    a: "No. SuitedPoker is educational software. There is no wagering, no real money at stake, and nothing to win or lose. You practise decisions against precomputed strategy and get feedback on them.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. It is built for mobile first and runs in the browser — nothing to install.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account settings. You keep access until the end of the period you have already paid for. See our refund policy in the Terms.",
  },
];

export const FINAL_CTA = {
  title: "Find out where your game leaks.",
  body: "Four questions, then one real hand you play yourself. The read you get at the end is built from what you actually did, not from what you said.",
  cta: "Sign Up",
} as const;

/**
 * Landing social proof. Quotes themselves live in `testimonials.ts` (with
 * sources); this is only the frame around them so the page stays copy-central.
 */
export const TRUST = {
  eyebrow: "From our beta testers",
  headline: "Trusted by hundreds of recreational and pro players",
} as const;
