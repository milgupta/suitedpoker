/**
 * The grid's canonical layout and its proportional fills.
 *
 * Both are asserted arithmetically rather than by measuring pixels: a grid
 * whose cells are in the wrong place is wrong at every screen size, and a fill
 * that does not match its frequency is wrong regardless of how it renders.
 */

import { describe, expect, it } from "vitest";
import { cellBands, type CellStrategy } from "../../src/components/poker/RangeGrid";
import { GRID_SIZE, HAND_KEYS, HAND_KEY_COUNT, handKeyIndex } from "../../src/poker/range";

const at = (row: number, col: number): string => HAND_KEYS[row * GRID_SIZE + col] ?? "";

describe("canonical grid positions", () => {
  it("has exactly 169 cells", () => {
    expect(HAND_KEYS).toHaveLength(HAND_KEY_COUNT);
    expect(HAND_KEY_COUNT).toBe(GRID_SIZE * GRID_SIZE);
  });

  it("puts the four corners exactly where the plan says", () => {
    expect(at(0, 0)).toBe("AA");
    expect(at(0, 12)).toBe("A2s");
    expect(at(12, 0)).toBe("A2o");
    expect(at(12, 12)).toBe("22");
  });

  it("runs pairs down the diagonal", () => {
    const pairs = ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22"];
    for (let i = 0; i < GRID_SIZE; i++) {
      expect(at(i, i)).toBe(pairs[i]);
    }
  });

  it("puts suited hands above the diagonal and offsuit below", () => {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const key = at(row, col);
        if (row === col) expect(key).toHaveLength(2);
        else if (row < col) expect(key.endsWith("s"), `${key} at [${row}][${col}]`).toBe(true);
        else expect(key.endsWith("o"), `${key} at [${row}][${col}]`).toBe(true);
      }
    }
  });

  it("agrees with the engine's own index function", () => {
    for (const [index, key] of HAND_KEYS.entries()) {
      expect(handKeyIndex(key)).toBe(index);
    }
  });

  it("contains no duplicates", () => {
    expect(new Set(HAND_KEYS).size).toBe(HAND_KEY_COUNT);
  });
});

describe("proportional fills", () => {
  it("matches the underlying frequencies exactly", () => {
    const bands = cellBands({ raise: 0.62, fold: 0.38 });
    const raise = bands.find((b) => b.action === "raise");
    const fold = bands.find((b) => b.action === "fold");

    expect(raise?.height).toBeCloseTo(62, 10);
    expect(fold?.height).toBeCloseTo(38, 10);
  });

  it("always sums to 100%", () => {
    const cells: CellStrategy[] = [
      { raise: 1 },
      { raise: 0.5, call: 0.3, fold: 0.2 },
      { call: 0.71, fold: 0.29 },
      { raise: 0.03, call: 0.52, fold: 0.45 },
    ];

    for (const cell of cells) {
      const total = cellBands(cell).reduce((sum, b) => sum + b.height, 0);
      expect(total).toBeCloseTo(100, 10);
    }
  });

  it("normalises frequencies that do not already sum to one", () => {
    // Authored data is not guaranteed to be perfectly normalised, and a cell
    // that renders to 97% height would read as a rendering bug.
    const bands = cellBands({ raise: 0.6, fold: 0.3 });
    expect(bands.reduce((sum, b) => sum + b.height, 0)).toBeCloseTo(100, 10);
    expect(bands.find((b) => b.action === "raise")?.height).toBeCloseTo(66.667, 2);
  });

  it("drops zero-frequency actions rather than rendering a zero-height band", () => {
    const bands = cellBands({ raise: 1, fold: 0 });
    expect(bands.map((b) => b.action)).toEqual(["raise"]);
  });

  it("returns nothing for a hand outside the range", () => {
    expect(cellBands(undefined)).toEqual([]);
    expect(cellBands({})).toEqual([]);
    expect(cellBands({ fold: 0 })).toEqual([]);
  });

  it("orders aggressive actions before passive ones", () => {
    // The bands stack from the bottom, so raise must come first for a mixed
    // hand to read as "filled from the bottom".
    const bands = cellBands({ fold: 0.3, call: 0.2, raise: 0.5 });
    expect(bands.map((b) => b.action)).toEqual(["raise", "call", "fold"]);
  });

  it("takes fold's colour from the transparent token, not a grade", () => {
    // Blue is interface; a range grid is reference data and must never borrow
    // the grade ramp.
    const bands = cellBands({ raise: 0.5, fold: 0.5 });
    for (const band of bands) {
      expect(band.colour).not.toContain("grade");
    }
    expect(bands.find((b) => b.action === "fold")?.colour).toBe("transparent");
  });
});
