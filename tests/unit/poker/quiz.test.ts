/**
 * The poker-maths quiz.
 *
 * Two things are being defended here, and they are different in kind.
 *
 * The MATHS is checked against values computed outside this codebase — every
 * figure below is one a poker player can look up, and if the implementation and
 * the published number ever disagree, the implementation is wrong. This is the
 * only module in the product where that is true; everywhere else the data is an
 * authored approximation and there is nothing external to check it against.
 *
 * The QUESTIONS are checked for the failure the maths cannot catch: a prompt
 * that says "you flopped the open-ender" over a hand that is not one. The
 * scenario list is held against the REAL classifier rather than against my own
 * reading of it.
 */

import { describe, expect, it } from "vitest";
import { cardsFromString } from "../../../src/poker/cards";
import { classifyHand } from "../../../src/poker/handclass";
import {
  asPercent,
  combinations,
  drawCompletes,
  equityNeeded,
  flopContainsAny,
  flopContainsNone,
  pocketPairFlopsSet,
  ruleOfFourAndTwo,
  unpairedHandPairs,
  DRAW_OUTS,
} from "../../../src/poker/odds";
import {
  DRAW_SCENARIOS,
  generateQuizQuestion,
  gradeQuizAnswer,
  QUIZ_FAMILIES,
  toClientQuestion,
} from "../../../src/poker/quiz";

const pct = (o: { probability: number }) => asPercent(o.probability, 2);

describe("exact card maths", () => {
  it("counts combinations without losing precision", () => {
    // Deck-sized values, checked against known figures. The factorial form
    // overflows long before these; the multiplicative form does not.
    expect(combinations(52, 5)).toBe(2_598_960);
    expect(combinations(50, 3)).toBe(19_600);
    expect(combinations(47, 2)).toBe(1_081);
    expect(combinations(5, 0)).toBe(1);
    expect(combinations(3, 5)).toBe(0);
  });

  it("matches the published draw odds", () => {
    expect(pct(drawCompletes(DRAW_OUTS.open_ended, 2, 47))).toBe(31.45);
    expect(pct(drawCompletes(DRAW_OUTS.flush_draw, 2, 47))).toBe(34.97);
    expect(pct(drawCompletes(DRAW_OUTS.flush_draw, 1, 46))).toBe(19.57);
    expect(pct(drawCompletes(DRAW_OUTS.gutshot, 2, 47))).toBe(16.47);
    expect(pct(drawCompletes(DRAW_OUTS.combo_draw, 2, 47))).toBe(54.12);
  });

  it("matches the published preflop-to-flop odds", () => {
    // An overcard to pocket jacks: queens, kings and aces, 12 cards.
    expect(pct(flopContainsAny(12))).toBe(56.96);
    // Ace-king misses entirely: no ace, no king.
    expect(pct(flopContainsNone(6))).toBe(67.57);
    expect(pct(pocketPairFlopsSet())).toBe(11.76);
    expect(pct(unpairedHandPairs())).toBe(32.43);
  });

  it("prices a call off the pot AFTER the bet", () => {
    // 5 to call into a 10 pot that already contains the bet: 5 / 15.
    expect(pct(equityNeeded(5, 10))).toBe(33.33);
    expect(pct(equityNeeded(12, 24))).toBe(33.33);
  });

  it("never counts a two-card draw by adding the streets", () => {
    // The overlap matters: added naively, 9 outs reads ~39% instead of ~35%.
    const naive = 9 / 47 + 9 / 46;
    expect(naive).toBeGreaterThan(drawCompletes(9, 2, 47).probability);
  });

  it("keeps the rule of four as an approximation, never an answer", () => {
    // It exists only to be offered as a distractor. If it ever equalled the
    // exact figure, the question would have two right answers.
    expect(ruleOfFourAndTwo(9, 2)).not.toBe(drawCompletes(9, 2, 47).probability);
    expect(ruleOfFourAndTwo(8, 2)).not.toBe(drawCompletes(8, 2, 47).probability);
  });

  it("refuses impossible inputs rather than returning a number", () => {
    expect(() => drawCompletes(60, 2, 47)).toThrow();
    expect(() => equityNeeded(0, 10)).toThrow();
    expect(() => combinations(1.5, 1)).toThrow();
  });
});

describe("the draw scenarios", () => {
  it.each(DRAW_SCENARIOS)("$hole on $board really is a $kind", (scenario) => {
    // The prompt makes a claim about the hand. The classifier is the arbiter,
    // not the author — a question that says "open-ender" over a gutshot is the
    // same defect as the coach describing a board it never saw.
    const [a, b] = cardsFromString(scenario.hole);
    expect(classifyHand([a!, b!], cardsFromString(scenario.board))).toBe(scenario.kind);
  });
});

