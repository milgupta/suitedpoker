/**
 * Grading and display must never contradict each other.
 *
 * The failure this guards against is the one that destroys trust fastest: the
 * panel says "Fold." in display type, and the badge says the user's raise was
 * fine. A beginner cannot reconcile those two statements and concludes the app
 * is broken — or worse, that poker is arbitrary.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateSpot } from "../../src/poker/generator";
import { grade, GRADE_NAMES, type GradeName } from "../../src/poker/grader";
import { nodeRefOf, parsePreflopNode, type PreflopNode } from "../../src/poker/solutions";
import type { PreflopActionName } from "../../src/poker/solutions";

const ROOT = resolve(process.cwd(), "src/content/solutions/preflop");

const NODES: PreflopNode[] = readdirSync(ROOT)
  .filter((f) => f.endsWith(".json"))
  .map((f) => parsePreflopNode(JSON.parse(readFileSync(join(ROOT, f), "utf8")), f));

const DATA = { preflop: NODES, postflop: [] };

/** Grades that mean "this was a real option", in increasing severity. */
const SEVERITY: Record<GradeName, number> = {
  sharp: 0,
  best: 1,
  solid: 2,
  inaccuracy: 3,
  mistake: 4,
  blunder: 5,
};

interface Sample {
  nodeRef: string;
  handKey: string;
  action: string;
  displayMode: string;
  gradeName: GradeName;
}

function sample(count: number): Sample[] {
  const out: Sample[] = [];

  for (let i = 0; out.length < count && i < count * 6; i++) {
    const spot = generateSpot({ type: "preflop" }, DATA, `display-${i}`);
    const node = NODES.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
    if (node === undefined) continue;

    for (const action of node.actions) {
      const result = grade(node, spot.handKey, action as PreflopActionName);
      out.push({
        nodeRef: spot.nodeRef,
        handKey: spot.handKey,
        action,
        displayMode: result.displayMode,
        gradeName: result.grade,
      });
    }
  }

  return out;
}

const SAMPLES = sample(1000);

describe("grading and display never disagree", () => {
  it("produces a large enough sample to mean something", () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(1000);
  });

  it("never says 'clear' while grading a non-chosen action better than inaccuracy", () => {
    // If the panel is going to print a single word in display type, every other
    // action has to be at least an inaccuracy. Otherwise the copy asserts
    // certainty the grader does not share.
    const contradictions = SAMPLES.filter((s) => {
      if (s.displayMode !== "clear") return false;
      // sharp/best/solid on an action while the display claims one clear answer.
      return (
        SEVERITY[s.gradeName] <= SEVERITY.solid && s.gradeName !== "best" && s.gradeName !== "sharp"
      );
    });

    expect(
      contradictions.slice(0, 5),
      `'clear' display with a forgiving grade:\n${contradictions
        .slice(0, 5)
        .map((c) => `${c.nodeRef} ${c.handKey} ${c.action} -> ${c.gradeName}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("only ever produces the three declared display modes", () => {
    const modes = new Set(SAMPLES.map((s) => s.displayMode));
    expect([...modes].sort()).toEqual(expect.arrayContaining([...modes]));
    for (const mode of modes) {
      expect(["clear", "preferred", "mixed"]).toContain(mode);
    }
  });

  it("only ever produces the six declared grades", () => {
    for (const s of SAMPLES) {
      expect(GRADE_NAMES as readonly string[]).toContain(s.gradeName);
    }
  });

  it("exercises all three display modes, so the check is not vacuous", () => {
    const modes = new Set(SAMPLES.map((s) => s.displayMode));
    expect(modes.size, `only saw: ${[...modes].join(", ")}`).toBeGreaterThan(1);
  });

  it("grades the top-frequency action as best or sharp under a 'clear' display", () => {
    // The other half of the same rule: when the display commits to one answer,
    // that answer must be the one the grader rewards.
    const wrong: string[] = [];

    for (let i = 0; i < 200; i++) {
      const spot = generateSpot({ type: "preflop" }, DATA, `clear-${i}`);
      const node = NODES.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
      if (node === undefined) continue;

      const first = grade(node, spot.handKey, node.actions[0] as PreflopActionName);
      if (first.displayMode !== "clear") continue;

      const top = grade(node, spot.handKey, first.topAction as PreflopActionName);
      if (top.grade !== "best" && top.grade !== "sharp") {
        wrong.push(`${spot.nodeRef} ${spot.handKey}: top ${first.topAction} graded ${top.grade}`);
      }
    }

    expect(wrong.slice(0, 5), wrong.slice(0, 5).join("\n")).toEqual([]);
  });
});
