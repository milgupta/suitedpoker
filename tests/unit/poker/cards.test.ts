import { describe, expect, it } from "vitest";

import {
  type Card,
  cardFromString,
  cardsFromString,
  cardsToString,
  cardToString,
  createRng,
  DECK_SIZE,
  Deck,
  FULL_DECK,
  isCard,
  makeCard,
  randomInt,
  rankCharOf,
  rankOf,
  suitCharOf,
  suitOf,
  tryCardFromString,
} from "@/poker/cards";

describe("card packing", () => {
  it("round-trips every card in the deck through its string form", () => {
    for (const card of FULL_DECK) {
      expect(cardFromString(cardToString(card))).toBe(card);
    }
  });

  it("packs 52 distinct cards", () => {
    expect(new Set(FULL_DECK).size).toBe(DECK_SIZE);
    expect(FULL_DECK.every((c) => isCard(c))).toBe(true);
  });

  it("exposes rank and suit accessors", () => {
    const ace = cardFromString("Ah");
    expect(rankOf(ace)).toBe(12);
    expect(suitOf(ace)).toBe(2);
    expect(rankCharOf(ace)).toBe("A");
    expect(suitCharOf(ace)).toBe("h");

    const deuce = cardFromString("2c");
    expect(rankOf(deuce)).toBe(0);
    expect(suitOf(deuce)).toBe(0);
  });

  it("accepts mixed case", () => {
    expect(cardFromString("ah")).toBe(cardFromString("Ah"));
    expect(cardFromString("AH")).toBe(cardFromString("Ah"));
  });

  it("rejects nonsense", () => {
    expect(tryCardFromString("Xh")).toBeUndefined();
    expect(tryCardFromString("Az")).toBeUndefined();
    expect(tryCardFromString("A")).toBeUndefined();
    expect(() => cardFromString("Xh")).toThrow();
    expect(() => makeCard(13, 0)).toThrow();
    expect(() => makeCard(0, 4)).toThrow();
  });
});

describe("notation", () => {
  it("parses hands and boards in every common spacing", () => {
    const expected = cardsFromString("AhKd7c");
    expect(cardsFromString("Ah Kd 7c")).toEqual(expected);
    expect(cardsFromString("Ah,Kd,7c")).toEqual(expected);
    expect(cardsFromString("  Ah  Kd 7c ")).toEqual(expected);
  });

  it("formats a board back out", () => {
    expect(cardsToString(cardsFromString("AhKd7c"))).toBe("Ah Kd 7c");
    expect(cardsFromString("")).toEqual([]);
  });

  it("rejects duplicate cards, because a typo there corrupts every equity below it", () => {
    expect(() => cardsFromString("AhAh")).toThrow(/duplicate/);
    expect(() => cardsFromString("Ah Kd Ah")).toThrow(/duplicate/);
  });

  it("rejects an odd-length card string", () => {
    expect(() => cardsFromString("AhK")).toThrow(/odd length/);
  });
});

describe("seeded rng", () => {
  it("is reproducible from the seed alone", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it("accepts string seeds", () => {
    const a = createRng("spot:btn-rfi:42");
    const b = createRng("spot:btn-rfi:42");
    const c = createRng("spot:btn-rfi:43");
    expect(a()).toBe(b());
    expect(a()).not.toBe(c());
  });

  it("stays in [0, 1)", () => {
    const rng = createRng(7);
    let outOfRange = 0;
    for (let i = 0; i < 100_000; i++) {
      const value = rng();
      if (value < 0 || value >= 1) outOfRange++;
    }
    expect(outOfRange).toBe(0);
  });

  it("produces uniform integers", () => {
    const rng = createRng(99);
    const counts = new Array<number>(6).fill(0);
    const draws = 600_000;
    let outOfRange = 0;
    for (let i = 0; i < draws; i++) {
      const value = randomInt(rng, 6);
      if (value < 0 || value >= 6) outOfRange++;
      counts[value] = (counts[value] ?? 0) + 1;
    }
    expect(outOfRange).toBe(0);
    for (const count of counts) {
      expect(Math.abs(count / draws - 1 / 6)).toBeLessThan(0.005);
    }
  });
});

describe("deck", () => {
  it("produces an identical shuffle for the same seed across runs", () => {
    const a = new Deck(2024).peek();
    const b = new Deck(2024).peek();
    expect(cardsToString(a)).toBe(cardsToString(b));

    // Pinned literal: a future change to the RNG or the shuffle would silently
    // invalidate every stored drill seed, so it has to break a test instead.
    expect(cardsToString(new Deck(1).peek(5))).toMatchInlineSnapshot(`"8c Kc 7s 4h Qs"`);
  });

  it("produces a different shuffle for a different seed", () => {
    expect(cardsToString(new Deck(1).peek())).not.toBe(cardsToString(new Deck(2).peek()));
  });

  it("is a permutation of the full deck", () => {
    const deck = new Deck(55);
    const dealt = deck.deal(DECK_SIZE);
    expect(new Set(dealt).size).toBe(DECK_SIZE);
    expect([...dealt].sort((x, y) => x - y)).toEqual([...FULL_DECK]);
    expect(deck.remaining).toBe(0);
  });

  it("deals sequentially and tracks what is left", () => {
    const deck = new Deck(3);
    const first = deck.deal(2);
    const second = deck.deal(3);
    expect(deck.dealtCount).toBe(5);
    expect(deck.remaining).toBe(47);
    expect(new Set([...first, ...second]).size).toBe(5);
    expect(() => deck.deal(48)).toThrow();
  });

  it("removes dead cards from the remainder", () => {
    const dead: Card[] = cardsFromString("AhAsKdKc");
    const deck = new Deck(11).removeCards(dead);
    expect(deck.remaining).toBe(48);
    const rest = deck.deal(48);
    for (const card of dead) expect(rest).not.toContain(card);
  });

  it("keeps dealt cards dealt across a reshuffle", () => {
    const deck = new Deck(4);
    const dealt = deck.deal(10);
    deck.shuffle(5);
    const rest = deck.deal(42);
    for (const card of dealt) expect(rest).not.toContain(card);
    expect(new Set([...dealt, ...rest]).size).toBe(DECK_SIZE);
  });

  it("resets to a canonical full deck", () => {
    const deck = new Deck(9);
    deck.deal(20);
    deck.reset();
    expect(deck.remaining).toBe(DECK_SIZE);
    expect(deck.peek()).toEqual([...FULL_DECK]);
  });
});
