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
import { loadSolutionData } from "../../src/lib/solution-data";
import { generateSpot } from "../../src/poker/generator";

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

  /*
   * The seats BETWEEN the hero and a later aggressor.
   *
   * These are the ones the old index comparison got wrong, and no test looked at
   * them: it asserted the hero and the 3-bettor and stopped. Everything in
   * between was drawn as still to act, which on a heads-up pot is three
   * opponents the player does not have.
   */
  describe("seats between the hero and a later aggressor", () => {
    it("folds the seats the action passed to reach a 3bet behind the hero", () => {
      // MP opens, BTN 3bets. For the action to be back on MP, CO passed before
      // the button and the blinds passed after it.
      const seats = seatActivity("MP", ["MP opens 2.5bb", "BTN 3bets to 11bb"]);

      expect(seats.CO.folded, "CO acts between MP and BTN").toBe(true);
      expect(seats.CO.toAct).toBe(false);
      expect(seats.SB.folded, "SB acts after the 3bet, before it returns").toBe(true);
      expect(seats.BB.folded, "BB acts after the 3bet, before it returns").toBe(true);
    });

    it("folds the blinds on a 4bet the hero faces", () => {
      const seats = seatActivity("BB", [
        "UTG opens 2.5bb",
        "BB 3bets to 11bb",
        "UTG 4bets to 22bb",
      ]);

      expect(seats.UTG.action).toBe("4bets to 22bb");
      for (const position of ["MP", "CO", "BTN", "SB"] as const) {
        expect(seats[position].folded, `${position} passed before the 3bet`).toBe(true);
      }
    });

    it("leaves nobody still to act once the action has come back round", () => {
      const seats = seatActivity("UTG", ["UTG opens 2.5bb", "BB 3bets to 11bb"]);
      for (const position of PREFLOP_ORDER) {
        expect(seats[position].toAct, `${position} cannot still be to act`).toBe(false);
      }
    });

    it("still leaves the blinds live when the hero faces an open in position", () => {
      // BTN facing an UTG open: MP and CO passed, but SB and BB have not spoken.
      const seats = seatActivity("BTN", ["UTG opens 2.5bb"]);

      expect(seats.MP.folded).toBe(true);
      expect(seats.CO.folded).toBe(true);
      expect(seats.SB.toAct).toBe(true);
      expect(seats.BB.toAct).toBe(true);
    });
  });

  /*
   * Every node the product actually deals, with the history the generator
   * actually writes.
   *
   * The hand-written cases above are the ones somebody thought to write down.
   * These are the ones that ship — and the defect they replace was found on a
   * `vs_3bet` spot nobody had written a case for, where three seats that had
   * already passed were drawn as live opponents.
   */
  describe("every served node", () => {
    const data = loadSolutionData();

    const spots = data.preflop.map((node, index) => ({
      node,
      spot: generateSpot(
        { type: "preflop", heroPos: node.heroPos, actionSeq: node.actionSeq },
        data,
        `seats:${String(index)}`,
      ),
    }));

    it("covers every actionSeq family the generator can produce", () => {
      const families = new Set(spots.map(({ node }) => node.actionSeq.split("_")[0]));
      expect([...families].sort()).toEqual(["rfi", "vs"]);
    });

    for (const { node, spot } of spots) {
      it(`reads ${node.ref} consistently`, () => {
        const seats = seatActivity(spot.heroPos, spot.actionHistory);

        expect(seats[spot.heroPos].folded, "the hero is never folded").toBe(false);
        expect(seats[spot.heroPos].toAct, "the hero is acting, not waiting").toBe(false);

        for (const position of PREFLOP_ORDER) {
          const seat = seats[position];
          expect(seat.folded && seat.toAct, `${position} is both folded and to act`).toBe(false);
          // A seat that has spoken cannot be waiting to speak for the first time.
          expect(seat.action !== null && seat.toAct, `${position} acted and is still to act`).toBe(
            false,
          );
          expect(seat.action !== null && seat.folded, `${position} acted and is folded`).toBe(
            false,
          );
        }
      });
    }

    it("leaves nobody to act on a node where the hero has already opened", () => {
      // The hero opened and somebody behind raised, so the action has passed
      // every seat once. Anyone drawn as live here is an opponent the player
      // does not have.
      for (const { node, spot } of spots) {
        if (!node.actionSeq.startsWith("vs_3bet")) continue;

        const seats = seatActivity(spot.heroPos, spot.actionHistory);
        const live = PREFLOP_ORDER.filter((position) => seats[position].toAct);
        expect(live, `${node.ref} still shows ${live.join(", ")} as live`).toEqual([]);
      }
    });

    it("keeps at least one seat live on an unopened pot in front of the blinds", () => {
      // The mirror of the check above. A generator that marked everybody as
      // done would pass every "nobody is wrongly live" assertion.
      const rfi = spots.find(({ node }) => node.ref === "UTG:rfi");
      expect(rfi).toBeDefined();

      const seats = seatActivity(rfi!.spot.heroPos, rfi!.spot.actionHistory);
      const live = PREFLOP_ORDER.filter((position) => seats[position].toAct);
      expect(live.length, "everyone behind UTG is still to act").toBe(5);
    });
  });
});
