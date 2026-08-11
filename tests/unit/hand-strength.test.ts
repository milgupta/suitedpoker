/**
 * The hero dock's hand-strength label, exhaustively.
 *
 * Every label the component can print is produced here from real cards, and
 * the best-five extraction is checked against the evaluator itself: the five
 * returned must actually evaluate to the same hand as the full seven. A label
 * that is fluent and wrong is the exact failure this module exists to prevent.
 */

import { describe, expect, it } from "vitest";
import {
  cardsFromString,
  cardsToString,
  createRng,
  FULL_DECK,
  shuffleInPlace,
  type Card,
} from "@/poker/cards";
import { evaluate5, evaluateHand } from "@/poker/evaluator";
import { handStrength, HAND_STRENGTH_LABELS } from "@/poker/hand-strength";

function strength(hole: string, board: string) {
  return handStrength(cardsFromString(hole), cardsFromString(board));
}

function names(cards: readonly Card[]): string[] {
  return cardsToString(cards).split(" ").filter(Boolean);
}

describe("preflop (2 cards)", () => {
  it("labels a pocket pair as Pair, best five = both cards", () => {
    const s = strength("Ah Ad", "");
    expect(s.label).toBe("Pair");
    expect(names(s.bestFive).sort()).toEqual(["Ad", "Ah"]);
  });

  it("labels unpaired cards as High card, best five = the high card", () => {
    const s = strength("Ah Kd", "");
    expect(s.label).toBe("High card");
    expect(names(s.bestFive)).toEqual(["Ah"]);
  });

  it("picks the higher card of an unpaired hand", () => {
    const s = strength("2c Td", "");
    expect(names(s.bestFive)).toEqual(["Td"]);
  });
});

describe("partial boards (3-4 cards total)", () => {
  it("finds a pair using the board", () => {
    const s = strength("Ah Kd", "Kc");
    expect(s.label).toBe("Pair");
    expect(names(s.bestFive).sort()).toEqual(["Kc", "Kd"]);
  });

  it("finds trips across hole and board", () => {
    const s = strength("Ah Ad", "Ac 7s");
    expect(s.label).toBe("Three of a kind");
    expect(names(s.bestFive).sort()).toEqual(["Ac", "Ad", "Ah"]);
  });

  it("finds two pair with four cards", () => {
    const s = strength("Ah Ad", "Kc Kd");
    expect(s.label).toBe("Two pair");
    expect(names(s.bestFive).sort()).toEqual(["Ad", "Ah", "Kc", "Kd"]);
  });

  it("finds four of a kind with four cards", () => {
    const s = strength("Ah Ad", "Ac As");
    expect(s.label).toBe("Four of a kind");
    expect(names(s.bestFive).sort()).toEqual(["Ac", "Ad", "Ah", "As"]);
  });

  it("never claims a straight or flush before five cards exist", () => {
    // Three hearts in a row — still just high card with under five cards.
    expect(strength("Ah Kh", "Qh 2c").label).toBe("High card");
  });
});

describe("made hands at five or more cards", () => {
  it("labels every category in beginner vocabulary", () => {
    const cases: Array<[string, string, string]> = [
      ["Ah Kd", "Qc 7s 2d", "High card"],
      ["Ah Kd", "Kc 7s 2d", "Pair"],
      ["Ah Kd", "Ac Kh 2d", "Two pair"],
      ["Ah Ad", "Ac 7s 2d", "Three of a kind"],
      ["5h 6d", "7c 8d 9s", "Straight"],
      ["Ah 9h", "Kh 5h 2h", "Flush"],
      ["Ah Ad", "Ac Kh Kd", "Full house"],
      ["Ah Ad", "Ac As 2d", "Four of a kind"],
      ["5h 6h", "7h 8h 9h", "Straight flush"],
      ["Ah Kh", "Qh Jh Th", "Royal flush"],
    ];
    for (const [hole, board, label] of cases) {
      expect(strength(hole, board).label).toBe(label);
    }
  });

  it("labels the wheel a Straight, and the steel wheel a Straight flush — never Royal", () => {
    expect(strength("Ah 2d", "3c 4d 5s").label).toBe("Straight");
    expect(strength("Ah 2h", "3h 4h 5h").label).toBe("Straight flush");
  });

  it("extracts the flush's five from six suited cards", () => {
    // Six hearts: the 2h must be the one left out.
    const s = strength("Ah 9h", "Kh 5h 2h 7h 3d");
    expect(s.label).toBe("Flush");
    expect(names(s.bestFive).sort()).toEqual(["5h", "7h", "9h", "Ah", "Kh"]);
  });

  it("keeps the right kicker for two pair from seven cards", () => {
    const s = strength("Ah Ad", "Kc Kd 7s 3c 2d");
    expect(s.label).toBe("Two pair");
    expect(names(s.bestFive).sort()).toEqual(["7s", "Ad", "Ah", "Kc", "Kd"]);
  });

  it("takes the five highest for a seven-card high card", () => {
    const s = strength("Ah Kd", "Qc 9s 7d 4c 2h");
    expect(names(s.bestFive).sort()).toEqual(["7d", "9s", "Ah", "Kd", "Qc"]);
  });

  it("prefers the straight on a paired board when it is best", () => {
    const s = strength("5h 6d", "7c 8d 9s 9d 2c");
    expect(s.label).toBe("Straight");
  });
});

describe("agreement with the evaluator over random deals", () => {
  it("best five always re-evaluates to the same hand value as all seven", () => {
    const rng = createRng("hand-strength-differential");
    for (let round = 0; round < 300; round++) {
      const deck = shuffleInPlace([...FULL_DECK], rng);
      const hole = deck.slice(0, 2);
      const board = deck.slice(2, 7);
      const s = handStrength(hole, board);

      expect(s.bestFive).toHaveLength(5);
      const all = new Set([...hole, ...board]);
      for (const card of s.bestFive) expect(all.has(card)).toBe(true);
      expect(evaluate5(s.bestFive)).toBe(evaluateHand([...hole, ...board]));
    }
  });

  it("label always matches the evaluated category (or Royal flush upgrades it)", () => {
    const rng = createRng("hand-strength-labels");
    const seen = new Set<string>();
    for (let round = 0; round < 2000; round++) {
      const deck = shuffleInPlace([...FULL_DECK], rng);
      const hole = deck.slice(0, 2);
      const board = deck.slice(2, 7);
      const s = handStrength(hole, board);
      const known = new Set([...Object.values(HAND_STRENGTH_LABELS), "Royal flush"]);
      expect(known.has(s.label)).toBe(true);
      seen.add(s.label);
    }
    // Random deals must at least produce the common categories.
    for (const label of ["High card", "Pair", "Two pair", "Three of a kind"]) {
      expect(seen.has(label)).toBe(true);
    }
  });
});

describe("input validation", () => {
  it("rejects the wrong number of hole cards", () => {
    expect(() => handStrength(cardsFromString("Ah"), [])).toThrow(RangeError);
    expect(() => handStrength(cardsFromString("Ah Kd Qc"), [])).toThrow(RangeError);
  });

  it("rejects more than five board cards", () => {
    expect(() =>
      handStrength(cardsFromString("Ah Kd"), cardsFromString("2c 3c 4c 5c 6c 7c")),
    ).toThrow(RangeError);
  });
});
