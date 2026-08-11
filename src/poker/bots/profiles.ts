/**
 * Archetype profiles.
 *
 * Every bot is a set of MODIFIERS applied to the solution data, not a
 * hand-coded decision tree. That is what keeps them coherent: when the preflop
 * set is corrected, every bot inherits the correction, and no archetype can
 * drift into playing a hand the solution has never heard of.
 *
 * The numbers below are the archetype's *identity* — a nit that plays 30% of
 * hands is not a nit — so they are calibrated against the measured VPIP/PFR
 * matrix in the tests rather than guessed and left alone.
 */

import { type HandKey, HAND_KEYS, comboCountOf, parseHandKey, TOTAL_COMBOS } from "../range";

export const BOT_IDS = ["nit", "station", "maniac", "tag", "gto"] as const;
export type BotId = (typeof BOT_IDS)[number];

export interface BotProfile {
  id: BotId;
  name: string;
  description: string;
  /** What this bot is FOR — the lesson a user should take from beating it. */
  teaches: string;

  /**
   * Width when FIRST IN, as a share of all combos. Separate from defending
   * because an rfi node offers no call: a passive bot that reaches one can
   * only raise or fold, so modelling "loose" with a single number makes the
   * calling station the second-most aggressive bot at the table.
   */
  openWidth: number;
  /** Width when facing a raise, where calling is available. */
  defendWidth: number;
  /** Kept for reporting and ordering assertions. */
  vpipTarget: number;
  /** Of the hands played, the share raised rather than called. */
  raiseShare: number;
  /**
   * How much the solution's own mix is trusted over the archetype's. 1 means
   * "sample the solution", 0 means "ignore it and use the archetype".
   */
  solutionWeight: number;

  /** Postflop: base probability of betting a strong hand. */
  valueAggression: number;
  /** Postflop: probability of betting with nothing. */
  bluffFrequency: number;
  /** Postflop: how readily a marginal hand is folded to a bet. */
  foldToAggression: number;

  /**
   * Per-decision noise: the share of a hand's CONTINUE mix that is
   * redistributed evenly across its non-fold actions. This is what stops a
   * near-pure strategy from playing the same hand identically a hundred times
   * in a row — the tell that made the bots feel scripted. Hands the profile
   * folds outright stay folded: varying trash into the pot would be noise a
   * player reads as a bug, not as a style.
   */
  mixTemperature: number;
  /**
   * Exponent on the pot-odds curve — how sharply this bot's continue
   * frequency tracks the price it is being offered. A station barely notices
   * the difference between a min-raise and an overbet; a regular notices
   * nothing else.
   */
  priceSensitivity: number;
  /** Open-raise size in big blinds, [min, max] — jittered per decision. */
  openRaiseBb: readonly [number, number];
  /** Re-raise as a multiple of the bet faced, [min, max] — jittered too. */
  reraiseX: readonly [number, number];
  /** Multiplier on the standard postflop bet fractions. */
  betSizeMult: number;
}

