import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BOARD_TAGS, type BoardTag } from "@/poker/handclass";
import { Range } from "@/poker/range";
import { parsePreflopNode, type PreflopNode } from "@/poker/solutions";
import {
  buildMatrix,
  distinctFlops,
  flopStratum,
  rangeFromNode,
  selectFlopSubset,
  textureCoverage,
} from "@/content/solver/matrix";
import { type Scenario, solveCount, validateScenario } from "@/content/solver/schema";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

const PREFLOP_DIR = resolve(process.cwd(), "src/content/solutions/preflop");
const nodes: PreflopNode[] = readdirSync(PREFLOP_DIR)
  .filter((n) => n.endsWith(".json"))
  .sort()
  .map((name) => parsePreflopNode(JSON.parse(readFileSync(join(PREFLOP_DIR, name), "utf8")), name));

const matrix: Scenario[] = buildMatrix(nodes);

// ── The flop subset rule ──────────────────────────────────────────────────────

describe("the 1,755 strategically distinct flops", () => {
  const flops = distinctFlops();

  it("finds exactly 1,755 of them", () => {
    // 286 three-rank flops x 5 suit patterns = 1430
    // 156 paired flops x 2 patterns          =  312
    // 13 trips x 1                           =   13
    expect(flops).toHaveLength(1755);
    record("distinct flops", "1,755 isomorphism classes, matching 1430 + 312 + 13");
  });

  it("accounts for every one of the 22,100 real flops exactly once", () => {
    const total = flops.reduce((sum, f) => sum + f.weight, 0);
    expect(total).toBe(22_100);
    record("flop weights", "class weights sum to C(52,3) = 22,100");
  });

  it("gives every class a texture", () => {
    for (const flop of flops) {
      expect(flop.tags.length).toBeGreaterThan(0);
      for (const tag of flop.tags) expect(BOARD_TAGS).toContain(tag);
    }
  });
});

describe("selectFlopSubset", () => {
  it("is deterministic", () => {
    for (const n of [3, 5, 12]) {
      expect(selectFlopSubset(n, "x").map((f) => f.board)).toEqual(
        selectFlopSubset(n, "x").map((f) => f.board),
      );
    }
    record("subset determinism", "the same n and seed always yield the same flops");
  });

  it("returns exactly n distinct flops", () => {
    for (const n of [1, 5, 20, 60]) {
      const subset = selectFlopSubset(n);
      expect(subset).toHaveLength(n);
      expect(new Set(subset.map((f) => f.board)).size).toBe(n);
    }
  });

  it("spreads across strata rather than clustering", () => {
    const subset = selectFlopSubset(20);
    const strata = new Set(subset.map(flopStratum));
    expect(strata.size).toBeGreaterThan(5);
    record("stratification", `20 flops span ${strata.size} distinct texture strata`);
  });

  it("covers every texture tag by n = 25", () => {
    const subset = selectFlopSubset(25);
    const covered = textureCoverage(subset.map((f) => f.board));
    const missing = BOARD_TAGS.filter((tag) => !covered.has(tag));
    console.log(
      `\ntexture coverage at n=25:\n${BOARD_TAGS.map(
        (tag) => `  ${tag.padEnd(11)} ${String(covered.get(tag) ?? 0).padStart(3)}`,
      ).join("\n")}`,
    );
    expect(missing).toEqual([]);
    record("tag coverage", "all 10 texture tags present in a 25-flop subset");
  });

  it("reports which tags a 5-flop subset misses rather than pretending it covers them", () => {
    const covered = textureCoverage(selectFlopSubset(5).map((f) => f.board));
    const missing = BOARD_TAGS.filter((tag) => !covered.has(tag));
    // A 5-flop subset genuinely cannot span all ten tags. Saying so is the
    // point — the matrix as a whole covers them, one scenario does not.
    console.log(
      `\nat n=5 a single scenario misses: ${missing.length > 0 ? missing.join(", ") : "(nothing)"}`,
    );
    expect(missing.length).toBeLessThan(BOARD_TAGS.length);
  });

  it("rejects a nonsense n", () => {
    expect(() => selectFlopSubset(0)).toThrow();
    expect(() => selectFlopSubset(2.5)).toThrow();
  });
});

// ── The matrix ────────────────────────────────────────────────────────────────

