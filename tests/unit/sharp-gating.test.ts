/**
 * Sharp is a grade almost nobody can earn yet.
 *
 * It requires 30 recorded attempts on the node from a real population
 * (SHARP_MIN_ATTEMPTS), and today the drill and daily grading paths pass no
 * nodeStats at all — so on a young product the grade cannot fire. UI that
 * advertises it anyway ("Sharp: 0", a reserved tile) is a promise the product
 * cannot keep, so sharp affordances must not render before a sharp exists.
 *
 * This file pins the half of that rule that lives in shared code: the share
 * grid. The Wordle-style share text must not advertise sharp as a distinct
 * tile — sharp collapses into best's tile, so a share posted today and a share
 * posted after sharp becomes attainable read the same, and no tile ever
 * promises a grade the reader cannot earn.
 */

import { describe, expect, it } from "vitest";
import { buildShareText, type DailySpotResult } from "../../src/lib/daily";

function results(grades: readonly DailySpotResult["grade"][]): DailySpotResult[] {
  return grades.map((grade, spotIndex) => ({ spotIndex, grade, evLoss: 0, timeMs: 1000 }));
}

describe("the share grid does not advertise sharp", () => {
  it("renders sharp and best as the same tile", () => {
    const withSharp = buildShareText({
      dayNumber: 42,
      results: results(["sharp", "best", "solid", "inaccuracy", "blunder"]),
      streak: 3,
    });
    const withBest = buildShareText({
      dayNumber: 42,
      results: results(["best", "best", "solid", "inaccuracy", "blunder"]),
      streak: 3,
    });

    // Same score (sharp scores as best) and same grid: nothing in the share
    // output claims a sharp happened, so nothing dangles a grade that is not
    // attainable yet in front of the group chat.
    expect(withSharp).toBe(withBest);
  });

  it("never emits a tile that appears only for sharp", () => {
    const all = (["sharp", "best", "solid", "inaccuracy", "mistake", "blunder"] as const).map(
      (grade) => buildShareText({ dayNumber: 1, results: results([grade]), streak: 0 }),
    );
    const sharpLine = all[0]!;
    const otherTiles = new Set(all.slice(1).flatMap((text) => [...text]));

    // Every character in the sharp share already appears in some other grade's
    // share — sharp has no glyph of its own to advertise.
    for (const char of sharpLine) {
      expect(otherTiles.has(char), `sharp-only glyph "${char}" in share text`).toBe(true);
    }
  });
});
