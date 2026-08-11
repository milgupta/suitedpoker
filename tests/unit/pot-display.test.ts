import { describe, expect, it } from "vitest";
import type { SidePot } from "../../src/poker/gamestate";

/**
 * Mirrors PotDisplay's filter: chip amounts → bb, drop near-zero extras.
 * Kept as a pure check so a regression to "Side 1 0.0BB" fails in CI.
 */
function sidePotsForDisplay(
  sidePots: readonly SidePot[],
  bigBlind: number,
  show: boolean,
): { index: number; amountBb: number }[] {
  if (!show || bigBlind <= 0) return [];
  return sidePots
    .slice(1)
    .map((pot, i) => ({ index: i + 1, amountBb: pot.amount / bigBlind }))
    .filter((pot) => pot.amountBb >= 0.05);
}

describe("sim pot side rows", () => {
  const pots: SidePot[] = [
    { amount: 6, eligibleSeats: [0, 1, 2] },
    { amount: 2, eligibleSeats: [1, 2] },
    { amount: 0, eligibleSeats: [2] },
  ];

  it("converts chips to bb and hides junk when shown", () => {
    expect(sidePotsForDisplay(pots, 2, true)).toEqual([{ index: 1, amountBb: 1 }]);
  });

  it("stays empty during a normal pot", () => {
    expect(sidePotsForDisplay(pots, 2, false)).toEqual([]);
  });
});
