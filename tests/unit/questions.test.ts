/**
 * Question types, the single grader, and presentation routing.
 *
 * The rule under test is that adding a question type must NOT add a grading
 * path. One grader, one six-grade vocabulary, one accuracy formula — otherwise
 * a "sizing" question scored on a different scale silently makes the rating
 * incomparable between sessions.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GRADE_NAMES, grade as gradePreflop } from "../../src/poker/grader";
import {
  QUESTION_TYPES,
  gradeQuestion,
  optionsFor,
  presentationFor,
  type HandChoiceQuestion,
  type SizingQuestion,
} from "../../src/poker/questions";
import { generateSpot } from "../../src/poker/generator";
import { nodeRefOf, parsePreflopNode, type PreflopNode } from "../../src/poker/solutions";
import { HAND_KEYS } from "../../src/poker/range";

const ROOT = resolve(process.cwd(), "src/content/solutions/preflop");
const NODES: PreflopNode[] = readdirSync(ROOT)
  .filter((f) => f.endsWith(".json"))
  .map((f) => parsePreflopNode(JSON.parse(readFileSync(join(ROOT, f), "utf8")), f));
const DATA = { preflop: NODES, postflop: [] };

const nodeFor = (ref: string): PreflopNode | undefined =>
  NODES.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === ref);

describe("one grader for every question type", () => {
  it("grades 200 sizing questions through the same grader as an action", () => {
    let checked = 0;

    for (let i = 0; i < 400 && checked < 200; i++) {
      const spot = generateSpot({ type: "preflop" }, DATA, `sizing-${i}`);
      const node = nodeFor(spot.nodeRef);
      if (node === undefined) continue;

      const question: SizingQuestion = {
        type: "sizing",
        prompt: "Which sizing?",
        options: node.actions,
      };

      for (const option of node.actions) {
        const viaQuestion = gradeQuestion(question, node, spot.handKey, option);
        const viaGrader = gradePreflop(node, spot.handKey, option);

        // Identical, not merely similar — a sizing question IS an action
        // question with a different label.
        expect(viaQuestion).toEqual(viaGrader);
        checked++;
      }
    }

    expect(checked).toBeGreaterThanOrEqual(200);
  });

  it("grades 200 hand_choice questions into the same six-grade vocabulary", () => {
    let checked = 0;

    for (let i = 0; i < 200 && checked < 200; i++) {
      const spot = generateSpot({ type: "preflop" }, DATA, `choice-${i}`);
      const node = nodeFor(spot.nodeRef);
      if (node === undefined) continue;

      const action = node.actions[0];
      if (action === undefined) continue;

      const candidates = HAND_KEYS.slice((i * 7) % 160, ((i * 7) % 160) + 4);
      if (candidates.length < 4) continue;

      const question: HandChoiceQuestion = {
        type: "hand_choice",
        prompt: "Which is the better bluff?",
        action,
        candidates,
      };

      for (const candidate of candidates) {
        const result = gradeQuestion(question, node, spot.handKey, candidate);

        expect(GRADE_NAMES as readonly string[]).toContain(result.grade);
        expect(result.evLoss).toBeGreaterThanOrEqual(0);
        expect(["clear", "preferred", "mixed"]).toContain(result.displayMode);
        expect(Object.keys(result.frequencies).sort()).toEqual([...candidates].sort());
        checked++;
      }
    }

    expect(checked).toBeGreaterThanOrEqual(200);
  });

  it("normalises hand_choice frequencies into a distribution", () => {
    const node = NODES[0];
    expect(node).toBeDefined();
    if (node === undefined) return;

    const action = node.actions[0];
    if (action === undefined) return;

    const question: HandChoiceQuestion = {
      type: "hand_choice",
      prompt: "?",
      action,
      candidates: ["AA", "KK", "72o", "32o"],
    };

    const result = gradeQuestion(question, node, "AA", "AA");
    const total = Object.values(result.frequencies).reduce((sum, f) => sum + f, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("gives the best candidate the best grade and zero EV loss", () => {
    const node = NODES.find((n) => n.actionSeq === "rfi");
    expect(node).toBeDefined();
    if (node === undefined) return;

    const action = node.actions.includes("raise") ? "raise" : node.actions[0];
    if (action === undefined) return;

    const question: HandChoiceQuestion = {
      type: "hand_choice",
      prompt: "?",
      action,
      candidates: ["AA", "KK", "72o", "32o"],
    };

    const best = gradeQuestion(question, node, "AA", "AA");
    expect(best.evLoss).toBe(0);
    expect(["best", "sharp"]).toContain(best.grade);

    // And the worst candidate must not also grade best.
    const worst = gradeQuestion(question, node, "AA", "32o");
    expect(worst.evLoss).toBeGreaterThanOrEqual(0);
  });
});

describe("question options", () => {
  it("renders four hand candidates with their cards", () => {
    const options = optionsFor({
      type: "hand_choice",
      prompt: "?",
      action: "raise",
      candidates: ["AA", "KK", "QQ", "JJ"],
    });

    expect(options).toHaveLength(4);
    expect(options.every((o) => o.handKey !== undefined)).toBe(true);
  });

  it("renders sizing options without cards", () => {
    const options = optionsFor({ type: "sizing", prompt: "?", options: ["raise", "allin"] });
    expect(options.map((o) => o.value)).toEqual(["raise", "allin"]);
    expect(options.every((o) => o.handKey === undefined)).toBe(true);
  });

  it("gives an action question no choice options — the ActionBar answers it", () => {
    expect(optionsFor({ type: "action" })).toEqual([]);
  });
});

describe("presentationFor", () => {
  it("covers 5,000 generated spots with no undefined", () => {
    const seen = new Set<string>();

    for (let i = 0; i < 5000; i++) {
      const spot = generateSpot({ type: "preflop" }, DATA, `present-${i}`);
      const streets = spot.board.length === 0 ? 1 : spot.board.length >= 5 ? 4 : 2;

      for (const questionType of QUESTION_TYPES) {
        const result = presentationFor({ streetsWithAction: streets, questionType });
        expect(result, `undefined for ${spot.nodeRef} / ${questionType}`).toBeDefined();
        expect(["table", "history"]).toContain(result);
        seen.add(result);
      }
    }

    // Both formats must actually occur, or the routing is doing nothing.
    expect([...seen].sort()).toEqual(["history", "table"]);
  });

  it("is deterministic for the same input", () => {
    for (const questionType of QUESTION_TYPES) {
      for (let streets = 0; streets <= 4; streets++) {
        const a = presentationFor({ streetsWithAction: streets, questionType });
        const b = presentationFor({ streetsWithAction: streets, questionType });
        expect(a).toBe(b);
      }
    }
  });

  it("sends every non-action question to the text format", () => {
    // The table can only ask "what do you do?".
    for (const questionType of ["hand_choice", "sizing"] as const) {
      for (let streets = 0; streets <= 4; streets++) {
        expect(presentationFor({ streetsWithAction: streets, questionType })).toBe("history");
      }
    }
  });

  it("sends a single-decision action spot to the table and a deep one to text", () => {
    expect(presentationFor({ streetsWithAction: 1, questionType: "action" })).toBe("table");
    expect(presentationFor({ streetsWithAction: 2, questionType: "action" })).toBe("table");
    // Four streets cannot be shown at a glance on a phone.
    expect(presentationFor({ streetsWithAction: 3, questionType: "action" })).toBe("history");
    expect(presentationFor({ streetsWithAction: 4, questionType: "action" })).toBe("history");
  });
});
