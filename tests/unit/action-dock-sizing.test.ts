/**
 * The ActionDock expander's arithmetic, as arithmetic.
 *
 * Presets are TO-amounts computed from the pot and clamped into the engine's
 * legal [minTo, maxTo] window. A preset that escapes the window is an illegal
 * action offered as a button, which the server would reject after the tap —
 * the worst possible place to discover it.
 */

import { describe, expect, it } from "vitest";
import { clampSize, formatBb, sizePresets, SIZE_STEP_BB } from "@/components/poker/surface/sizing";

describe("clampSize", () => {
  it("rounds to the half-bb step", () => {
    expect(clampSize(3.26, 0, 100)).toBe(3.5);
    expect(clampSize(3.24, 0, 100)).toBe(3);
  });

  it("clamps below min up to min", () => {
    expect(clampSize(1, 4.5, 100)).toBe(4.5);
  });

  it("clamps above max down to max", () => {
    expect(clampSize(250, 4.5, 100)).toBe(100);
  });

  it("the slider step is half a big blind", () => {
    expect(SIZE_STEP_BB).toBe(0.5);
  });
});

describe("sizePresets", () => {
  it("renders all six chips in order", () => {
    const presets = sizePresets({ minTo: 2, maxTo: 100, potBb: 12 });
    expect(presets.map((p) => p.label)).toEqual([
      "Min",
      "⅓ Pot",
      "½ Pot",
      "¾ Pot",
      "Pot",
      "All-in",
    ]);
  });

  it("computes pot fractions as TO-amounts on the half-bb step", () => {
    const presets = sizePresets({ minTo: 2, maxTo: 100, potBb: 12 });
    const byId = new Map(presets.map((p) => [p.id, p.amountBb]));
    expect(byId.get("min")).toBe(2);
    expect(byId.get("third_pot")).toBe(4); // 12 / 3
    expect(byId.get("half_pot")).toBe(6);
    expect(byId.get("three_quarter_pot")).toBe(9);
    expect(byId.get("pot")).toBe(12);
    expect(byId.get("allin")).toBe(100);
  });

  it("clamps presets below min up to min", () => {
    // Pot 6 with a 4.5 min: a third of the pot (2) is not a legal raise.
    const presets = sizePresets({ minTo: 4.5, maxTo: 100, potBb: 6 });
    const byId = new Map(presets.map((p) => [p.id, p.amountBb]));
    expect(byId.get("third_pot")).toBe(4.5);
    expect(byId.get("half_pot")).toBe(4.5);
  });

  it("clamps presets above max down to max (short stack)", () => {
    const presets = sizePresets({ minTo: 2, maxTo: 8, potBb: 20 });
    const byId = new Map(presets.map((p) => [p.id, p.amountBb]));
    expect(byId.get("pot")).toBe(8);
    expect(byId.get("three_quarter_pot")).toBe(8);
    expect(byId.get("allin")).toBe(8);
  });

  it("every preset is always inside the legal window", () => {
    for (const potBb of [0.5, 3, 6.5, 22, 180]) {
      for (const [minTo, maxTo] of [
        [2, 100],
        [4.5, 9],
        [1, 1.5],
      ] as const) {
        for (const preset of sizePresets({ minTo, maxTo, potBb })) {
          expect(preset.amountBb).toBeGreaterThanOrEqual(minTo);
          expect(preset.amountBb).toBeLessThanOrEqual(maxTo);
        }
      }
    }
  });
});

describe("formatBb", () => {
  it("drops the decimal on whole numbers and keeps it on halves", () => {
    expect(formatBb(12)).toBe("12bb");
    expect(formatBb(2.5)).toBe("2.5bb");
    expect(formatBb(0.5)).toBe("0.5bb");
  });
});
