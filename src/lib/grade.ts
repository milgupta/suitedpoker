/**
 * The six grades, and the mark each one carries alongside its colour.
 *
 * DESIGN.md rule 4: colour is never the only signal. Roughly 8% of men have
 * red-green colour deficiency and this audience is overwhelmingly male, so
 * every grade ships an icon AND a word. A screenshot rendered in greyscale must
 * still be readable.
 */

export const GRADES = ["sharp", "best", "solid", "inaccuracy", "mistake", "blunder"] as const;

export type Grade = (typeof GRADES)[number];

export interface GradeMark {
  /** The word shown to the user. */
  readonly label: string;
  /** The glyph shown beside it. */
  readonly icon: string;
  /** Custom property holding the solid colour. */
  readonly token: string;
}

export const GRADE_MARKS: Record<Grade, GradeMark> = {
  sharp: { label: "Sharp", icon: "⚡", token: "--color-grade-sharp" },
  best: { label: "Best", icon: "✓", token: "--color-grade-best" },
  solid: { label: "Solid", icon: "✓", token: "--color-grade-solid" },
  inaccuracy: { label: "Inaccuracy", icon: "?!", token: "--color-grade-inaccuracy" },
  mistake: { label: "Mistake", icon: "?", token: "--color-grade-mistake" },
  blunder: { label: "Blunder", icon: "??", token: "--color-grade-blunder" },
};
