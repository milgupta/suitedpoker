import { describe, expect, it } from "vitest";

import { type Card, cardsFromString, createRng, DECK_SIZE, FULL_DECK } from "@/poker/cards";
import {
  bestFive,
  categoryOf,
  compareHands,
  describeHand,
  evaluate5,
  evaluate7,
  evaluateHand,
  type HandCategory,
  HAND_CATEGORIES,
  type HandValue,
} from "@/poker/evaluator";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

function five(text: string): Card[] {
  const cards = cardsFromString(text);
  expect(cards).toHaveLength(5);
  return cards;
}

function seven(text: string): Card[] {
  const cards = cardsFromString(text);
  expect(cards).toHaveLength(7);
  return cards;
}

// ── 1. Hand-picked examples, every category and every adversarial case ────────

describe("evaluate5 categories", () => {
  const cases: Array<[string, HandCategory, string]> = [
    ["Ah Kh Qh Jh Th", "straight_flush", "royal"],
    ["5h 4h 3h 2h Ah", "straight_flush", "wheel straight flush — the ace plays low"],
    ["9h 8h 7h 6h 5h", "straight_flush", "mid straight flush"],
    ["7c 7d 7h 7s 2c", "quads", "quads"],
    ["7c 7d 7h 2s 2c", "full_house", "full house"],
    ["Ah Qh 9h 5h 3h", "flush", "ace-high flush, NOT a straight flush"],
    ["Ah Kd Qc Js Th", "straight", "broadway"],
    ["5h 4d 3c 2s Ah", "straight", "wheel — five-high, not ace-high"],
    ["7c 7d 7h 5s 2c", "trips", "trips"],
    ["7c 7d 5h 5s 2c", "two_pair", "two pair"],
    ["7c 7d 9h 5s 2c", "pair", "one pair"],
    ["Ah Kd 9c 5s 3h", "high_card", "high card"],
  ];

  it.each(cases)("%s is %s (%s)", (text, category) => {
    expect(categoryOf(evaluate5(five(text)))).toBe(category);
  });

  it("covers every category", () => {
    const covered = new Set(cases.map(([, category]) => category));
    expect([...covered].sort()).toEqual([...HAND_CATEGORIES].sort());
    record("every category exercised by a hand-picked example", `${covered.size}/9`);
  });
});

describe("adversarial orderings", () => {
  const stronger = (a: string, b: string) =>
    expect(compareHands(cardsFromString(a), cardsFromString(b))).toBe(1);

  it("ranks the categories in the right order", () => {
    stronger("Ah Kh Qh Jh Th", "9c 9d 9h 9s 2c"); // straight flush > quads
    stronger("9c 9d 9h 9s 2c", "9c 9d 9h 2s 2c"); // quads > full house
    stronger("9c 9d 9h 2s 2c", "Ah Qh 9h 5h 3h"); // full house > flush
    stronger("Ah Qh 9h 5h 3h", "Ah Kd Qc Js Th"); // flush > straight
    stronger("Ah Kd Qc Js Th", "9c 9d 9h 5s 2c"); // straight > trips
    stronger("9c 9d 9h 5s 2c", "9c 9d 5h 5s 2c"); // trips > two pair
    stronger("9c 9d 5h 5s 2c", "9c 9d 7h 5s 2c"); // two pair > pair
    stronger("9c 9d 7h 5s 2c", "Ah Kd 9c 5s 3h"); // pair > high card
  });

  it("keeps a wheel straight below a six-high straight", () => {
    stronger("6h 5d 4c 3s 2h", "5h 4d 3c 2s Ah");
  });

  it("keeps a wheel straight flush below a six-high straight flush", () => {
    stronger("6h 5h 4h 3h 2h", "5h 4h 3h 2h Ah");
  });

  it("keeps an ace-high flush below the lowest straight flush", () => {
    stronger("5h 4h 3h 2h Ah", "Ah Qh 9h 5h 3h");
  });

  it("compares kickers within a category", () => {
    stronger("Ah Ad Kc Qs 9h", "Ah Ad Kc Js 9h"); // pair, third kicker
    stronger("Ah Ad Kc Ks 9h", "Ah Ad Kc Ks 8h"); // two pair, kicker
    stronger("Ah Ad As Ks Kh", "Ah Ad As Qs Qh"); // full house, pair rank
    stronger("Ah Ad As Ac Ks", "Ah Ad As Ac Qs"); // quads, kicker
    stronger("Ah Kh Qh Jh 9h", "Ah Kh Qh Th 9h"); // flush, fourth card
  });

  it("reports exact ties", () => {
    expect(compareHands(cardsFromString("Ah Ad Kc Qs 9h"), cardsFromString("As Ac Kd Qh 9s"))).toBe(
      0,
    );
    expect(compareHands(cardsFromString("Ah Kh Qh Jh Th"), cardsFromString("As Ks Qs Js Ts"))).toBe(
      0,
    );
    record("exact ties detected", "royal vs royal and pair vs pair both compare 0");
  });
});

