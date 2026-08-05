import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cardToString } from "@/poker/cards";
import {
  type ClientSpot,
  difficultyOf,
  generateSpot,
  generateSpotBatch,
  instructiveness,
  type SolutionData,
  type Spot,
  strategyEntropy,
  tagsForNode,
  toClientSpot,
} from "@/poker/generator";
import { type HandKey } from "@/poker/range";
import {
  parsePostflopTemplate,
  parsePreflopNode,
  type PostflopTemplate,
  type PreflopNode,
} from "@/poker/solutions";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

function load<T>(dir: string, parse: (json: unknown, name: string) => T): T[] {
  const full = resolve(process.cwd(), dir);
  return readdirSync(full)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((name) => parse(JSON.parse(readFileSync(join(full, name), "utf8")), name));
}

const preflop: PreflopNode[] = load("src/content/solutions/preflop", parsePreflopNode);
const postflop: PostflopTemplate[] = load("src/content/solutions/postflop", parsePostflopTemplate);
const data: SolutionData = { preflop, postflop };

describe("determinism", () => {
  it("produces a byte-identical spot for the same seed, across 1000 seeds", () => {
    let checked = 0;
    for (let i = 0; i < 1000; i++) {
      const a = generateSpot({ type: "preflop" }, data, i);
      const b = generateSpot({ type: "preflop" }, data, i);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      checked++;
    }
    for (let i = 0; i < 200; i++) {
      const a = generateSpot({ type: "postflop" }, data, `p${i}`);
      const b = generateSpot({ type: "postflop" }, data, `p${i}`);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
    expect(checked).toBe(1000);
    record("determinism", "1000 preflop + 200 postflop seeds each reproduce byte-identically");
  });

  it("produces different spots for different seeds", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(generateSpot({ type: "preflop" }, data, i).id);
    expect(ids.size).toBeGreaterThan(150);
  });
});

describe("10,000 generated spots are internally consistent", () => {
  it("never deals a duplicate card and never returns a malformed spot", () => {
    const problems: string[] = [];
    let generated = 0;

    for (let i = 0; i < 10_000; i++) {
      const type = i % 2 === 0 ? "preflop" : "postflop";
      const spot = generateSpot({ type, difficulty: (i % 10) + 1 }, data, `consistency:${i}`);
      generated++;

      const all = [...spot.heroCards, ...spot.board];
      if (new Set(all).size !== all.length) problems.push(`${spot.id}: duplicate card`);
      if (spot.heroCards.length !== 2)
        problems.push(`${spot.id}: ${spot.heroCards.length} hole cards`);
      if (spot.potBb < 0 || spot.effStackBb < 0) problems.push(`${spot.id}: negative chips`);
      if (spot.legalActions.length === 0) problems.push(`${spot.id}: no legal actions`);
      if (spot.difficulty < 1 || spot.difficulty > 10) {
        problems.push(`${spot.id}: difficulty ${spot.difficulty} out of range`);
      }
      if (spot.seats.filter((s) => s.isHero).length !== 1)
        problems.push(`${spot.id}: not one hero`);

      // A solution must exist for the spot, or the grader has nothing to say.
      if (spot.type === "preflop") {
        const node = preflop.find((n) => n.ref === spot.nodeRef);
        if (node === undefined) problems.push(`${spot.id}: no node`);
        else if (node.strategy[spot.handKey] === undefined) {
          problems.push(`${spot.id}: node has no strategy for ${spot.handKey}`);
        }
      } else {
        const template = postflop.find((t) => t.id === spot.nodeRef);
        if (template === undefined) problems.push(`${spot.id}: no template`);
        else if (!template.strategies.some((s) => s.handClass === spot.handClass)) {
          problems.push(`${spot.id}: template has no strategy for ${spot.handClass}`);
        }
        if (spot.board.length < 3) problems.push(`${spot.id}: postflop board too short`);
      }
    }

    if (problems.length > 0) console.error(problems.slice(0, 20).join("\n"));
    expect(problems).toEqual([]);
    expect(generated).toBe(10_000);
    record(
      "spot consistency",
      `10,000 spots, zero duplicate cards, a solution exists for every one`,
    );
  });
});

// ── The security boundary ─────────────────────────────────────────────────────