export const PROFILES: Record<BotId, BotProfile> = {
  nit: {
    id: "nit",
    name: "The Rock",
    description:
      "Very tight preflop, rarely bluffs, folds to aggression on scary boards. Only raises with genuinely strong hands.",
    teaches: "Fold to their aggression, and steal their blinds relentlessly.",
    openWidth: 0.13,
    defendWidth: 0.1,
    vpipTarget: 0.12,
    raiseShare: 0.86,
    solutionWeight: 0.35,
    valueAggression: 0.72,
    bluffFrequency: 0.05,
    foldToAggression: 0.78,
    mixTemperature: 0.08,
    priceSensitivity: 1.4,
    openRaiseBb: [2.2, 2.5],
    reraiseX: [2.8, 3.4],
    betSizeMult: 0.9,
  },
  station: {
    id: "station",
    name: "The Calling Station",
    description:
      "Calls far too much preflop and postflop. Almost never bluffs, almost never folds a pair. Passive.",
    teaches: "Value bet thin and relentlessly, and never try to bluff them.",
    openWidth: 0.45,
    defendWidth: 0.55,
    vpipTarget: 0.45,
    raiseShare: 0.055,
    solutionWeight: 0.15,
    valueAggression: 0.3,
    bluffFrequency: 0.02,
    foldToAggression: 0.12,
    mixTemperature: 0.12,
    priceSensitivity: 0.6,
    openRaiseBb: [2.0, 2.4],
    reraiseX: [2.5, 3.0],
    betSizeMult: 0.75,
  },
  maniac: {
    id: "maniac",
    name: "The Maniac",
    description: "Raises and re-raises with a very wide range. High bluff frequency, big sizings.",
    teaches: "Widen your calling range and let them bluff into your strong hands.",
    openWidth: 0.56,
    defendWidth: 0.55,
    vpipTarget: 0.55,
    raiseShare: 0.72,
    solutionWeight: 0.1,
    valueAggression: 0.95,
    bluffFrequency: 0.62,
    // Still the loosest defender by defendWidth, but not a pure station: a
    // maniac that calls everything measures LESS aggressive than the regular,
    // because the aggression factor is bets divided by calls.
    foldToAggression: 0.34,
    mixTemperature: 0.16,
    priceSensitivity: 0.7,
    openRaiseBb: [2.8, 3.6],
    reraiseX: [3.2, 4.2],
    betSizeMult: 1.3,
  },
  tag: {
    id: "tag",
    name: "The Solid Regular",
    description:
      "Tight-aggressive. Plays close to the solution preflop with a slight value lean postflop, and over-folds rivers.",
    teaches: "Balanced play — you cannot simply run them over.",
    openWidth: 0.235,
    // Wider than the solution's own defends on purpose: the online preset is
    // FIVE-handed, so with one fewer seat behind every open, chart-faithful
    // defends fold the table around too often to be worth playing against.
    defendWidth: 0.26,
    vpipTarget: 0.24,
    raiseShare: 0.83,
    solutionWeight: 0.7,
    valueAggression: 0.78,
    bluffFrequency: 0.24,
    foldToAggression: 0.55,
    mixTemperature: 0.08,
    priceSensitivity: 1.5,
    openRaiseBb: [2.3, 2.8],
    reraiseX: [2.8, 3.6],
    betSizeMult: 1.0,
  },
  gto: {
    id: "gto",
    name: "The Boss",
    description:
      "Samples directly from the preflop solution set and the postflop templates, with small noise. The benchmark opponent.",
    teaches: "The reference. If you beat this one you are not a beginner.",
    // Wider than the archetype's on-tree behaviour ON PURPOSE. These apply
    // only to lines the 43-node set does not model — limped and multi-way
    // pots — where the solution is silent and folding everything would make
    // the benchmark bot the tightest at the table.
    openWidth: 0.46,
    defendWidth: 0.42,
    vpipTarget: 0.26,
    raiseShare: 0.84,
    solutionWeight: 1,
    valueAggression: 0.72,
    bluffFrequency: 0.3,
    foldToAggression: 0.5,
    mixTemperature: 0.03,
    priceSensitivity: 1.3,
    openRaiseBb: [2.4, 2.7],
    reraiseX: [3.0, 3.7],
    betSizeMult: 1.0,
  },
};

// ── Hand strength, for the archetype width gate ───────────────────────────────

function rawStrength(key: HandKey): number {
  const { kind, high, low } = parseHandKey(key);
  if (kind === "pair") return 60 + high * 3.2;
  const gap = high - low;
  const connector = gap === 1 ? 3 : gap === 2 ? 1.5 : gap === 3 ? 0.5 : 0;
  return high * 3.0 + low * 1.6 + (kind === "suited" ? 6 : 0) + connector;
}

/**
 * Combo-weighted percentile, 1 = best hand in the deck.
 *
 * Weighted by combos rather than by hand key, so "the top 12% of hands" means
 * 12% of the hands you are actually dealt. Counting keys instead would call
 * AA and 72o equally common and make every archetype's width wrong.
 */
const STRENGTH_PERCENTILE: ReadonlyMap<HandKey, number> = (() => {
  const ordered = [...HAND_KEYS].sort((a, b) => rawStrength(b) - rawStrength(a));
  const map = new Map<HandKey, number>();
  let cumulative = 0;
  for (const key of ordered) {
    cumulative += comboCountOf(key);
    // The percentile of the WEAKEST combo in this key, so a key is "in the top
    // X%" only when all of it is.
    map.set(key, 1 - cumulative / TOTAL_COMBOS);
  }
  return map;
})();

export function strengthPercentile(key: HandKey): number {
  return STRENGTH_PERCENTILE.get(key) ?? 0;
}

/** Hands in the archetype's width, as a share of all combos. */
export function withinWidth(key: HandKey, width: number): boolean {
  return strengthPercentile(key) >= 1 - width;
}