describe("question generation", () => {
  it("is deterministic in its seed", () => {
    for (const family of QUIZ_FAMILIES) {
      const a = generateQuizQuestion({ family }, "same-seed");
      const b = generateQuizQuestion({ family }, "same-seed");
      expect(a).toEqual(b);
    }
  });

  it("always contains exactly one correct option, and it is the exact answer", () => {
    for (const family of QUIZ_FAMILIES) {
      for (let i = 0; i < 60; i++) {
        const q = generateQuizQuestion({ family }, `seed:${family}:${i}`);
        expect(q.options).toHaveLength(3);
        const correct = q.options[q.correctIndex]!;
        // The right answer is the exact figure, rounded for display — never a
        // distractor that happens to be nearby.
        expect(correct).toBe(Math.round(q.exactPercent));
        // And no wrong option may duplicate it.
        expect(q.options.filter((o) => o === correct)).toHaveLength(1);
      }
    }
  });

  it("keeps every option far enough apart to be a real choice", () => {
    // Three answers reading 31, 34 and 35 are one answer and two typos.
    for (const family of QUIZ_FAMILIES) {
      for (let i = 0; i < 60; i++) {
        const q = generateQuizQuestion({ family }, `gap:${family}:${i}`);
        const sorted = [...q.options].sort((a, b) => a - b);
        for (let j = 1; j < sorted.length; j++) {
          expect(
            sorted[j]! - sorted[j - 1]!,
            `${family} offered ${q.options.join("/")}`,
          ).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  it("keeps every option inside a believable range", () => {
    for (const family of QUIZ_FAMILIES) {
      for (let i = 0; i < 40; i++) {
        const q = generateQuizQuestion({ family }, `range:${family}:${i}`);
        for (const option of q.options) {
          expect(option).toBeGreaterThanOrEqual(1);
          expect(option).toBeLessThanOrEqual(99);
          expect(Number.isInteger(option)).toBe(true);
        }
      }
    }
  });

  it("grades only the index it generated", () => {
    const q = generateQuizQuestion({ family: "set_mine" }, "grade-me");
    expect(gradeQuizAnswer(q, q.correctIndex)).toBe(true);
    for (let i = 0; i < 3; i++) {
      if (i !== q.correctIndex) expect(gradeQuizAnswer(q, i)).toBe(false);
    }
  });

  it("writes a prompt and a clarifier for every family", () => {
    for (const family of QUIZ_FAMILIES) {
      const q = generateQuizQuestion({ family }, `copy:${family}`);
      expect(q.prompt.length).toBeGreaterThan(20);
      expect(q.clarifier.length).toBeGreaterThan(4);
      expect(q.explanation.length).toBeGreaterThan(40);
    }
  });

  it("never prints an identifier in anything a user reads", () => {
    // Same rule as the action buttons: `raise_small` reached the one control
    // the whole product runs through, on a product that claims plain English.
    for (const family of QUIZ_FAMILIES) {
      for (let i = 0; i < 30; i++) {
        const q = generateQuizQuestion({ family }, `id:${family}:${i}`);
        for (const text of [q.prompt, q.clarifier, q.explanation]) {
          expect(text, `${family}: "${text}"`).not.toMatch(/_|\bundefined\b|\bNaN\b/);
        }
      }
    }
  });
});

describe("the answer never reaches the client", () => {
  it("strips the answer, the seed and the explanation by omission", () => {
    for (const family of QUIZ_FAMILIES) {
      const q = generateQuizQuestion({ family }, `client:${family}`);
      const client = toClientQuestion(q);
      const keys = Object.keys(client);
      expect(keys).not.toContain("correctIndex");
      expect(keys).not.toContain("exactPercent");
      expect(keys).not.toContain("explanation");
      expect(keys).not.toContain("seed");
    }
  });

  it("leaks nothing through a JSON round trip", () => {
    // The structural check above passes on a shallow object; this is the one
    // that would catch an answer buried inside a nested field.
    for (const family of QUIZ_FAMILIES) {
      for (let i = 0; i < 20; i++) {
        const q = generateQuizQuestion({ family }, `leak:${family}:${i}`);
        const wire = JSON.stringify(toClientQuestion(q));
        expect(wire).not.toContain(`"correctIndex"`);
        expect(wire).not.toContain(q.explanation);
        expect(wire).not.toContain(q.seed);
      }
    }
  });
});
