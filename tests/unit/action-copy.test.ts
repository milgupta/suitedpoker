/**
 * No solution-file identifier is ever printed at a person.
 *
 * The files store `raise_small`, `bet_33` and `allin`, which are correct
 * identifiers and were going straight onto the buttons — so a product that
 * claims to explain poker in plain English asked a beginner to choose between
 * "raise_small" and "allin", and the feedback under it read "You raise_small".
 *
 * Two halves, because either alone leaks. The scan catches a component that
 * interpolates the identifier; the render catches a copy generator that
 * concatenates one, which no scan of JSX would ever see.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { actionLabel, actionPhrase, actionVerb } from "../../src/lib/action-label";
import { capsuleSegments } from "../../src/lib/action-grid";
import { templateExplanation } from "../../src/lib/ai/redact";
import { preflopContextOf, templateHint } from "../../src/lib/hints";
import { loadSolutionData } from "../../src/lib/solution-data";
import { generateSpot } from "../../src/poker/generator";
import { gradeDecision } from "../../src/poker/grader";

const SRC = resolve(process.cwd(), "src");

/** Every action name the served data can produce. */
function servedActions(): string[] {
  const actions = new Set<string>();
  const data = loadSolutionData();
  for (const node of data.preflop) for (const a of node.actions) actions.add(a);
  for (const template of data.postflop) for (const a of template.actions) actions.add(a);
  return [...actions];
}

/** A snake_case token, which is what an unlabelled identifier looks like. */
const SNAKE = /\b[a-z]+_[a-z0-9]+\b/;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.tsx$/.test(path)) files.push(path);
  }
  return files;
}

describe("the action vocabulary", () => {
  it("has a readable label for every action the served data contains", () => {
    for (const action of servedActions()) {
      for (const [name, render] of [
        ["label", actionLabel],
        ["phrase", actionPhrase],
        ["verb", actionVerb],
      ] as const) {
        const text = render(action);
        expect(SNAKE.test(text), `${name}("${action}") is "${text}"`).toBe(false);
        expect(text.includes("_"), `${name}("${action}") keeps an underscore`).toBe(false);
      }
    }
  });

  it("falls back to something readable for an action nobody has labelled yet", () => {
    // A new sizing landing in the data must read as English on the day it
    // arrives, not as `bet_75` until somebody notices.
    expect(actionLabel("bet_75")).toBe("Bet 75");
    expect(actionVerb("bet_75")).toBe("bet 75");
  });
});

describe("generated copy", () => {
  const data = loadSolutionData();

  /** One graded decision per served node, per action available at it. */
  function everyGradedDecision() {
    const graded: { node: string; text: string[] }[] = [];

    for (const [index, node] of data.preflop.entries()) {
      const spot = generateSpot(
        { type: "preflop", heroPos: node.heroPos, actionSeq: node.actionSeq },
        data,
        `copy:${String(index)}`,
      );

      for (const action of node.actions) {
        const result = gradeDecision(
          {
            actions: node.actions,
            frequencies: node.strategy[spot.handKey] ?? {},
            evs: node.ev[spot.handKey] ?? {},
          },
          action,
        );
        graded.push({
          node: `${node.ref} ${spot.handKey} ${action}`,
          text: [templateExplanation(result, "never"), templateExplanation(result, "solver")],
        });
      }
    }

    return graded;
  }

  it("never prints an identifier in a template explanation", () => {
    const offenders: string[] = [];

    for (const { node, text } of everyGradedDecision()) {
      for (const line of text) {
        const match = SNAKE.exec(line);
        if (match !== null) offenders.push(`${node}: "${line}"`);
      }
    }

    expect(offenders.slice(0, 10), `${offenders.length} explanations print an identifier`).toEqual(
      [],
    );
  });

  it("never prints an identifier in a template hint", () => {
    const offenders: string[] = [];

    for (const [index, node] of data.preflop.entries()) {
      const spot = generateSpot(
        { type: "preflop", heroPos: node.heroPos, actionSeq: node.actionSeq },
        data,
        `hint:${String(index)}`,
      );
      const view = {
        heroPos: spot.heroPos,
        street: "preflop" as const,
        potBb: spot.potBb,
        effStackBb: spot.effStackBb,
        actionHistory: spot.actionHistory,
        legalActions: spot.legalActions,
        handClass: null,
        boardCards: 0,
        preflop: preflopContextOf(node.actionSeq),
      };

      for (const level of [1, 2, 3] as const) {
        const best = Object.entries(node.strategy[spot.handKey] ?? {}).sort(
          (a, b) => b[1] - a[1],
        )[0]?.[0];
        const text = templateHint(level, view, level === 3 ? (best ?? null) : null);
        if (SNAKE.test(text)) offenders.push(`${node.ref} level ${String(level)}: "${text}"`);
      }
    }

    expect(offenders.slice(0, 10), `${offenders.length} hints print an identifier`).toEqual([]);
  });
});

