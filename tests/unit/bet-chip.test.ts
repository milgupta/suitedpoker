/**
 * The number that ends up on a chip in front of a player.
 *
 * A chip is read as "this is what the pot costs me", so a wrong figure there is
 * a wrong price on the decision the whole screen exists to ask about — worse
 * than no chip, because it looks authoritative.
 */

import { describe, expect, it } from "vitest";
import { actionVerb, betAmountOf, committedChips } from "../../src/lib/bet-chip";

describe("betAmountOf", () => {
  it("reads a simple open", () => {
    expect(betAmountOf("opens 2.5bb")).toBe("2.5bb");
  });

  it("takes the LAST figure, not the first", () => {
    // "3bets to 11bb" contains a 3. A chip reading 3bb in front of somebody who
    // just made it eleven misprices the call for the player being asked.
    expect(betAmountOf("3bets to 11bb")).toBe("11bb");
    expect(betAmountOf("4bets to 22bb")).toBe("22bb");
  });

  it("puts no chip on an action that committed nothing", () => {
    for (const action of ["checks", "folds", "calls", "to act", null]) {
      expect(betAmountOf(action), `${String(action)}`).toBeNull();
      expect(committedChips(action)).toBe(false);
    }
  });

  it("ignores a bare number with no unit", () => {
    // Percentage sizings — "bets 66%" — are not big blinds and must not be
    // printed as though they were.
    expect(betAmountOf("bets 66%")).toBeNull();
  });

  it("is case-insensitive about the unit", () => {
    expect(betAmountOf("opens 2.5BB")).toBe("2.5bb");
  });

  it("agrees with committedChips", () => {
    for (const action of ["opens 2.5bb", "3bets to 11bb", "checks", "calls"]) {
      expect(committedChips(action)).toBe(betAmountOf(action) !== null);
    }
  });
});

describe("actionVerb", () => {
  it("strips the figure the chip already carries", () => {
    expect(actionVerb("opens 2.5bb")).toBe("opens");
    expect(actionVerb("3bets to 11bb")).toBe("3bets");
    expect(actionVerb("4bets to 22bb")).toBe("4bets");
  });

  it("leaves an action that has no figure alone", () => {
    for (const action of ["checks", "calls", "to act", "bets 66%"]) {
      expect(actionVerb(action)).toBe(action);
    }
  });

  it("never returns an empty badge", () => {
    // A bare "11bb" would strip to nothing and render an empty pill, which
    // reads as a rendering bug rather than as an action.
    expect(actionVerb("11bb")).toBe("11bb");
  });

  it("keeps the verb and the amount in step", () => {
    // The pair is the contract: whatever the badge drops, the chip shows.
    const action = "3bets to 11bb";
    expect(actionVerb(action)).toBe("3bets");
    expect(betAmountOf(action)).toBe("11bb");
  });
});
