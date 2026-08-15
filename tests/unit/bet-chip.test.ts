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
    expect(betAmountOf("opens 5")).toBe("5");
  });

  it("takes the LAST figure, not the first", () => {
    // "3bets to 22" contains a 3. A chip reading 3 in front of somebody who
    // just made it twenty-two misprices the call for the player being asked.
    // Without the old "bb" suffix this is the regex's whole job.
    expect(betAmountOf("3bets to 22")).toBe("22");
    expect(betAmountOf("4bets to 44")).toBe("44");
  });

  it("puts no chip on an action that committed nothing", () => {
    for (const action of ["checks", "folds", "calls", "to act", null]) {
      expect(betAmountOf(action), `${String(action)}`).toBeNull();
      expect(committedChips(action)).toBe(false);
    }
  });

  it("ignores a figure glued to a word", () => {
    // Percentage sizings — "bets 66%" — are not chip amounts, and the digits in
    // "3bets" are part of the verb. Neither may reach a chip.
    expect(betAmountOf("bets 66%")).toBeNull();
    expect(betAmountOf("3bets")).toBeNull();
    expect(betAmountOf("4bets")).toBeNull();
  });

  it("reads an amount at the end of the line or mid-sentence alike", () => {
    expect(betAmountOf("raises to 18")).toBe("18");
    expect(betAmountOf("bets 12 into 20")).toBe("20");
  });

  it("agrees with committedChips", () => {
    for (const action of ["opens 5", "3bets to 22", "checks", "calls"]) {
      expect(committedChips(action)).toBe(betAmountOf(action) !== null);
    }
  });
});

describe("actionVerb", () => {
  it("strips the figure the chip already carries", () => {
    expect(actionVerb("opens 5")).toBe("opens");
    expect(actionVerb("3bets to 22")).toBe("3bets");
    expect(actionVerb("4bets to 44")).toBe("4bets");
  });

  it("leaves an action that has no figure alone", () => {
    for (const action of ["checks", "calls", "to act", "bets 66%"]) {
      expect(actionVerb(action)).toBe(action);
    }
  });

  it("never returns an empty badge", () => {
    // A bare "22" would strip to nothing and render an empty pill, which
    // reads as a rendering bug rather than as an action.
    expect(actionVerb("22")).toBe("22");
  });

  it("keeps the verb and the amount in step", () => {
    // The pair is the contract: whatever the badge drops, the chip shows.
    const action = "3bets to 22";
    expect(actionVerb(action)).toBe("3bets");
    expect(betAmountOf(action)).toBe("22");
  });
});