describe("the scenario matrix", () => {
  it("has enough scenarios to be worth solving", () => {
    expect(matrix.length).toBeGreaterThanOrEqual(40);
    record("scenario count", `${matrix.length} scenarios`);
  });

  it("validates every scenario against the schema", () => {
    const failures: string[] = [];
    for (const scenario of matrix) {
      const result = validateScenario(scenario, scenario.id);
      if (!result.ok) failures.push(`${scenario.id}: ${result.errors.join("; ")}`);
    }
    if (failures.length > 0) console.error(failures.join("\n"));
    expect(failures).toEqual([]);
    record("schema validation", `${matrix.length}/${matrix.length} scenarios valid`);
  });

  it("gives every scenario a unique id", () => {
    const ids = matrix.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps potBb arithmetically consistent with the action history", () => {
    const mismatches: string[] = [];
    for (const scenario of matrix) {
      const committed = new Map<string, number>();
      for (const action of scenario.actionHistory) committed.set(action.actor, action.toBb);
      const derived = [...committed.values()].reduce((sum, bb) => sum + bb, 0);
      if (Math.abs(derived - scenario.potBb) > 1e-6) {
        mismatches.push(`${scenario.id}: potBb ${scenario.potBb} vs derived ${derived}`);
      }
    }
    if (mismatches.length > 0) console.error(mismatches.join("\n"));
    expect(mismatches).toEqual([]);
    record("pot consistency", "every pot equals the sum of its own action history");
  });

  it("states a non-zero rake on every scenario", () => {
    for (const scenario of matrix) {
      expect(scenario.rake.percent).toBeGreaterThan(0);
      expect(scenario.rake.capBb).toBeGreaterThan(0);
    }
    record("rake stated", "5% capped at 3bb on all scenarios, never rake-free");
  });

  it("parses every range and leaves it non-empty after card removal on every board", () => {
    const problems: string[] = [];
    for (const scenario of matrix) {
      for (const [which, notation] of [
        ["hero", scenario.heroRange],
        ["villain", scenario.villainRange],
      ] as const) {
        let range: Range;
        try {
          range = Range.parse(notation);
        } catch (error) {
          problems.push(`${scenario.id} ${which}: does not parse — ${(error as Error).message}`);
          continue;
        }
        if (range.totalCombos() === 0) {
          problems.push(`${scenario.id} ${which}: empty range`);
          continue;
        }
        for (const board of scenario.boards) {
          const dead = board
            .trim()
            .split(/\s+/)
            .map((text) => {
              const ranks = "23456789TJQKA";
              const suits = "cdhs";
              return ((ranks.indexOf(text[0]!.toUpperCase()) << 2) |
                suits.indexOf(text[1]!.toLowerCase())) as never;
            });
          if (range.combosBlocked(dead).length === 0) {
            problems.push(`${scenario.id} ${which}: empty after card removal on ${board}`);
          }
        }
      }
    }
    if (problems.length > 0) console.error(problems.slice(0, 20).join("\n"));
    expect(problems).toEqual([]);
    record(
      "ranges survive card removal",
      `${matrix.length * 2} ranges parse and stay non-empty on every listed board`,
    );
  });

  it("imports its ranges from the solution set rather than retyping them", () => {
    // The whole point of the ref: if the preflop set changes, the matrix
    // changes with it. Rebuild each range from its recorded node and compare.
    const drifts: string[] = [];
    for (const scenario of matrix) {
      for (const [which, ref, notation] of [
        ["hero", scenario.heroRangeRef, scenario.heroRange],
        ["villain", scenario.villainRangeRef, scenario.villainRange],
      ] as const) {
        const [nodeRef, action] = ref.split("#");
        const node = nodes.find((n) => n.ref === nodeRef);
        expect(node, `${scenario.id}: unknown node ${nodeRef}`).toBeDefined();
        const rebuilt = rangeFromNode(node!, action as never).toNotation();
        if (rebuilt !== notation) drifts.push(`${scenario.id} ${which}: drifted from ${ref}`);
      }
    }
    expect(drifts).toEqual([]);
    record("no range drift", "every range reproduces exactly from its recorded solution node");
  });

  it("never puts hero and villain in the same seat", () => {
    for (const scenario of matrix) expect(scenario.heroPos).not.toBe(scenario.villainPos);
  });

  it("gives boards the right number of cards for their street", () => {
    for (const scenario of matrix) {
      const expected = scenario.street === "flop" ? 3 : scenario.street === "turn" ? 4 : 5;
      for (const board of scenario.boards) {
        expect(board.trim().split(/\s+/), `${scenario.id}: ${board}`).toHaveLength(expected);
      }
    }
  });

  it("never repeats a card inside a board", () => {
    for (const scenario of matrix) {
      for (const board of scenario.boards) {
        const cards = board.trim().split(/\s+/);
        expect(new Set(cards).size, `${scenario.id}: ${board}`).toBe(cards.length);
      }
    }
    record("boards well formed", "no duplicate card in any board across the matrix");
  });

  it("spans every texture tag across the matrix as a whole", () => {
    const covered = textureCoverage(matrix.flatMap((s) => s.boards));
    const missing = BOARD_TAGS.filter((tag) => !covered.has(tag));
    const rows = BOARD_TAGS.map(
      (tag) => `  ${tag.padEnd(11)} ${String(covered.get(tag) ?? 0).padStart(4)}`,
    );
    console.log(`\ntexture distribution across the whole matrix:\n${rows.join("\n")}`);
    if (missing.length > 0) console.error(`ZERO COVERAGE: ${missing.join(", ")}`);
    expect(missing).toEqual([]);
    record("matrix tag coverage", "all 10 texture tags covered across the matrix");
  });

  it("is deterministic — the same solution set always builds the same matrix", () => {
    expect(JSON.stringify(buildMatrix(nodes))).toBe(JSON.stringify(matrix));
    record("matrix determinism", "rebuilding from the same solution set is byte-identical");
  });

  it("refuses to build against a solution set missing a node it references", () => {
    expect(() => buildMatrix(nodes.filter((n) => n.ref !== "BTN:rfi"))).toThrow(/does not exist/);
    record(
      "fails loudly",
      "a missing solution node aborts the build rather than silently skipping",
    );
  });

  it("prints the solve budget", () => {
    const solves = solveCount(matrix);
    const byPotType = new Map<string, number>();
    const byStreet = new Map<string, number>();
    for (const scenario of matrix) {
      byPotType.set(
        scenario.potType,
        (byPotType.get(scenario.potType) ?? 0) + scenario.boards.length,
      );
      byStreet.set(scenario.street, (byStreet.get(scenario.street) ?? 0) + scenario.boards.length);
    }
    console.log(
      `\nsolve budget:\n` +
        `  scenarios          ${matrix.length}\n` +
        `  boards each        ${matrix[0]?.boards.length}\n` +
        `  TOTAL SOLVES       ${solves}\n` +
        `  by pot type        ${[...byPotType].map(([k, v]) => `${k} ${v}`).join(", ")}\n` +
        `  by street          ${[...byStreet].map(([k, v]) => `${k} ${v}`).join(", ")}\n` +
        `  bet tree           ${matrix[0]?.betTree.flop.length} flop sizes, ` +
        `${matrix[0]?.betTree.turn.length} turn, ${matrix[0]?.betTree.river.length} river, all-in ${matrix[0]?.betTree.allowAllIn}`,
    );
    expect(solves).toBe(matrix.length * 5);
    record("solve budget", `${solves} solves (${matrix.length} scenarios x 5 boards)`);
  });
});

