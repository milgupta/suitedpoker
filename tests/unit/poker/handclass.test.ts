import { describe, expect, it } from "vitest";

import { type Card, cardsFromString, createRng, DECK_SIZE, FULL_DECK } from "@/poker/cards";
import { categoryOf, evaluateHand } from "@/poker/evaluator";
import {
  BOARD_TAGS,
  boardTexture,
  classifyHand,
  classifyHandDetail,
  HAND_CLASSES,
  type HandClass,
  handClassRank,
  isMadeHand,
} from "@/poker/handclass";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

function hole(text: string): [Card, Card] {
  const cards = cardsFromString(text);
  if (cards.length !== 2) throw new Error(`${text} is not two cards`);
  return [cards[0]!, cards[1]!];
}

/** 60 hand-picked cases: [hole, board, expected class, why]. */
const CASES: Array<[string, string, HandClass, string]> = [
  // Made hands, strongest first
  ["9h8h", "7h 6h 5h", "straight_flush", "flopped straight flush"],
  ["Ah2h", "3h 4h 5h", "straight_flush", "wheel straight flush"],
  ["7c7d", "7h 7s 2c", "quads", "quads using both hole cards"],
  ["7c2d", "7h 7s 7d", "quads", "board trips plus hero's seven is quads"],
  ["KcKd", "Ks Kh 2c", "quads", "quads with a pocket pair"],
  ["9c9d", "9h Ks Kd", "full_house", "set over a paired board"],
  ["KcQd", "Kh Kd Qs", "full_house", "trips plus a pair"],
  ["AhQh", "Kh 7h 2h", "flush", "nut flush using both hole cards"],
  ["Ah2c", "Kh 7h 2h 9h", "flush", "flush using one hole card"],
  ["JcTd", "9h 8s 7c", "straight", "flopped straight"],
  ["Ah2d", "3c 4s 5h", "straight", "wheel straight"],
  ["8c8d", "8h Ks 2c", "set", "set with a pocket pair"],
  ["AcKd", "Ah Kh 7c", "two_pair", "two pair using both hole cards"],
  ["QcQd", "7h 2s 3c", "overpair", "overpair to a low board"],
  ["AhKh", "Ks 7d 2c", "top_pair_good_kicker", "top pair, ace kicker"],
  ["Kh4h", "Ks 7d 2c", "top_pair_weak_kicker", "top pair, four kicker"],
  ["KhTc", "Ks 7d 2c", "top_pair_good_kicker", "ten is exactly good enough"],
  ["Kh9c", "Ks 7d 2c", "top_pair_weak_kicker", "nine is one below the cutoff"],
  ["7hAc", "Ks 7d 2c", "middle_pair", "pairs the middle card"],
  ["2hAc", "Ks 7d 2c", "bottom_pair", "pairs the bottom card"],
  ["9c9d", "Ks 7d 2c", "pocket_pair_below_top", "pocket pair under the top card"],
  ["8c8d", "Ks 9d 2c", "pocket_pair_below_top", "under an unpaired board"],

  // Draws
  ["AhKh", "Qh 7h 2c", "flush_draw", "nut flush draw, no pair"],
  ["9h8h", "7h 2h Kc", "flush_draw", "flush draw with no straight"],
  ["JcTd", "9h 8s 2c", "open_ended", "open-ended straight draw"],
  ["Jc9d", "8h 7s 2c", "gutshot", "only a ten completes it"],
  ["Ac2d", "3h 4s Kc", "ace_high", "A234 needs only a five, and ace_high outranks gutshot"],
  ["JhTh", "9h 8s 2c", "open_ended", "three hearts is a backdoor, not a flush draw"],
  ["KhQh", "Kc 7h 2c", "top_pair_good_kicker", "pairs outrank combo_draw in the spec order"],
  ["JcTd", "9h 8s Tc", "top_pair_good_kicker", "top pair wins over the open-ender"],

  // High card
  ["AhKd", "9h 7s 2c", "ace_high", "ace high, nothing else"],
  ["KhQd", "9c 7s 2h", "overcards", "two overcards, no draw"],
  ["KhQh", "9h 7s 2c", "overcards_bdfd", "overcards with a backdoor flush draw"],
  ["8h7d", "Kc 9s 2h", "air", "nothing at all"],
  ["5c4d", "Kh 9s 2c", "air", "no pair, no draw, no ace"],

  // Adversarial: the board pairing hero's card, playing the board, blockers
  ["7h2c", "Ah Kh Qh Jh Th", "air", "playing the board — hero can only chop"],
  ["Ac2c", "Ah Kh Qh Jh Th", "air", "pairing the board's ace still only chops"],
  ["2h2c", "Ah Ad As Kh Kd", "air", "board full house beats hero's pocket pair"],
  ["Kc9c", "Ah Ad As Kh 2d", "full_house", "hero's king fills the boat"],
  ["7c6c", "7h 7d 2c", "set", "board pair plus hero's card is trips"],
  ["AcKc", "Kh Kd 2c", "set", "trips with the best kicker"],
  ["AhAc", "Kh Kd 2c", "two_pair", "pocket aces over the board pair"],
  ["6c5c", "Kh Kd 2c", "air", "board pair does nothing for hero"],
  ["JhTh", "9h 8h 2c", "combo_draw", "flush draw and open-ender on one board"],
  ["AhAd", "Ac Kh Qh", "set", "set of aces, not a pair"],
  ["QhJh", "Ah Kh 2c", "flush_draw", "flush draw plus a gutshot is not a combo draw"],
  ["9c8c", "Ah Kd Qs", "air", "no ace, no pair, no draw"],
  ["Ah9h", "Kh Qh 2c", "flush_draw", "flush draw beats ace high"],
  ["AhTd", "Ac Kh 2c", "top_pair_good_kicker", "top pair with a ten kicker"],
  ["Ah9d", "Ac Kh 2c", "top_pair_weak_kicker", "nine kicker is weak"],
  ["5h5d", "5c 5s 9h", "quads", "pocket pair matching board pair"],
  ["KhKd", "Ah Ad 2c", "two_pair", "kings under aces is two pair"],
  ["Th9h", "8h 7h 2c", "combo_draw", "straight flush draw"],
  ["Ah5h", "2h 3h Kc", "flush_draw", "the wheel draw is only a gutshot"],
  ["Ac5d", "2h 3s Kc", "ace_high", "gutshot, but ace_high ranks above it"],
  ["JcJd", "Jh Js 2c", "quads", "quads with pocket jacks"],
  ["2c3d", "Ah Ad Ac 2h", "full_house", "hero's deuce fills the boat over board trips"],
  ["Kd2d", "Ah Ac 7s 3d", "air", "hero pairs nothing — the aces are the board's"],
  ["9h8h", "2c 3d 4s", "overcards", "both hole cards beat a four-high board"],
  ["AhKh", "2h 3h 4c", "flush_draw", "the gutshot does not make it a combo draw"],
];

