/**
 * Stat definitions for <StatInfoSheet>.
 *
 * Typed objects rather than MDX for now — same location, same authoring shape,
 * no build-config dependency. `getGlossaryEntry` is the only thing components
 * touch, so swapping the loader for MDX later changes one file.
 *
 * Every entry answers BOTH questions in the same breath: what the number is,
 * and what a good one looks like. A beginner meeting "VPIP" for the first time
 * needs the definition and the target together, or the number is just noise.
 *
 * No dollar-denominated figures anywhere. bb/100 and percentages only.
 */

export interface GlossaryBand {
  /** Upper bound of this band, inclusive. */
  readonly upTo: number;
  /** The plain word shown beside the value — "Loose", "Solid". */
  readonly word: string;
}

export interface GlossaryEntry {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly decimals: number;
  /** One plain-English paragraph. No jargon, no solver vocabulary. */
  readonly what: string;
  /** A CONCRETE target and one action. Never "play better". */
  readonly improve: string;
  readonly bands: readonly GlossaryBand[];
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "vpip",
    name: "VPIP",
    unit: "%",
    decimals: 0,
    what: "How often you put money in the pot before the flop, by calling or raising. It is the simplest measure of how many hands you choose to play.",
    improve:
      "Aim for 20–25% in 6-max. If you are above that, the fix is almost always folding more from the two seats to the right of the button.",
    bands: [
      { upTo: 17, word: "Tight" },
      { upTo: 27, word: "Solid" },
      { upTo: 100, word: "Loose" },
    ],
  },
  {
    id: "pfr",
    name: "PFR",
    unit: "%",
    decimals: 0,
    what: "How often you raise before the flop. Comparing it to VPIP shows whether you enter pots taking the lead or just calling along.",
    improve:
      "Aim for 16–21% in 6-max, and keep it within about 5 points of your VPIP. A large gap means you are calling too many hands you should either raise or fold.",
    bands: [
      { upTo: 13, word: "Passive" },
      { upTo: 22, word: "Solid" },
      { upTo: 100, word: "Wild" },
    ],
  },
  {
    id: "accuracy",
    name: "Accuracy",
    unit: "%",
    decimals: 0,
    what: "The share of your decisions that matched a strong line — best or solid rather than a mistake. It counts decisions, not hands won.",
    improve:
      "Aim for 75% and up. Below that, work through the drill for the street you miss most rather than playing more hands.",
    bands: [
      { upTo: 59, word: "Rough" },
      { upTo: 74, word: "Coming along" },
      { upTo: 89, word: "Strong" },
      { upTo: 100, word: "Sharp" },
    ],
  },
  {
    id: "ev-loss",
    name: "EV lost",
    unit: " bb/100",
    decimals: 1,
    what: "How much value your decisions gave up, measured in big blinds per hundred hands. Zero means you played the spot as well as it can be played.",
    improve:
      "Aim to keep this under 3 bb/100. The fastest gain is usually the single spot type you lose most in — the review screen ranks them for you.",
    bands: [
      { upTo: 3, word: "Tight lines" },
      { upTo: 8, word: "Leaking" },
      { upTo: 1000, word: "Costly" },
    ],
  },
  {
    id: "aggression",
    name: "Aggression",
    unit: "",
    decimals: 1,
    what: "How often you bet or raise compared with how often you call. A higher number means you take the lead more than you follow it.",
    improve:
      "Aim for 2.0–3.0 after the flop. If you are below 1.5, the usual cause is checking back strong hands that should be betting for value.",
    bands: [
      { upTo: 1.4, word: "Passive" },
      { upTo: 3.0, word: "Balanced" },
      { upTo: 100, word: "Over-aggressive" },
    ],
  },
];

const BY_ID = new Map(GLOSSARY.map((e) => [e.id, e]));

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

/** The plain-word verdict for a value — "33% — Loose". */
export function verdictFor(entry: GlossaryEntry, value: number): string {
  for (const band of entry.bands) {
    if (value <= band.upTo) return band.word;
  }
  return entry.bands[entry.bands.length - 1]?.word ?? "";
}

export function formatStat(entry: GlossaryEntry, value: number): string {
  return `${value.toFixed(entry.decimals)}${entry.unit}`;
}