describe("evaluate7 seven-card cases", () => {
  it("plays the board when both hole cards are irrelevant", () => {
    const board = "Ah Kh Qh Jh Th";
    const heroA = evaluate7(seven(`${board} 2c 3d`));
    const heroB = evaluate7(seven(`${board} 4c 5d`));
    expect(categoryOf(heroA)).toBe("straight_flush");
    expect(heroA).toBe(heroB);
    record("board plays", "two players with junk hole cards chop a royal-flush board");
  });

  it("finds a wheel straight across seven cards", () => {
    const value = evaluate7(seven("Ah 2d 3c 4s 5h Kd Qc"));
    const described = describeHand(value);
    expect(described.category).toBe("straight");
    expect(described.ranks).toEqual(["5"]);
  });

  it("finds a wheel straight flush across seven cards", () => {
    const value = evaluate7(seven("Ah 2h 3h 4h 5h Kd Qc"));
    expect(describeHand(value)).toEqual({
      category: "straight_flush",
      categoryIndex: 8,
      ranks: ["5"],
    });
  });

  it("prefers the straight flush when a higher flush card is also present", () => {
    // Ah and Kh are higher hearts, but 9h-5h is a straight flush and outranks
    // the ace-high flush that a naive top-five-of-the-suit would return.
    const value = evaluate7(seven("9h 8h 7h 6h 5h Ah Kh"));
    expect(describeHand(value)).toEqual({
      category: "straight_flush",
      categoryIndex: 8,
      ranks: ["9"],
    });
  });

  it("distinguishes an ace-high flush from a straight flush", () => {
    const value = evaluate7(seven("Ah Qh 9h 5h 3h 2c 7d"));
    expect(describeHand(value)).toEqual({
      category: "flush",
      categoryIndex: 5,
      ranks: ["A", "Q", "9", "5", "3"],
    });
  });

  it("builds a full house from two sets of trips", () => {
    const value = evaluate7(seven("Ah Ad As Kh Kd Ks Qc"));
    expect(describeHand(value)).toEqual({
      category: "full_house",
      categoryIndex: 6,
      ranks: ["A", "K"],
    });
  });

  it("picks the best two pair and the right kicker out of three pairs", () => {
    const value = evaluate7(seven("Ah Ad Kh Kd Qh Qd 2c"));
    expect(describeHand(value)).toEqual({
      category: "two_pair",
      categoryIndex: 2,
      ranks: ["A", "K", "Q"],
    });
  });

  it("keeps quads above a full house on a paired board", () => {
    const quads = evaluate7(seven("7h 7d 7c 7s Kh Qd 2c"));
    const boat = evaluate7(seven("7h 7d 7c Kh Ks Qd 2c"));
    expect(categoryOf(quads)).toBe("quads");
    expect(categoryOf(boat)).toBe("full_house");
    expect(quads).toBeGreaterThan(boat);
  });

  it("keeps a flush above a straight when the board offers both", () => {
    const board = "Th 9h 8c 7h 2d";
    const flush = evaluate7(seven(`${board} Ah 3h`));
    const straight = evaluate7(seven(`${board} Jc 6s`));
    expect(categoryOf(flush)).toBe("flush");
    expect(categoryOf(straight)).toBe("straight");
    expect(flush).toBeGreaterThan(straight);
  });

  it("takes the top five of a six- or seven-card flush", () => {
    const value = evaluate7(seven("Ah Kh 9h 7h 5h 3h 2h"));
    expect(describeHand(value)).toEqual({
      category: "flush",
      categoryIndex: 5,
      ranks: ["A", "K", "9", "7", "5"],
    });
  });

  it("returns the five cards that actually make the hand", () => {
    const best = bestFive(seven("9h 8h 7h 6h 5h Ah Kh"));
    expect(new Set(best)).toEqual(new Set(cardsFromString("9h 8h 7h 6h 5h")));
    expect(evaluate5(best)).toBe(evaluate7(seven("9h 8h 7h 6h 5h Ah Kh")));
  });

  it("rejects the wrong number of cards", () => {
    expect(() => evaluate5(cardsFromString("AhKhQhJh"))).toThrow();
    expect(() => evaluate7(cardsFromString("AhKhQhJhTh"))).toThrow();
    expect(() => evaluateHand(cardsFromString("AhKhQh"))).toThrow();
  });

  it("evaluates six cards", () => {
    expect(categoryOf(evaluateHand(cardsFromString("Ah Kh Qh Jh Th 2c")))).toBe("straight_flush");
  });
});

// ── 2. Exhaustive five-card enumeration ───────────────────────────────────────

const KNOWN_COUNTS: Record<HandCategory, number> = {
  high_card: 1_302_540,
  pair: 1_098_240,
  two_pair: 123_552,
  trips: 54_912,
  straight: 10_200,
  flush: 5_108,
  full_house: 3_744,
  quads: 624,
  straight_flush: 40,
};

