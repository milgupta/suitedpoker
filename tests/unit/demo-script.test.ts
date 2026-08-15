/**
 * THE WRITTEN DEMO COPY, HELD AGAINST THE DATA IT DESCRIBES.
 *
 * Every other explanation in the product is generated from the solution files
 * or guarded by `redact()`, so it cannot contradict them. This one is typed by
 * a human, which makes it the only place in the funnel where a sentence can
 * disagree with the table directly above it and nothing notices.
 *
 * So the numbers in `demo-script.ts` are asserted against
 * `BB.vs_rfi_BTN.json` here. Repairing that node fails the build rather than
 * shipping copy that says "four times out of five" over a 60/40 split.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerFor,
  DEMO_ANSWERS,
  DEMO_CHAT_FALLBACK,
  DEMO_VERDICT,
  FIXED_DEMO,
  FIXED_DEMO_NODE_REF,
  type DemoAction,
} from "@/lib/demo-script";
import { isServableNode } from "@/poker/node-status";
import { actionHistoryFor } from "@/poker/generator";
import { CHIPS_PER_BB } from "@/lib/units";

interface NodeFile {
  readonly heroPos: string;
  readonly actionSeq: string;
  readonly actions: readonly string[];
  readonly strategy: Record<string, Record<string, number>>;
  readonly ev: Record<string, Record<string, number>>;
}

const node = JSON.parse(
  readFileSync(join(process.cwd(), "src/content/solutions/preflop/BB.vs_rfi_BTN.json"), "utf8"),
) as NodeFile;

const strategy = node.strategy[FIXED_DEMO.handKey];
const ev = node.ev[FIXED_DEMO.handKey];

describe("the fixed demo hand exists and is the shape the copy claims", () => {
  it("names a node the product actually serves", () => {
    expect(FIXED_DEMO_NODE_REF).toBe("BB:vs_rfi_BTN");
    expect(`${node.heroPos}:${node.actionSeq}`).toBe(FIXED_DEMO_NODE_REF);
    // A quarantined node would be filtered out of loadSolutionData(), and the
    // deal route would silently fall back to a tier spot with template copy.
    expect(isServableNode(FIXED_DEMO_NODE_REF), `${FIXED_DEMO_NODE_REF} is quarantined`).toBe(true);
  });

  it("has the hand, with the split the verdict copy describes", () => {
    expect(strategy, `${FIXED_DEMO.handKey} is not in the strategy`).toBeDefined();
    expect(strategy?.call).toBeCloseTo(FIXED_DEMO.callFreq, 5);
    expect(strategy?.fold).toBeCloseTo(FIXED_DEMO.foldFreq, 5);
  });

  it("is 80/20, which is what Milan asked for and what the words say", () => {
    // "four times out of five" and "one time in five" are both in the copy.
    expect(FIXED_DEMO.callFreq).toBe(0.8);
    expect(FIXED_DEMO.foldFreq).toBe(0.2);
    expect((strategy?.call ?? 0) + (strategy?.fold ?? 0)).toBeCloseTo(1, 5);
  });

  it("makes fold and call indifferent, so neither is punished", () => {
    // The copy tells a folder they have not made a mistake. That is only true
    // while the two EVs agree.
    expect(ev?.fold).toBeCloseTo(ev?.call ?? NaN, 2);
  });

  it("makes RAISE the one real mistake, at the cost the copy implies", () => {
    // "Raising is the one thing this hand doesn't do" needs raise to be both
    // never played and genuinely worse — not merely unplayed.
    expect(strategy?.raise ?? 0).toBe(0);
    expect(node.actions).toContain("raise");

    const raiseLoss = (ev?.call ?? 0) - (ev?.raise ?? 0);
    expect(raiseLoss).toBeCloseTo(FIXED_DEMO.raiseEvLoss, 2);
    expect(raiseLoss).toBeGreaterThan(0.5);
  });

  it("offers exactly the three buttons the verdict table covers", () => {
    const covered = Object.keys(DEMO_VERDICT).sort();
    expect(covered).toEqual(["call", "fold", "raise"]);
    for (const action of covered) {
      expect(node.actions, `${action} is not a button at this node`).toContain(action);
    }
  });
});

describe("the written verdicts", () => {
  const actions: DemoAction[] = ["fold", "call", "raise"];

  it("says something specific for every action, and never contradicts the data", () => {
    for (const action of actions) {
      const verdict = DEMO_VERDICT[action];
      expect(verdict.headline.length, action).toBeGreaterThan(20);
      expect(verdict.body.length, action).toBeGreaterThan(80);

      // Rule 5: no dollar-denominated result anywhere in the funnel.
      expect(`${verdict.headline} ${verdict.body}`, action).not.toMatch(/\$/);
      // The unit switch: no stale big blinds in copy that survived it.
      expect(`${verdict.headline} ${verdict.body}`, action).not.toMatch(/\bbb\b/i);
    }
  });

  it("tells a folder they were not wrong, because the data says they were not", () => {
    expect(ev?.fold).toBeCloseTo(ev?.call ?? NaN, 2);
    expect(DEMO_VERDICT.fold.headline.toLowerCase()).toMatch(/fine|not a mistake|real part/);
  });

  it("tells a raiser it is never taken, because the frequency is zero", () => {
    expect(strategy?.raise ?? 0).toBe(0);
    expect(DEMO_VERDICT.raise.body.toLowerCase()).toContain("never");
  });

  it("prints all three, for reading by hand", () => {
    for (const action of actions) {
      console.log(
        `\n  [${action}] ${DEMO_VERDICT[action].headline}\n    ${DEMO_VERDICT[action].body}`,
      );
    }
    console.log("");
  });
});

describe("the mini chat routes questions to written answers", () => {
  it("sends each chip's own wording to its own answer", () => {
    for (const entry of DEMO_ANSWERS) {
      expect(answerFor(entry.question)?.id, entry.question).toBe(entry.id);
    }
  });

  it("routes the questions a beginner would actually type", () => {
    const cases: Array<[string, string]> = [
      ["why would I call with such a weak hand?", "why-call"],
      ["should I just always call then", "why-not-always"],
      ["what about raising here", "what-if-raise"],
      ["why is it 80 percent", "why-not-always"],
      ["would this be different from the cutoff?", "does-position-matter"],
      ["can I 3bet", "what-if-raise"],
    ];
    for (const [question, expected] of cases) {
      expect(answerFor(question)?.id, question).toBe(expected);
    }
  });

  it("falls back rather than inventing, on anything off-topic", () => {
    for (const question of [
      "what stakes should I play",
      "is this rigged",
      "who won the world series of poker",
      "",
      "!!!",
    ]) {
      expect(answerFor(question), question).toBeNull();
    }
  });

  it("names the same open size the table under it draws", () => {
    /*
     * The `why-call` answer says "the button only raised to 5". That 5 is the
     * generator's own sizing, in chips — if the unit or the open size ever
     * changes again, this sentence is the one that quietly becomes a lie,
     * because it is prose rather than a formatted amount.
     */
    const history = actionHistoryFor({
      ref: FIXED_DEMO_NODE_REF,
      heroPos: FIXED_DEMO.heroPos,
      actionSeq: FIXED_DEMO.actionSeq,
    } as Parameters<typeof actionHistoryFor>[0]);

    const openSize = history.join(" ").match(/opens (\d+)/)?.[1];
    expect(openSize, "the generator no longer prints an open size").toBeDefined();

    const whyCall = DEMO_ANSWERS.find((a) => a.id === "why-call");
    expect(whyCall?.answer, `the copy should name the open as ${String(openSize)}`).toContain(
      `raised to ${String(openSize)}`,
    );
    // And the blind the hero already has in, which is the chip unit's own definition.
    expect(whyCall?.answer).toContain(`${String(CHIPS_PER_BB)} chips in`);
  });

  it("never answers with a number nothing computed, or a dollar figure", () => {
    const all = [...DEMO_ANSWERS.map((a) => a.answer), DEMO_CHAT_FALLBACK].join(" ");
    expect(all).not.toMatch(/\$/);
    expect(all).not.toMatch(/\bbb\b/i);

    // The only percentages allowed are the ones in the strategy file.
    const percents = [...all.matchAll(/(\d+)\s*%/g)].map((m) => Number(m[1]));
    for (const percent of percents) {
      expect([FIXED_DEMO.callFreq * 100, FIXED_DEMO.foldFreq * 100], `${percent}%`).toContain(
        percent,
      );
    }
  });

  it("prints every question and answer, for reading by hand", () => {
    for (const entry of DEMO_ANSWERS) {
      console.log(`\n  Q: ${entry.question}\n  A: ${entry.answer}`);
    }
    console.log(`\n  [fallback] ${DEMO_CHAT_FALLBACK}\n`);
  });
});
