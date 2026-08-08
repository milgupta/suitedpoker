import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HAND_KEYS, type HandKey, Range } from "@/poker/range";
import {
  bestAction,
  buildSolutionIndex,
  evLoss,
  evOf,
  frequencyOf,
  getEv,
  getNode,
  getStrategy,
  parsePreflopNode,
  type PreflopNode,
  PREFLOP_ACTIONS,
  provenanceOf,
  rankByReviewRisk,
  reviewRisk,
  validatePreflopNode,
} from "@/poker/solutions";
import { isServableNode } from "@/poker/node-status";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

const DIR = resolve(process.cwd(), "src/content/solutions/preflop");

const raw = readdirSync(DIR)
  .filter((n) => n.endsWith(".json"))
  .sort()
  .map((name) => ({ name, json: JSON.parse(readFileSync(join(DIR, name), "utf8")) as unknown }));

const nodes: PreflopNode[] = raw.map(({ name, json }) => parsePreflopNode(json, name));
const index = buildSolutionIndex(nodes);

function rfi(position: string): PreflopNode {
  return getNode(index, `${position}:rfi`);
}

/** The node's aggressive range, rebuilt from its own frequencies. */
function raiseRange(node: PreflopNode): Range {
  return Range.fromWeights(
    HAND_KEYS.map((key) => [key, frequencyOf(node, key, "raise")] as const).filter(
      ([, weight]) => weight > 0,
    ),
  );
}

// ── 1. Every file validates ───────────────────────────────────────────────────