describe("exhaustive five-card enumeration", () => {
  it("matches the known category distribution exactly", () => {
    const counts = new Array<number>(HAND_CATEGORIES.length).fill(0);
    const hand = new Array<Card>(5);
    let total = 0;

    for (let a = 0; a < DECK_SIZE - 4; a++) {
      hand[0] = FULL_DECK[a]!;
      for (let b = a + 1; b < DECK_SIZE - 3; b++) {
        hand[1] = FULL_DECK[b]!;
        for (let c = b + 1; c < DECK_SIZE - 2; c++) {
          hand[2] = FULL_DECK[c]!;
          for (let d = c + 1; d < DECK_SIZE - 1; d++) {
            hand[3] = FULL_DECK[d]!;
            for (let e = d + 1; e < DECK_SIZE; e++) {
              hand[4] = FULL_DECK[e]!;
              const index = evaluate5(hand) >>> 20;
              counts[index] = (counts[index] ?? 0) + 1;
              total++;
            }
          }
        }
      }
    }

    expect(total).toBe(2_598_960);

    const observed = Object.fromEntries(
      HAND_CATEGORIES.map((category, index) => [category, counts[index] ?? 0]),
    ) as Record<HandCategory, number>;

    const table = HAND_CATEGORIES.map((category) => {
      const got = observed[category];
      const want = KNOWN_COUNTS[category];
      return `  ${category.padEnd(16)} ${String(got).padStart(9)}  expected ${String(want).padStart(9)}  ${got === want ? "PASS" : "FAIL"}`;
    }).join("\n");
    console.log(`\n5-card category distribution (all 2,598,960 hands):\n${table}\n`);

    expect(observed).toEqual(KNOWN_COUNTS);
    record("5-card category distribution", "all 9 categories match the known counts exactly");
  }, 60_000);
});

// ── 3. Randomised differential test ───────────────────────────────────────────

/** Independent reference: the best five-card hand out of seven, by brute force. */
function bestOfSubsets(cards: readonly Card[]): HandValue {
  let best = 0 as HandValue;
  const hand = new Array<Card>(5);
  for (let a = 0; a < 3; a++) {
    hand[0] = cards[a]!;
    for (let b = a + 1; b < 4; b++) {
      hand[1] = cards[b]!;
      for (let c = b + 1; c < 5; c++) {
        hand[2] = cards[c]!;
        for (let d = c + 1; d < 6; d++) {
          hand[3] = cards[d]!;
          for (let e = d + 1; e < 7; e++) {
            hand[4] = cards[e]!;
            const value = evaluate5(hand);
            if (value > best) best = value;
          }
        }
      }
    }
  }
  return best;
}

function randomSevenCardDealer(seed: number): () => Card[] {
  const rng = createRng(seed);
  const deck = [...FULL_DECK];
  return () => {
    for (let i = 0; i < 7; i++) {
      const j = i + Math.floor(rng() * (DECK_SIZE - i));
      const a = deck[i]!;
      const b = deck[j]!;
      deck[i] = b;
      deck[j] = a;
    }
    return deck.slice(0, 7);
  };
}

describe("evaluate7 against the brute-force reference", () => {
  it("agrees on 100,000 random seven-card hands", () => {
    const deal = randomSevenCardDealer(20260805);
    let checked = 0;
    for (let i = 0; i < 100_000; i++) {
      const cards = deal();
      const fast = evaluate7(cards);
      const reference = bestOfSubsets(cards);
      if (fast !== reference) {
        throw new Error(
          `differential mismatch on ${cards.map((c) => c).join(",")}: evaluate7=${fast} reference=${reference}`,
        );
      }
      checked++;
    }
    expect(checked).toBe(100_000);
    record("differential vs. max over C(7,5) subsets", "100,000/100,000 agree");
  }, 60_000);
});

// ── 4. Benchmark ──────────────────────────────────────────────────────────────

describe("performance", () => {
  it("evaluates well over 500,000 seven-card hands per second", () => {
    const deal = randomSevenCardDealer(1234);
    const hands: Card[][] = Array.from({ length: 10_000 }, () => deal());

    // Warm the JIT before timing.
    for (let round = 0; round < 5; round++) for (const hand of hands) evaluate7(hand);

    const iterations = 20;
    const started = performance.now();
    let sink = 0;
    for (let round = 0; round < iterations; round++) {
      for (const hand of hands) sink += evaluate7(hand);
    }
    const elapsedMs = performance.now() - started;
    expect(sink).toBeGreaterThan(0);

    const opsPerSecond = (hands.length * iterations) / (elapsedMs / 1000);
    const formatted = Math.round(opsPerSecond).toLocaleString("en-US");
    console.log(
      `\nevaluate7 benchmark: ${formatted} evaluations/sec ` +
        `(${(hands.length * iterations).toLocaleString("en-US")} hands in ${elapsedMs.toFixed(1)}ms)\n`,
    );
    record("evaluate7 throughput", `${formatted}/sec (target 500,000)`);

    expect(opsPerSecond).toBeGreaterThan(500_000);
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.1 — cards, deck, hand evaluator\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});
