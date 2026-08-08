/**
 * WCAG contrast gate for the design system.
 *
 * Every text-on-surface and accent-on-surface pairing the product actually uses
 * is measured against the real values in globals.css. A pairing below AA for
 * its intended use fails the build — DESIGN.md's rule is that the measured
 * ratio wins over the stated value, so this is where a colour gets adjusted
 * rather than excused.
 *
 * Thresholds: 4.5 for normal text, 3.0 for large text (>=18.66px bold or 24px)
 * and for non-text UI boundaries, per WCAG 2.1 AA.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/lib/color";
import { readColorTokens, readRawTokens, requireColor } from "../support/tokens";

const AA_TEXT = 4.5;
const AA_LARGE = 3.0;

const SURFACES = [
  "--color-canvas",
  "--color-canvas-deep",
  "--color-surface-1",
  "--color-surface-2",
  "--color-surface-3",
  "--color-glass",
] as const;

const GRADES = [
  "--color-grade-sharp",
  "--color-grade-best",
  "--color-grade-solid",
  "--color-grade-inaccuracy",
  "--color-grade-mistake",
  "--color-grade-blunder",
] as const;

interface Pairing {
  fg: string;
  bg: string;
  /** Opaque colour behind `bg`, for translucent fills. */
  backdrop?: string;
  use: string;
  min: number;
}

function buildPairings(): Pairing[] {
  const pairings: Pairing[] = [];

  // Body text at every level, on every surface it can land on.
  for (const bg of SURFACES) {
    for (const fg of ["--color-text-primary", "--color-text-secondary", "--color-text-tertiary"]) {
      pairings.push({ fg, bg, use: "body text", min: AA_TEXT });
    }
  }

  // Accent text. --accent-bright is the token for this; --accent is not, and is
  // only asserted at the large-text threshold to document that boundary.
  for (const bg of SURFACES) {
    pairings.push({ fg: "--color-accent-bright", bg, use: "link / accent text", min: AA_TEXT });
    pairings.push({ fg: "--color-accent", bg, use: "accent, LARGE text only", min: AA_LARGE });
  }

  // Fills: label on top of a filled control.
  pairings.push({
    fg: "--color-on-accent",
    bg: "--color-accent",
    use: "label on accent fill",
    min: AA_TEXT,
  });
  pairings.push({
    fg: "--color-on-accent",
    bg: "--color-accent-deep",
    use: "label on lit-button gradient top",
    min: AA_TEXT,
  });
  pairings.push({
    fg: "--color-canvas",
    bg: "--color-text-primary",
    use: "primary CTA — near-black on white",
    min: AA_TEXT,
  });

  // Danger is a UI colour, not a grade, and gets the same two-token treatment
  // as the accent: a fill you put white on, and a brighter one for text.
  pairings.push({
    fg: "--color-on-accent",
    bg: "--color-danger",
    use: "label on a destructive fill",
    min: AA_TEXT,
  });
  for (const bg of SURFACES) {
    pairings.push({ fg: "--color-danger-bright", bg, use: "destructive text", min: AA_TEXT });
  }
  pairings.push({
    fg: "--color-danger-bright",
    bg: "--color-danger-fill",
    backdrop: "--color-surface-1",
    use: "destructive text on its own 12% fill",
    min: AA_TEXT,
  });

  // Range grid cell labels sit on an accent fill or a bare surface depending on
  // the hand, so the same colour has to clear both.
  pairings.push({
    fg: "--color-on-accent",
    bg: "--color-surface-2",
    use: "range grid label on an unfilled cell",
    min: AA_TEXT,
  });

  // The deck. These live on a white card face, never on the canvas.
  for (const suit of ["hearts", "diamonds", "clubs", "spades"]) {
    pairings.push({
      fg: `--color-suit-${suit}`,
      bg: "--color-card-face",
      use: "suit glyph on a card face",
      min: AA_TEXT,
    });
  }

  // Grades as text, and as text on their own 12% fill.
  for (const grade of GRADES) {
    pairings.push({ fg: grade, bg: "--color-canvas", use: "grade text on canvas", min: AA_TEXT });
    pairings.push({
      fg: grade,
      bg: "--color-surface-1",
      use: "grade text on a card",
      min: AA_TEXT,
    });
    pairings.push({
      fg: grade,
      bg: `${grade}-fill`,
      backdrop: "--color-surface-1",
      use: "grade text on its own 12% fill",
      min: AA_TEXT,
    });
  }

  // Borders are non-text UI boundaries, but ours are deliberately faint hairlines
  // rather than the sole indicator of anything, so they are reported and not gated.
  return pairings;
}

describe("token extraction", () => {
  // Cross-checks the parser against a different method. A declaration always
  // starts a line; a comment line never does, because Prettier prefixes it with
  // `*`. A mismatch means the parser lost or invented a token — which it once
  // did, silently, by matching a token name written inside a comment.
  it("finds every token that starts a line in globals.css", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const parsed = readRawTokens();

    const declared = new Set<string>();
    for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)) {
      const name = match[1];
      if (name !== undefined) declared.add(name);
    }

    const missing = [...declared].filter((n) => !parsed.has(n));
    expect(missing, `parser lost: ${missing.join(", ")}`).toEqual([]);
    expect(declared.size).toBeGreaterThan(40);
  });
});

describe("design system contrast", () => {
  const colors = readColorTokens();
  const pairings = buildPairings();

  it("prints the full contrast table", () => {
    const rows = pairings.map((p) => {
      const ratio = contrastRatio(
        requireColor(p.fg, colors),
        requireColor(p.bg, colors),
        requireColor(p.backdrop ?? p.bg, colors),
      );
      return {
        fg: p.fg.replace("--color-", ""),
        bg: p.bg.replace("--color-", ""),
        use: p.use,
        ratio: Number(ratio.toFixed(2)),
        min: p.min,
        pass: ratio >= p.min ? "PASS" : "FAIL",
      };
    });

    console.table(rows);
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(pairings)("$fg on $bg meets $min:1 ($use)", (p) => {
    const ratio = contrastRatio(
      requireColor(p.fg, colors),
      requireColor(p.bg, colors),
      requireColor(p.backdrop ?? p.bg, colors),
    );
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(p.min);
  });

  it("requires white rather than --text-primary as the label on an accent fill", () => {
    const accent = requireColor("--color-accent", colors);
    expect(contrastRatio(requireColor("--color-text-primary", colors), accent)).toBeLessThan(
      AA_TEXT,
    );
    expect(contrastRatio(requireColor("--color-on-accent", colors), accent)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it("keeps --accent below AA for normal text, so the rule to use --accent-bright is real", () => {
    const ratio = contrastRatio(
      requireColor("--color-accent", colors),
      requireColor("--color-canvas", colors),
    );
    expect(ratio).toBeLessThan(AA_TEXT);
    expect(ratio).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