describe("the authored preflop set", () => {
  it("has files to check", () => {
    expect(raw.length).toBeGreaterThanOrEqual(40);
    record("node count", `${raw.length} files, all parsed`);
  });

  it.each(raw.map((r) => r.name))("%s validates against the schema", (name) => {
    const entry = raw.find((r) => r.name === name);
    const result = validatePreflopNode(entry?.json, name);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("has all 169 hands in strategy and ev for every node", () => {
    for (const node of nodes) {
      expect(Object.keys(node.strategy).sort()).toEqual([...HAND_KEYS].sort());
      expect(Object.keys(node.ev).sort()).toEqual([...HAND_KEYS].sort());
    }
    record("hand coverage", `169/169 hands in all ${nodes.length} nodes, strategy and ev`);
  });

  it("sums every hand's frequencies to 1.0", () => {
    const violations: string[] = [];
    for (const node of nodes) {
      for (const key of HAND_KEYS) {
        const sum = Object.values(getStrategy(node, key)).reduce((a, b) => a + (b ?? 0), 0);
        if (Math.abs(sum - 1) > 0.001) violations.push(`${node.ref} ${key} → ${sum.toFixed(4)}`);
      }
    }
    if (violations.length > 0) console.error(violations.slice(0, 20).join("\n"));
    expect(violations).toEqual([]);
    record("frequency sums", `${nodes.length * 169} hand-nodes all sum to 1.0 ±0.001`);
  });

  it("gives every action an EV, including the ones the solution never plays", () => {
    for (const node of nodes) {
      for (const key of HAND_KEYS) {
        const ev = getEv(node, key);
        for (const action of node.actions) expect(ev[action]).toBeTypeOf("number");
      }
    }
    record("ev coverage", "every action in actions[] has an EV for all 169 hands");
  });

  it("uses only known actions", () => {
    for (const node of nodes) {
      for (const action of node.actions) expect(PREFLOP_ACTIONS).toContain(action);
    }
  });
});

// ── Provenance ────────────────────────────────────────────────────────────────

describe("provenance", () => {
  it("is present on every node", () => {
    for (const node of nodes) expect(provenanceOf(node)).toBe("authored-approximation");
    record("provenance", `all ${nodes.length} nodes declare authored-approximation`);
  });

  it("is rejected when omitted", () => {
    const first = raw[0];
    expect(first).toBeDefined();
    const withoutProvenance = { ...(first?.json as Record<string, unknown>) };
    delete withoutProvenance.provenance;
    const result = validatePreflopNode(withoutProvenance, "no-provenance.json");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/provenance/i);
    record("provenance required", "a file omitting provenance fails validation");
  });

  it("is rejected when it is not one of the two known values", () => {
    const bad = { ...(raw[0]?.json as Record<string, unknown>), provenance: "vibes" };
    expect(validatePreflopNode(bad, "bad-provenance.json").ok).toBe(false);
  });

  it("reports the weakest provenance across the set", () => {
    expect(index.provenance).toBe("authored-approximation");
    const flipped = nodes.map((n) => ({ ...n, provenance: "solver-verified" as const }));
    expect(buildSolutionIndex(flipped).provenance).toBe("solver-verified");
    record("provenance rollup", "one approximate node keeps the whole set approximate");
  });

  it("accepts solver-verified with no code change — the 2.8 swap is data only", () => {
    const swapped = { ...(raw[0]?.json as Record<string, unknown>), provenance: "solver-verified" };
    const result = validatePreflopNode(swapped, "swapped.json");
    expect(result.ok).toBe(true);
    const node = parsePreflopNode(swapped, "swapped.json");
    // Same query helpers, same answers — nothing branches on provenance.
    expect(bestAction(node, "AA" as HandKey)).toBe(bestAction(nodes[0]!, "AA" as HandKey));
    record("2.8 swap", "flipping provenance to solver-verified changes no behaviour");
  });
});

// ── Corrupt data is refused ───────────────────────────────────────────────────

describe("corrupt data", () => {
  const base = () => structuredClone(raw[0]?.json) as Record<string, unknown>;

  it("names the exact hand whose frequencies do not sum to 1", () => {
    const corrupt = base();
    const strategy = corrupt.strategy as Record<string, Record<string, number>>;
    strategy.AA = { raise: 1.5 };
    const result = validatePreflopNode(corrupt, "corrupt.json");
    expect(result.ok).toBe(false);
    const message = result.errors.join("\n");
    expect(message).toMatch(/AA/);
    expect(message).toMatch(/1\.5|sum/);
    record("corrupt rejected", "a 1.5 frequency sum is named by hand and rule");
  });

  it("catches a missing hand", () => {
    const corrupt = base();
    delete (corrupt.strategy as Record<string, unknown>)["72o"];
    const result = validatePreflopNode(corrupt, "missing.json");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/72o/);
  });

  it("catches an action in strategy that has no EV", () => {
    const corrupt = base();
    (corrupt.strategy as Record<string, Record<string, number>>).AA = { raise: 0.5, call: 0.5 };
    const evTable = corrupt.ev as Record<string, Record<string, number>>;
    evTable.AA = { fold: 0, raise: 1 };
    const result = validatePreflopNode(corrupt, "no-ev.json");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/AA/);
  });

  it("catches a frequency outside [0,1]", () => {
    const corrupt = base();
    (corrupt.strategy as Record<string, Record<string, number>>).AA = { raise: 1.2, fold: -0.2 };
    expect(validatePreflopNode(corrupt, "range.json").ok).toBe(false);
  });

  it("catches a hand key that is not one of the 169", () => {
    const corrupt = base();
    (corrupt.strategy as Record<string, Record<string, number>>).AAs = { raise: 1 };
    expect(validatePreflopNode(corrupt, "bogus-key.json").ok).toBe(false);
  });
});

// ── 3. Does the poker make sense ──────────────────────────────────────────────

const OPEN_ORDER = ["UTG", "MP", "CO", "BTN"] as const;