describe("components", () => {
  /*
   * JSX children only. A prop carrying the identifier is correct and necessary —
   * `data-action={action}` is what the e2e suite and the server both read — so a
   * scan that flagged every appearance of the variable would flag the design.
   * What must never happen is the identifier reaching a TEXT NODE.
   */
  it("interpolates no bare action identifier into rendered text", () => {
    const offenders: string[] = [];

    /*
     * The whole expression, and nothing but. `{labelFor(action, bb)}` and
     * `{(action.amount / bb).toFixed(1)}` both pass an action through something
     * before it is printed and are fine; `{band.action}` is the identifier
     * itself arriving on screen. Anything wider than this flagged prop
     * destructuring, type annotations and JSX comments — and a guard that cries
     * wolf gets switched off, which is worse than not having one.
     */
    const BARE = /^(?:[A-Za-z_$][\w$]*\.)*(?:action|chosenAction|bestAction|topAction)$/;

    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf8");
      // Only files that handle poker actions at all. `action` is also an
      // ordinary React prop name for a button slot.
      if (!/@\/poker\/|@\/lib\/(?:action-label|arena-preset|grader)/.test(source)) continue;

      // Text between a closing `>` and the next opening `<` — what a reader sees.
      for (const region of source.matchAll(/>([^<>]*)</g)) {
        const text = region[1] ?? "";
        for (const expression of text.matchAll(/\{([^{}]+)\}/g)) {
          const code = (expression[1] ?? "").trim();
          if (!BARE.test(code)) continue;
          offenders.push(`${file.replace(`${process.cwd()}/`, "")}: {${code}}`);
        }
      }
    }

    expect(
      [...new Set(offenders)],
      `these render a raw action identifier:\n${[...new Set(offenders)].join("\n")}`,
    ).toEqual([]);
  });
});

describe("the frequency capsules", () => {
  /*
   * A capsule states the frequency of the button directly beneath it. The row
   * used to be sorted descending by frequency while the buttons rendered in
   * `legalActions` order, so a hand the solver called 60% of the time printed
   * "60%" above Fold — the screen stating the exact opposite of the strategy it
   * had just graded the user against.
   */
  const result = {
    frequencies: { fold: 0.1, call: 0.6, raise: 0.3 },
    alternativeActions: [
      { action: "fold", evLoss: 1.2 },
      { action: "raise", evLoss: 0.4 },
    ],
  };

  it("follows button order, not frequency order", () => {
    const segments = capsuleSegments(["fold", "call", "raise"], result);
    expect(segments.map((s) => s.action)).toEqual(["fold", "call", "raise"]);
    expect(segments.map((s) => s.freq)).toEqual([0.1, 0.6, 0.3]);
  });

  it("emits one capsule per legal action, including the ones never played", () => {
    // A gap in the row shifts every capsule after it onto the wrong button,
    // which breaks the correspondence exactly as badly as a reorder.
    const segments = capsuleSegments(["fold", "call", "raise", "allin"], result);
    expect(segments).toHaveLength(4);
    expect(segments[3]).toEqual({ action: "allin", freq: 0, evLoss: 0 });
  });

  it("carries the EV loss belonging to its own action", () => {
    const segments = capsuleSegments(["fold", "call", "raise"], result);
    expect(segments[0]?.evLoss).toBe(1.2);
    expect(segments[1]?.evLoss).toBe(0);
    expect(segments[2]?.evLoss).toBe(0.4);
  });
});
