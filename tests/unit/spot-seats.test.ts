/**
 * Who is folded, who acted, and who is still to speak.
 *
 * The drill table draws a chair for every seat, so this arithmetic is a claim
 * about the hand rather than decoration: a table that dims the wrong seat is
 * telling the player somebody is out of the hand when they are not, which is
 * worse than the wall of text it replaced.
 */

import { describe, expect, it } from "vitest";
import { PREFLOP_ORDER, seatActivity } from "../../src/lib/spot-seats";

describe("seatActivity", () => {
  it("folds everyone in front of the hero in an unopened pot", () => {
    // "folded to hero" names no position — the folds are inferred from turn
    // order, exactly as a player reads a real table.
    const seats = seatActivity("CO", ["folded to hero"]);

    expect(seats.UTG.folded).toBe(true);
    expect(seats.MP.folded).toBe(true);
    expect(seats.CO.folded).toBe(false);
    expect(seats.BTN.folded).toBe(false);
    expect(seats.SB.folded).toBe(false);
    expect(seats.BB.folded).toBe(false);
  });

  it("leaves the seats behind the hero still to act", () => {
    const seats = seatActivity("CO", ["folded to hero"]);

    expect(seats.BTN.toAct).toBe(true);
    expect(seats.SB.toAct).toBe(true);
    expect(seats.BB.toAct).toBe(true);
    expect(seats.UTG.toAct).toBe(false);
    expect(seats.CO.toAct).toBe(false);
  });

  it("pins an action to the seat that made it", () => {
    const seats = seatActivity("BB", ["UTG opens 2.5bb"]);

    expect(seats.UTG.action).toBe("opens 2.5bb");
    expect(seats.UTG.folded).toBe(false);
    // Named, so not inferred as a fold even though UTG is in front of the hero.
    expect(seats.MP.folded).toBe(true);
    expect(seats.CO.folded).toBe(true);
  });

  it("gives the hero its own action when the hero has already acted", () => {
    // vs_3bet nodes carry the hero's open in the history.
    const seats = seatActivity("MP", ["MP opens 2.5bb", "BTN 3bets to 11bb"]);

    expect(seats.MP.action).toBe("opens 2.5bb");
    expect(seats.BTN.action).toBe("3bets to 11bb");
    expect(seats.UTG.folded).toBe(true);
    // A seat that acted is never marked to-act, whichever side of the hero.
    expect(seats.BTN.toAct).toBe(false);
  });

  it("keeps the LAST action when a seat acts twice", () => {
    // A postflop template's history: the same player opens, then checks.
    const seats = seatActivity("BTN", ["BTN opens 2.5bb", "BB calls", "BB checks"]);

    expect(seats.BB.action).toBe("checks");
    expect(seats.BTN.action).toBe("opens 2.5bb");
  });

  it("ignores a line that names no seat", () => {
    const seats = seatActivity("BTN", ["folded to hero", "everyone checks"]);
    for (const position of PREFLOP_ORDER) {
      expect(seats[position].action).toBeNull();
    }
  });

  it("covers every position with no undefined holes", () => {
    // The table iterates PREFLOP_ORDER; a missing key would crash a seat.
    const seats = seatActivity("SB", ["CO opens 2.5bb"]);
    for (const position of PREFLOP_ORDER) {
      expect(seats[position], `${position} missing`).toBeDefined();
    }
  });

  it("never marks a seat both folded and still to act", () => {
    for (const hero of PREFLOP_ORDER) {
      const seats = seatActivity(hero, ["folded to hero"]);
      for (const position of PREFLOP_ORDER) {
        const seat = seats[position];
        expect(seat.folded && seat.toAct, `${hero} hero, ${position} is both`).toBe(false);
      }
    }
  });

  it("never folds the hero", () => {
    for (const hero of PREFLOP_ORDER) {
      expect(seatActivity(hero, ["folded to hero"])[hero].folded).toBe(false);
    }
  });
});