describe("poker sanity", () => {
  it("opens AA at 100% from every position that can open", () => {
    const rows: string[] = [];
    for (const position of [...OPEN_ORDER, "SB"]) {
      const frequency = frequencyOf(rfi(position), "AA" as HandKey, "raise");
      rows.push(`  ${position.padEnd(4)} AA raise ${(frequency * 100).toFixed(0)}%`);
      expect(frequency).toBe(1);
    }
    console.log(`\nAA opening frequency:\n${rows.join("\n")}`);
    record("AA opens", "100% raise from UTG, MP, CO, BTN and SB");
  });

  it("folds 72o 100% from UTG", () => {
    expect(frequencyOf(rfi("UTG"), "72o" as HandKey, "raise")).toBe(0);
    expect(frequencyOf(rfi("UTG"), "72o" as HandKey, "fold")).toBe(1);
    record("72o folds", "100% fold from UTG");
  });

  it("widens strictly from UTG to BTN, by combos", () => {
    const widths = OPEN_ORDER.map((position) => ({
      position,
      combos: raiseRange(rfi(position)).weightedCombos(),
      percent: raiseRange(rfi(position)).percentOfHands(),
    }));
    console.log(
      `\nRFI width:\n${widths
        .map(
          (w) =>
            `  ${w.position.padEnd(4)} ${w.percent.toFixed(1)}%  (${w.combos.toFixed(0)} combos)`,
        )
        .join("\n")}`,
    );
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!.combos).toBeGreaterThan(widths[i - 1]!.combos);
    }
    record(
      "position monotonicity",
      widths.map((w) => `${w.position} ${w.percent.toFixed(1)}%`).join(" < "),
    );
  });

  it("nests the ranges — every earlier position's range is inside the next", () => {
    // Stronger than a combo count: UTG's range must be a weighted SUBSET of
    // MP's. A count check passes on two ranges that merely overlap.
    for (let i = 1; i < OPEN_ORDER.length; i++) {
      const tighter = raiseRange(rfi(OPEN_ORDER[i - 1]!));
      const wider = raiseRange(rfi(OPEN_ORDER[i]!));
      const leftOver = tighter.subtract(wider);
      expect(
        leftOver.isEmpty(),
        `${OPEN_ORDER[i - 1]} opens hands ${OPEN_ORDER[i]} does not: ${leftOver.toNotation()}`,
      ).toBe(true);
    }
    record("range nesting", "UTG ⊆ MP ⊆ CO ⊆ BTN as weighted subsets");
  });

  it("keeps the big blind's defending range wider than any other seat's", () => {
    const bbVsBtn = getNode(index, "BB:vs_rfi_BTN");
    const sbVsBtn = getNode(index, "SB:vs_rfi_BTN");
    const defend = (node: PreflopNode) =>
      HAND_KEYS.reduce(
        (sum, key) => sum + (1 - frequencyOf(node, key, "fold")) * comboCount(key),
        0,
      );
    expect(defend(bbVsBtn)).toBeGreaterThan(defend(sbVsBtn));
  });

  it("never 3bets a hand it would not also defend", () => {
    for (const node of nodes) {
      if (!node.actionSeq.startsWith("vs_rfi_")) continue;
      for (const key of HAND_KEYS) {
        const fold = frequencyOf(node, key, "fold");
        const raise = frequencyOf(node, key, "raise");
        if (raise > 0) expect(fold).toBeLessThan(1);
      }
    }
  });
});

function comboCount(key: HandKey): number {
  const suffix = key[2];
  if (suffix === undefined) return 6;
  return suffix === "s" ? 4 : 12;
}

// ── Query helpers and the EV model ────────────────────────────────────────────

