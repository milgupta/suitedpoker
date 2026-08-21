/**
 * The features page's copy and its shot list.
 *
 * Same discipline as `src/content/landing.ts`: copy out of the component, so
 * the ad-account scan reads it in one place and the page file is layout only.
 *
 * The `shot` on each row names a file under `public/screenshots/web/`, captured
 * by `npm run screenshots:web` at 1280 wide. `tests/unit/assets.test.ts`
 * resolves every one against disk — Next does not check a string `src` and
 * neither does TypeScript.
 */

export const FEATURES_HERO = {
  eyebrow: "Features",
  title: "Everything in one subscription.",
  body: "No tiers, nothing held back for an upgrade. Here is what you get, shown in the actual product rather than described.",
  cta: "Find my biggest leak",
} as const;

export interface FeatureRow {
  /** The short tag above the heading. */
  readonly tag: string;
  readonly title: string;
  readonly body: string;
  /** Two or three, each one thing the screenshot beside it actually shows. */
  readonly points: readonly string[];
  /** Basename under public/screenshots/web/. */
  readonly shot: string;
  /** The route in the frame's address bar. A real one, never a slogan. */
  readonly route: string;
  readonly alt: string;
}

export const FEATURE_ROWS: readonly FeatureRow[] = [
  {
    tag: "Grading",
    title: "See the whole strategy, not a tick",
    body: "Answer a spot and the full mix opens up: how often the chart takes each action, and what yours costs in chips against the best one. A reasonable line is never marked wrong.",
    points: [
      "Width is how often, colour is what it costs",
      "Graded on expected value lost, not right or wrong",
      "A plain-English explanation under every hand",
    ],
    shot: "feedback",
    route: "suitedpoker.com/arena",
    alt: "A graded decision showing the frequency bar, the grade and the explanation",
  },
  {
    tag: "Reference",
    title: "Every range, browsable mid-hand",
    body: "The full 13×13 grid for every preflop spot in the solution set. Pick a position and a scenario and read the whole range — this is a reference you look things up in, not an exam.",
    points: [
      "All six positions, open and facing a raise",
      "169 cells, each showing the actual mix",
      "The pot and stack depth the range assumes",
    ],
    shot: "ranges",
    route: "suitedpoker.com/ranges",
    alt: "The range browser showing a 13 by 13 grid of starting hands",
  },
  {
    tag: "Curriculum",
    title: "A path, not a firehose",
    body: "Fourteen lessons from preflop fundamentals through board texture and bet sizing, written for someone who knows the rules and nothing after them. Each one ends in a graded practice set.",
    points: [
      "Plain English — no jargon that is not explained first",
      "Real hands embedded in the reading",
      "Unlocked in order, so nothing arrives before its groundwork",
    ],
    shot: "lesson",
    route: "suitedpoker.com/learn",
    alt: "A curriculum lesson about position, with a hand illustration",
  },
  {
    tag: "Progress",
    title: "Your leaks, found for you",
    body: "The app tracks where you actually lose value and builds practice around it instead of dealing you random spots. Accuracy by street, a daily challenge, and a streak worth keeping.",
    points: [
      "Practice weighted toward your worst spots",
      "Five hands a day, about three minutes",
      "Accuracy and chips per 100 hands — never a dollar figure",
    ],
    shot: "dashboard",
    route: "suitedpoker.com/practice",
    alt: "The practice hub with daily challenge, arena, and table sim",
  },
];

export interface SmallFeature {
  readonly title: string;
  readonly body: string;
}

/** The rest, without a picture each. Concise on purpose. */
export const MORE_FEATURES: readonly SmallFeature[] = [
  {
    title: "Hints that do not answer",
    body: "Three levels. The first two may not name an action at all — they point at what to look at.",
  },
  {
    title: "Ask about the hand",
    body: "A coach you can question after any decision. It explains the solution it was handed; it never invents one.",
  },
  {
    title: "Full sessions at a table",
    body: "Play out whole hands against distinct opponent types, then get a review of where the session leaked.",
  },
  {
    title: "Difficulty that follows you",
    body: "A rating that moves with your results, so spots stay at the edge of what you can already do.",
  },
  {
    title: "Runs in the browser",
    body: "Nothing to install, works offline once loaded, and installs to a home screen if you want it there.",
  },
  {
    title: "No real money, ever",
    body: "Educational software. There is no wagering and nothing to win or lose — you are practising decisions.",
  },
];

export const FEATURES_CTA = {
  title: "Start with the hand you are worst at.",
  body: "Four questions and one real hand, then a read built from what you actually did. About a minute.",
  cta: "Find my biggest leak",
} as const;