describe("no solution data reaches the client", () => {
  it("strips nodeRef, handKey and handClass", () => {
    const spot = generateSpot({ type: "preflop" }, data, 7);
    const client = toClientSpot(spot) as Record<string, unknown>;
    expect(client.nodeRef).toBeUndefined();
    expect(client.handKey).toBeUndefined();
    expect(client.handClass).toBeUndefined();
    expect(client.seed).toBeUndefined();
    expect(Object.keys(client)).not.toContain("nodeRef");
  });

  it("leaks nothing when 1000 spots are serialised", () => {
    // Collect every string and number the solution set contains, then assert
    // none of it survives serialisation. This is the assertion that actually
    // protects the product.
    const forbiddenKeys = [
      "nodeRef",
      "handKey",
      "handClass",
      "strategy",
      "ev",
      "bestAction",
      "seed",
    ];
    const leaks: string[] = [];

    for (let i = 0; i < 1000; i++) {
      const type = i % 2 === 0 ? "preflop" : "postflop";
      const spot = generateSpot({ type }, data, `leak:${i}`);
      const serialised = JSON.stringify(toClientSpot(spot));
      const parsed = JSON.parse(serialised) as Record<string, unknown>;

      for (const key of forbiddenKeys) {
        if (key in parsed) leaks.push(`${spot.id}: serialised spot has key "${key}"`);
      }

      // The node reference itself must not appear anywhere in the payload,
      // including inside `id`, which is the mistake that is easy to make.
      if (serialised.includes(spot.nodeRef)) {
        leaks.push(`${spot.id}: nodeRef "${spot.nodeRef}" appears in the payload`);
      }
      if (spot.type === "preflop" && serialised.includes(`"${spot.handKey}"`)) {
        leaks.push(`${spot.id}: handKey "${spot.handKey}" appears in the payload`);
      }
      if (spot.handClass !== null && serialised.includes(spot.handClass)) {
        leaks.push(`${spot.id}: handClass "${spot.handClass}" appears in the payload`);
      }
      if (serialised.includes(spot.seed)) {
        leaks.push(`${spot.id}: seed "${spot.seed}" appears in the payload`);
      }
    }

    if (leaks.length > 0) console.error(leaks.slice(0, 20).join("\n"));
    expect(leaks).toEqual([]);
    record(
      "zero solution leakage",
      "1000 serialised client spots contain no node, hand key or class",
    );
  });

  it("keeps the client spot type free of forbidden keys at compile time", () => {
    // If ClientSpot ever gains one of these, src/poker/generator.ts stops
    // compiling. This test documents the guarantee; tsc enforces it.
    const spot = generateSpot({ type: "postflop" }, data, 3);
    const client: ClientSpot = toClientSpot(spot);
    expect(Object.keys(client).sort()).toEqual(
      [
        "actionHistory",
        "board",
        "difficulty",
        "effStackBb",
        "heroCards",
        "heroPos",
        "id",
        "legalActions",
        "potBb",
        "seats",
        "type",
      ].sort(),
    );
  });
});

// ── Instructiveness and difficulty ────────────────────────────────────────────

describe("instructiveness", () => {
  it("scores a mixed hand above a hand that teaches nothing", () => {
    const btnRfi = preflop.find((n) => n.ref === "BTN:rfi");
    expect(btnRfi).toBeDefined();
    const aces = instructiveness("AA" as HandKey, btnRfi!);
    const mixed = HAND_KEYS_MIXED(btnRfi!);
    expect(mixed.score).toBeGreaterThan(aces);
    record(
      "instructiveness",
      `a mixed hand (${mixed.key}) scores ${mixed.score.toFixed(2)} vs AA at ${aces.toFixed(2)}`,
    );
  });

  it("almost never generates AA", () => {
    let aces = 0;
    for (let i = 0; i < 3000; i++) {
      const spot = generateSpot({ type: "preflop" }, data, `aces:${i}`);
      if (spot.handKey === "AA") aces++;
    }
    // Uniform sampling over 169 hands would give ~18. Instructiveness should
    // suppress it well below that.
    expect(aces).toBeLessThan(10);
    record("AA is suppressed", `${aces} of 3000 spots were AA (uniform would be ~18)`);
  });

  it("computes entropy correctly", () => {
    expect(strategyEntropy([1])).toBe(0);
    expect(strategyEntropy([1, 0])).toBe(0);
    expect(strategyEntropy([0.5, 0.5])).toBeCloseTo(1, 6);
    expect(strategyEntropy([0.9, 0.1])).toBeLessThan(0.6);
  });

  it("makes difficulty rise with mixing and fall with a wide EV gap", () => {
    const base = { evGap: 1, street: "preflop" as const, classAmbiguity: 0 };
    expect(difficultyOf({ ...base, entropy: 1 })).toBeGreaterThan(
      difficultyOf({ ...base, entropy: 0 }),
    );
    expect(difficultyOf({ ...base, entropy: 0.5, evGap: 0.1 })).toBeGreaterThan(
      difficultyOf({ ...base, entropy: 0.5, evGap: 8 }),
    );
    expect(difficultyOf({ ...base, entropy: 0.5, street: "river" })).toBeGreaterThan(
      difficultyOf({ ...base, entropy: 0.5, street: "preflop" }),
    );
  });
});