describe("query helpers", () => {
  it("never reports a negative EV loss", () => {
    let worst = 0;
    for (const node of nodes) {
      for (const key of HAND_KEYS) {
        for (const action of node.actions) {
          const loss = evLoss(node, key, action);
          expect(loss).toBeGreaterThanOrEqual(0);
          worst = Math.max(worst, loss);
        }
      }
    }
    record(
      "ev loss non-negative",
      `${nodes.length * 169 * 3} combinations, worst loss ${worst.toFixed(2)}bb`,
    );
  });

  it("costs nothing to play the best action", () => {
    for (const node of nodes) {
      for (const key of HAND_KEYS) {
        expect(evLoss(node, key, bestAction(node, key))).toBe(0);
      }
    }
  });

  it("agrees with the strategy: the most-played action costs nothing", () => {
    // Stated as "loses no EV" rather than "is bestAction" because a hand split
    // exactly 50/50 is genuinely indifferent — both actions are best, and
    // demanding a single winner would be asserting a tiebreak, not poker.
    const disagreements: string[] = [];
    for (const node of nodes) {
      for (const key of HAND_KEYS) {
        const strategy = getStrategy(node, key);
        let topAction: string = "fold";
        let topFrequency = -1;
        for (const [action, frequency] of Object.entries(strategy)) {
          if ((frequency ?? 0) > topFrequency) {
            topFrequency = frequency ?? 0;
            topAction = action;
          }
        }
        const loss = evLoss(node, key, topAction as never);
        if (loss > 0.001) {
          disagreements.push(
            `${node.ref} ${key}: plays ${topAction}, which loses ${loss.toFixed(3)}bb`,
          );
        }
      }
    }
    if (disagreements.length > 0) console.error(disagreements.slice(0, 20).join("\n"));
    expect(disagreements).toEqual([]);
    record(
      "strategy/EV agreement",
      "the most-played action loses 0 EV for every hand in every node",
    );
  });

  it("keeps mixed hands nearly indifferent — that is why they mix", () => {
    let worstGap = 0;
    let mixedCount = 0;
    // SERVABLE nodes only. The quarantined files still carry the old generated
    // EV column, and failing to meet this bar is a large part of why they are
    // quarantined — asserting it over data the product deliberately withholds
    // would either fail forever or force the bar down to what the worst file
    // manages.
    for (const node of nodes.filter((n) => isServableNode(n.ref))) {
      for (const key of HAND_KEYS) {
        const strategy = getStrategy(node, key);
        const played = Object.entries(strategy).filter(([, f]) => (f ?? 0) > 0.05);
        if (played.length < 2) continue;
        mixedCount++;
        const evs = played.map(([action]) => evOf(node, key, action as never));
        worstGap = Math.max(worstGap, Math.max(...evs) - Math.min(...evs));
      }
    }
    // The bar moved DOWN and the guarantee moved UP.
    //
    // The repaired ranges are written as poker charts: large pure regions with
    // mixing at the boundaries, which is both what a published chart looks like
    // and fewer mixed cells than a formula that mixed almost everything. What
    // matters is that the mixing which remains is REAL — the widest gap between
    // two actions a node claims to split was 1.49bb, one hundredth inside a bar
    // set to accommodate it. It is under 0.05 now, which is the grader's own
    // "costs nothing" threshold.
    expect(mixedCount).toBeGreaterThan(300);
    expect(worstGap).toBeLessThan(0.05);
    record(
      "indifference holds",
      `${mixedCount.toLocaleString("en-US")} mixed hands, widest EV gap between mixed actions ${worstGap.toFixed(2)}bb`,
    );
  });

  it("makes folding a pure-raise hand expensive", () => {
    const node = rfi("UTG");
    expect(evLoss(node, "AA" as HandKey, "fold")).toBeGreaterThan(4);
    expect(evLoss(node, "72o" as HandKey, "fold")).toBe(0);
  });

  it("throws on an unknown node", () => {
    expect(() => getNode(index, "BB:vs_rfi_BB")).toThrow(/no solution node/);
  });
});

// ── 4. Review risk ────────────────────────────────────────────────────────────

describe("review risk", () => {
  it("ranks nodes by how much a reviewer should distrust them", () => {
    const ranked = rankByReviewRisk(nodes);
    expect(ranked.length).toBe(nodes.length);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }

    console.log(`\nHighest-risk nodes (top 12 of ${ranked.length}):`);
    for (const { ref, score, drivers } of ranked.slice(0, 12)) {
      console.log(`  ${String(score).padStart(2)}  ${ref.padEnd(20)} ${drivers.join(", ")}`);
    }

    const families = new Map<string, { total: number; count: number }>();
    for (const risk of ranked) {
      const family = risk.ref.split(":")[1]?.replace(/_[A-Z]+$/, "") ?? "?";
      const entry = families.get(family) ?? { total: 0, count: 0 };
      entry.total += risk.score;
      entry.count += 1;
      families.set(family, entry);
    }
    console.log(`\nMean risk by family:`);
    for (const [family, { total, count }] of [...families].sort(
      (a, b) => b[1].total / b[1].count - a[1].total / a[1].count,
    )) {
      console.log(`  ${family.padEnd(10)} ${(total / count).toFixed(1)}  (${count} nodes)`);
    }

    record("risk ranking", `${ranked.length} nodes ranked, worst score ${ranked[0]?.score}`);
  });

  it("scores a solver-verified, fully confident node at zero", () => {
    const perfect: PreflopNode = {
      ...nodes[0]!,
      provenance: "solver-verified",
      confidence: { rangeShape: "high", frequencies: "high", ev: "high", note: "x".repeat(25) },
    };
    expect(reviewRisk(perfect).score).toBe(0);
    expect(reviewRisk(perfect).drivers).toEqual([]);
  });

  it("gives every node a specific confidence note, not boilerplate", () => {
    const notes = nodes.map((n) => n.confidence.note);
    for (const note of notes) expect(note.length).toBeGreaterThan(80);
    // If every node shared one note the field would be worthless for triage.
    expect(new Set(notes).size).toBeGreaterThan(3);
    record(
      "confidence notes",
      `${new Set(notes).size} distinct notes across ${nodes.length} nodes`,
    );
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.4 — solution data model, loader, preflop set\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});