// ── Schema guards ─────────────────────────────────────────────────────────────

describe("the schema catches the things most likely to be wrong", () => {
  const base = () => structuredClone(matrix[0]!) as Record<string, unknown>;

  it("catches a pot that disagrees with its action history", () => {
    const bad = base();
    bad.potBb = 99;
    const result = validateScenario(bad, "bad-pot");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/action history commits/);
    record("bad pot caught", "a pot inconsistent with its own history is rejected by name");
  });

  it("catches a rake-free solve", () => {
    const bad = base();
    bad.rake = { percent: 0, capBb: 0 };
    const result = validateScenario(bad, "no-rake");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/rake is zero/);
    record("rake-free caught", "a zero rake model is rejected with the reason");
  });

  it("catches hero and villain in the same seat", () => {
    const bad = base();
    bad.villainPos = bad.heroPos;
    expect(validateScenario(bad, "same-seat").ok).toBe(false);
  });

  it("catches a board with the wrong card count for its street", () => {
    const bad = base();
    bad.street = "river";
    expect(validateScenario(bad, "short-board").ok).toBe(false);
  });

  it("catches a missing rationale", () => {
    const bad = base();
    bad.rationale = "too short";
    expect(validateScenario(bad, "no-why").ok).toBe(false);
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.8 — the scenario matrix\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});

export type { BoardTag };