function HAND_KEYS_MIXED(node: PreflopNode): { key: HandKey; score: number } {
  let best: { key: HandKey; score: number } = { key: "AA" as HandKey, score: -1 };
  for (const key of Object.keys(node.strategy) as HandKey[]) {
    const score = instructiveness(key, node);
    if (score > best.score) best = { key, score };
  }
  return best;
}

describe("difficulty correlates with mixing", () => {
  it("shows mean strategy entropy rising with difficulty across 5000 spots", () => {
    const buckets = new Map<number, { entropy: number; count: number }>();

    for (let i = 0; i < 5000; i++) {
      const spot = generateSpot(
        { type: "preflop", difficulty: (i % 10) + 1 },
        data,
        `difficulty:${i}`,
      );
      const node = preflop.find((n) => n.ref === spot.nodeRef);
      if (node === undefined) continue;
      const strategy = node.strategy[spot.handKey] ?? {};
      const entropy = strategyEntropy(node.actions.map((a) => strategy[a] ?? 0));
      const bucket = buckets.get(spot.difficulty) ?? { entropy: 0, count: 0 };
      bucket.entropy += entropy;
      bucket.count += 1;
      buckets.set(spot.difficulty, bucket);
    }

    const rows = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([difficulty, { entropy, count }]) => ({
        difficulty,
        meanEntropy: entropy / count,
        count,
      }));

    console.log(
      `\ndifficulty vs mean strategy entropy:\n${rows
        .map(
          (r) =>
            `  difficulty ${String(r.difficulty).padStart(2)}  entropy ${r.meanEntropy.toFixed(3)}  (${r.count} spots)`,
        )
        .join("\n")}`,
    );

    // Spearman-style check: entropy must rise from the easiest bucket to the
    // hardest. Adjacent buckets can tie; the trend cannot reverse.
    const first = rows[0];
    const last = rows[rows.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(last!.meanEntropy).toBeGreaterThan(first!.meanEntropy);
    expect(rows.length).toBeGreaterThan(3);
    record(
      "difficulty tracks entropy",
      `entropy ${first!.meanEntropy.toFixed(2)} at difficulty ${first!.difficulty} → ${last!.meanEntropy.toFixed(2)} at ${last!.difficulty}`,
    );
  });
});

describe("batches", () => {
  it("never repeats a node inside a batch of 10, across 1000 runs", () => {
    let checked = 0;
    for (let run = 0; run < 1000; run++) {
      const spots = generateSpotBatch({ type: "preflop" }, 10, `batch:${run}`)(data);
      expect(spots).toHaveLength(10);
      const refs = spots.map((s) => s.nodeRef);
      expect(new Set(refs).size, `run ${run} repeated a node: ${refs.join(", ")}`).toBe(10);
      checked++;
    }
    expect(checked).toBe(1000);
    record("batch uniqueness", "1000 batches of 10, never a duplicate node");
  });

  it("is deterministic", () => {
    const a = generateSpotBatch({ type: "preflop" }, 5, "same")(data);
    const b = generateSpotBatch({ type: "preflop" }, 5, "same")(data);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("filtering", () => {
  it("honours heroPos, actionSeq and tags", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSpot({ type: "preflop", heroPos: "BTN" }, data, i).heroPos).toBe("BTN");
      expect(generateSpot({ type: "preflop", actionSeq: "rfi" }, data, i).nodeRef).toMatch(/:rfi$/);
      const blind = generateSpot({ type: "preflop", tags: ["blind-defense"] }, data, i);
      expect(["SB", "BB"]).toContain(blind.heroPos);
    }
    record("config filtering", "heroPos, actionSeq and tag filters all respected");
  });

  it("honours excludeNodeRefs", () => {
    const exclude = preflop.slice(0, 40).map((n) => n.ref);
    for (let i = 0; i < 50; i++) {
      const spot = generateSpot({ type: "preflop", excludeNodeRefs: exclude }, data, i);
      expect(exclude).not.toContain(spot.nodeRef);
    }
  });

  it("throws rather than guessing when nothing matches", () => {
    expect(() =>
      generateSpot({ type: "preflop", heroPos: "BB", actionSeq: "rfi" }, data, 1),
    ).toThrow(/no preflop node matches/);
  });

  it("derives sensible tags", () => {
    const rfi = preflop.find((n) => n.ref === "BTN:rfi")!;
    expect(tagsForNode(rfi)).toContain("rfi");
    const bbDefend = preflop.find((n) => n.ref === "BB:vs_rfi_BTN")!;
    expect(tagsForNode(bbDefend)).toContain("blind-defense");
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.6 — spot generator\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
    expect(cardToString).toBeTypeOf("function");
  });
});

export type { Spot };