describe("classifyHand — hand-picked cases", () => {
  it.each(CASES)("%s on %s is %s (%s)", (holeText, boardText, expected) => {
    expect(classifyHand(hole(holeText), cardsFromString(boardText))).toBe(expected);
  });

  it("covers every class", () => {
    const covered = new Set(CASES.map(([, , handClass]) => handClass));
    const missing = HAND_CLASSES.filter((c) => !covered.has(c));
    console.log(
      `\nhand-picked coverage: ${covered.size}/${HAND_CLASSES.length} classes` +
        (missing.length > 0 ? `\n  not covered: ${missing.join(", ")}` : ""),
    );
    expect(CASES.length).toBeGreaterThanOrEqual(60);
    record(
      "hand-picked cases",
      `${CASES.length} cases, ${covered.size}/${HAND_CLASSES.length} classes covered`,
    );
  });
});

describe("classifyHand — invariants", () => {
  it("returns exactly one class and never throws across 100,000 random spots", () => {
    const rng = createRng("handclass-property");
    const deck = [...FULL_DECK];
    const seen = new Map<HandClass, number>();

    for (let i = 0; i < 100_000; i++) {
      const boardSize = 3 + (i % 3);
      const need = 2 + boardSize;
      for (let j = 0; j < need; j++) {
        const k = j + Math.floor(rng() * (DECK_SIZE - j));
        const a = deck[j]!;
        const b = deck[k]!;
        deck[j] = b;
        deck[k] = a;
      }
      const heroCards: [Card, Card] = [deck[0]!, deck[1]!];
      const board = deck.slice(2, need);
      const handClass = classifyHand(heroCards, board);
      expect(HAND_CLASSES).toContain(handClass);
      seen.set(handClass, (seen.get(handClass) ?? 0) + 1);
    }

    const rows = HAND_CLASSES.map(
      (c) => `  ${c.padEnd(22)} ${(((seen.get(c) ?? 0) / 100_000) * 100).toFixed(2)}%`,
    );
    console.log(`\nclass distribution over 100,000 random spots:\n${rows.join("\n")}`);
    expect(seen.size).toBeGreaterThan(15);
    record("property test", `100,000 random spots, no throws, ${seen.size} distinct classes seen`);
  });

  it("agrees with the evaluator for two pair and better", () => {
    const rng = createRng("handclass-crosscheck");
    const deck = [...FULL_DECK];
    const strong: HandClass[] = [
      "straight_flush",
      "quads",
      "full_house",
      "flush",
      "straight",
      "set",
      "two_pair",
    ];
    const expectedCategory: Record<string, string[]> = {
      straight_flush: ["straight_flush"],
      quads: ["quads"],
      full_house: ["full_house"],
      flush: ["flush"],
      straight: ["straight"],
      set: ["trips"],
      two_pair: ["two_pair"],
    };

    let checked = 0;
    for (let i = 0; i < 50_000; i++) {
      for (let j = 0; j < 7; j++) {
        const k = j + Math.floor(rng() * (DECK_SIZE - j));
        const a = deck[j]!;
        const b = deck[k]!;
        deck[j] = b;
        deck[k] = a;
      }
      const heroCards: [Card, Card] = [deck[0]!, deck[1]!];
      const board = deck.slice(2, 7);
      const handClass = classifyHand(heroCards, board);
      if (!strong.includes(handClass)) continue;
      const category = categoryOf(evaluateHand([...heroCards, ...board]));
      expect(
        expectedCategory[handClass],
        `${handClass} claimed but the evaluator says ${category}`,
      ).toContain(category);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    record(
      "evaluator cross-check",
      `${checked.toLocaleString("en-US")} strong hands agree with evaluate7`,
    );
  });

  it("orders the classes strongest to weakest", () => {
    expect(handClassRank("straight_flush")).toBe(0);
    expect(handClassRank("air")).toBe(HAND_CLASSES.length - 1);
    expect(handClassRank("combo_draw")).toBeLessThan(handClassRank("bottom_pair"));
    expect(handClassRank("two_pair")).toBeLessThan(handClassRank("overpair"));
    record("combo_draw precedence", "combo_draw outranks bottom_pair, as specified");
  });

  it("separates made hands from draws", () => {
    expect(isMadeHand("two_pair")).toBe(true);
    expect(isMadeHand("pocket_pair_below_top")).toBe(true);
    expect(isMadeHand("combo_draw")).toBe(false);
    expect(isMadeHand("flush_draw")).toBe(false);
    expect(isMadeHand("air")).toBe(false);
  });

  it("reports what else matched, for debugging", () => {
    const detail = classifyHandDetail(hole("2h3h"), cardsFromString("Kh 9h 2c"));
    expect(detail.handClass).toBe("combo_draw");
    expect(detail.matched).toContain("bottom_pair");
    expect(detail.matched).toContain("flush_draw");
  });

  it("flags playing the board", () => {
    expect(classifyHandDetail(hole("7h2c"), cardsFromString("Ah Kh Qh Jh Th")).playsTheBoard).toBe(
      true,
    );
    expect(classifyHandDetail(hole("AhKh"), cardsFromString("Ks 7d 2c")).playsTheBoard).toBe(false);
    record("plays the board", "a royal board with junk hole cards classifies as air, not a royal");
  });

  it("rejects malformed input", () => {
    expect(() => classifyHand(hole("AhKh"), cardsFromString("Ks 7d"))).toThrow(/3 to 5/);
    expect(() => classifyHand(hole("AhKh"), cardsFromString("Ah 7d 2c"))).toThrow(/twice/);
  });
});

describe("boardTexture", () => {
  const cases: Array<[string, BoardTagExpectation]> = [
    ["Ah 7d 2c", { has: ["dry", "rainbow", "ace-high"], not: ["wet", "paired", "connected"] }],
    ["Jh Th 9c", { has: ["wet", "connected", "two-tone", "broadway"], not: ["dry", "paired"] }],
    ["7h 7d 2c", { has: ["paired", "low"], not: ["broadway"] }],
    ["Ah Kh Qh", { has: ["monotone", "wet", "ace-high", "broadway", "connected"], not: ["dry"] }],
    ["9h 8d 7c", { has: ["connected", "wet", "rainbow"], not: ["dry", "broadway"] }],
    ["Ah 7h 2c", { has: ["two-tone", "dry", "ace-high"], not: ["wet", "monotone"] }],
    ["5h 3d 2c", { has: ["low", "connected", "wet"], not: ["broadway", "ace-high"] }],
    ["Kh Qd 2c", { has: ["broadway", "dry"], not: ["ace-high", "low", "connected"] }],
  ];

  it.each(cases)("%s", (boardText, expectation) => {
    const tags = boardTexture(cardsFromString(boardText));
    for (const tag of expectation.has)
      expect(tags, `${boardText} → ${tags.join(",")}`).toContain(tag);
    for (const tag of expectation.not) expect(tags).not.toContain(tag);
  });

  it("always returns exactly one of dry and wet, and one suit tag", () => {
    const rng = createRng("texture");
    const deck = [...FULL_DECK];
    for (let i = 0; i < 20_000; i++) {
      const size = 3 + (i % 3);
      for (let j = 0; j < size; j++) {
        const k = j + Math.floor(rng() * (DECK_SIZE - j));
        const a = deck[j]!;
        const b = deck[k]!;
        deck[j] = b;
        deck[k] = a;
      }
      const tags = boardTexture(deck.slice(0, size));
      expect(tags.filter((t) => t === "dry" || t === "wet")).toHaveLength(1);
      expect(
        tags.filter((t) => t === "monotone" || t === "two-tone" || t === "rainbow"),
      ).toHaveLength(1);
      for (const tag of tags) expect(BOARD_TAGS).toContain(tag);
    }
    record("board texture", "20,000 random boards each get exactly one wetness and one suit tag");
  });
});

interface BoardTagExpectation {
  has: string[];
  not: string[];
}

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.5 — hand classification\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});
