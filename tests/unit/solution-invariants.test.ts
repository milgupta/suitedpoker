/**
 * What has to be true of every strategy the product is willing to charge for.
 *
 * The audit that produced these found four things at once: 21 of 43 preflop
 * nodes were byte-identical to another, AKo folded 30% on the button against an
 * UTG open, TT called a 4bet at −0.74bb, and the big blind defended 25.6%
 * against a button open where the published figure is around 40%. Every one of
 * them passed the schema — the files were well-formed and wrong.
 *
 * So these are not shape checks. Each is a claim about poker that a reader with
 * a chart can check, and each one failed before the repair.
 */

import { describe, expect, it } from "vitest";
import { loadAllSolutionData, loadSolutionData } from "../../src/lib/solution-data";
import { HAND_KEYS, comboCountOf } from "../../src/poker/range";
import { isServableNode, QUARANTINED_NODES } from "../../src/poker/node-status";
import type { PreflopNode } from "../../src/poker/solutions";

const data = loadSolutionData();
const TOTAL_COMBOS = HAND_KEYS.reduce((sum, key) => sum + comboCountOf(key), 0);

/** Percent of all 1,326 starting combos this node does something other than fold with. */
function continueWidth(node: PreflopNode): number {
  let combos = 0;
  for (const key of HAND_KEYS) {
    const fold = node.strategy[key]?.["fold"] ?? 0;
    combos += comboCountOf(key) * (1 - fold);
  }
  return (100 * combos) / TOTAL_COMBOS;
}

/** Actions taken often enough that a user will be graded against them. */
function meaningful(node: PreflopNode, key: string): string[] {
  const strategy = node.strategy[key] ?? {};
  return Object.entries(strategy)
    .filter(([, freq]) => freq > 0.05)
    .map(([action]) => action);
}

describe("the served strategy set", () => {
  it("serves something", () => {
    expect(data.preflop.length).toBeGreaterThan(0);
  });

  it("names a written reason for every node it holds back", () => {
    for (const node of QUARANTINED_NODES) {
      // "Unclear" is not a reason a later reader can act on, and an allowlist
      // nobody can audit becomes permanent by default.
      expect(node.reason.length, `${node.ref} has no usable reason`).toBeGreaterThan(40);
    }
  });

  it("quarantines nothing that does not exist on disk", () => {
    // A quarantine on a renamed node is a silent no-op: the entry looks like
    // protection and protects nothing.
    const onDisk = new Set(loadAllSolutionData().preflop.map((node) => node.ref));
    for (const node of QUARANTINED_NODES) {
      expect(onDisk.has(node.ref), `${node.ref} is quarantined but not on disk`).toBe(true);
    }
  });

  it("never serves a quarantined node", () => {
    for (const node of data.preflop) {
      expect(isServableNode(node.ref), `${node.ref} is quarantined and still served`).toBe(true);
    }
  });
});

describe("no two served nodes give the same answer", () => {
  /*
   * The defect this replaces: all 8 `vs_4bet` files shared one strategy, 8
   * `vs_3bet` files shared a second, and 5 more shared a third. Facing a 4bet
   * from UTG and facing one from the cutoff were literally the same file, in a
   * product that sells position-aware strategy.
   */
  it("has no byte-identical strategy between two served nodes", () => {
    const bySignature = new Map<string, string[]>();
    for (const node of data.preflop) {
      const signature = JSON.stringify(node.strategy);
      bySignature.set(signature, [...(bySignature.get(signature) ?? []), node.ref]);
    }

    const collisions = [...bySignature.values()]
      .filter((refs) => refs.length > 1)
      .map((refs) => refs.join(" == "));

    expect(collisions, `these nodes answer identically:\n${collisions.join("\n")}`).toEqual([]);
  });

  it("gives a different answer at every position for the same facing action", () => {
    // Weaker but more specific: two nodes facing the same villain from
    // different hero seats must differ, because the hero's own opening range
    // differs by more than three to one between UTG and the button.
    const byVillain = new Map<string, PreflopNode[]>();
    for (const node of data.preflop) {
      const facing = node.actionSeq;
      byVillain.set(facing, [...(byVillain.get(facing) ?? []), node]);
    }

    for (const [facing, nodes] of byVillain) {
      const signatures = new Set(nodes.map((node) => JSON.stringify(node.strategy)));
      expect(signatures.size, `${facing} answers the same from ${nodes.length} seats`).toBe(
        nodes.length,
      );
    }
  });
});

describe("the EV column", () => {
  /*
   * A frequency and an EV are two statements about the same decision, and they
   * have to agree. A solver mixes precisely BECAUSE the actions are worth the
   * same; an action played 40% of the time at half a big blind less than the
   * alternative is not a mix, it is an error the strategy is committing 40% of
   * the time — and the grader reports the gap to the user as their own loss.
   */
  it("keeps every action played above 5% indifferent to within 0.05bb", () => {
    const offenders: string[] = [];

    for (const node of data.preflop) {
      for (const key of HAND_KEYS) {
        const played = meaningful(node, key);
        if (played.length < 2) continue;

        const ev = node.ev[key] ?? {};
        const values = played.map((action) => ev[action] ?? 0);
        const gap = Math.max(...values) - Math.min(...values);

        if (gap > 0.05) {
          offenders.push(`${node.ref} ${key}: ${gap.toFixed(2)}bb across ${played.join("/")}`);
        }
      }
    }

    expect(
      offenders.slice(0, 20),
      `${offenders.length} hands are mixed but not indifferent`,
    ).toEqual([]);
  });

  it("never plays an action worth less than folding", () => {
    /*
     * Folding is always available and always worth exactly 0 — the hero has
     * nothing invested that a fold gives up. So an action with negative EV,
     * played at a frequency the strategy claims is deliberate, is one the
     * strategy is choosing to lose money with. TT called a 4bet 20% of the time
     * at −0.74bb and it was presented as balance.
     */
    const offenders: string[] = [];

    for (const node of data.preflop) {
      for (const key of HAND_KEYS) {
        const ev = node.ev[key] ?? {};
        for (const action of meaningful(node, key)) {
          if (action === "fold") continue;
          const value = ev[action] ?? 0;
          if (value < -0.01) {
            offenders.push(`${node.ref} ${key}: ${action} ${value.toFixed(2)}bb`);
          }
        }
      }
    }

    expect(offenders.slice(0, 20), `${offenders.length} losing actions played on purpose`).toEqual(
      [],
    );
  });

  it("prices folding at zero", () => {
    for (const node of data.preflop) {
      if (!node.actions.includes("fold")) continue;
      for (const key of HAND_KEYS) {
        expect(node.ev[key]?.["fold"] ?? 0, `${node.ref} ${key} folds for something`).toBe(0);
      }
    }
  });
});

describe("range widths against published figures", () => {
  /*
   * Bounds are wide on purpose. The point is not to pin the data to one chart —
   * charts disagree — but to catch a range that has drifted somewhere no
   * published solve puts it. The BB defending 25.6% against a button open was
   * inside every schema check and about fifteen points from any real figure.
   */
  const BOUNDS: Record<string, readonly [number, number]> = {
    "UTG:rfi": [12, 20],
    "MP:rfi": [16, 24],
    "CO:rfi": [24, 33],
    "BTN:rfi": [42, 52],
    "SB:rfi": [34, 50],
    "BB:vs_rfi_BTN": [36, 48],
    "BB:vs_rfi_CO": [30, 42],
    "BB:vs_rfi_MP": [27, 38],
    "BB:vs_rfi_UTG": [24, 34],
    "BB:vs_rfi_SB": [40, 50],
    "BTN:vs_rfi_UTG": [12, 19],
    "BTN:vs_rfi_MP": [13, 21],
    "BTN:vs_rfi_CO": [16, 24],
    "CO:vs_rfi_UTG": [8, 14],
    "MP:vs_rfi_UTG": [6, 12],
    "SB:vs_rfi_UTG": [7, 14],
    "SB:vs_rfi_BTN": [12, 20],
  };

  for (const [ref, [low, high]] of Object.entries(BOUNDS)) {
    it(`${ref} continues between ${low}% and ${high}%`, () => {
      const node = data.preflop.find((candidate) => candidate.ref === ref);
      expect(node, `${ref} is not served — update the bound or the quarantine`).toBeDefined();

      const width = continueWidth(node!);
      expect(width, `${ref} continues ${width.toFixed(1)}%`).toBeGreaterThanOrEqual(low);
      expect(width, `${ref} continues ${width.toFixed(1)}%`).toBeLessThanOrEqual(high);
    });
  }

  it("defends wider from every later in-position seat against the same open", () => {
    // Same construction argument as opening widths: against one open, a later
    // seat has fewer players left to act behind it, so its continue can only
    // be wider. The blinds are excluded — they play the rest of the hand out
    // of position, which is a different trade than seat order captures — but
    // the big blind must always defend wider than the small blind, because it
    // closes the action and already has one blind invested.
    const IN_POSITION_ORDER: Record<string, readonly string[]> = {
      vs_rfi_UTG: ["MP:vs_rfi_UTG", "CO:vs_rfi_UTG", "BTN:vs_rfi_UTG"],
      vs_rfi_MP: ["CO:vs_rfi_MP", "BTN:vs_rfi_MP"],
    };

    const widthOf = (ref: string): number | null => {
      const node = data.preflop.find((candidate) => candidate.ref === ref);
      return node === undefined ? null : continueWidth(node);
    };

    for (const [facing, refs] of Object.entries(IN_POSITION_ORDER)) {
      for (let i = 1; i < refs.length; i++) {
        const previous = widthOf(refs[i - 1]!);
        const current = widthOf(refs[i]!);
        if (previous === null || current === null) continue;
        expect(
          current,
          `${refs[i]} defends tighter than ${refs[i - 1]} against the same ${facing} open`,
        ).toBeGreaterThan(previous);
      }
    }

    for (const villain of ["UTG", "MP", "CO", "BTN"]) {
      const sb = widthOf(`SB:vs_rfi_${villain}`);
      const bb = widthOf(`BB:vs_rfi_${villain}`);
      if (sb === null || bb === null) continue;
      expect(bb, `BB defends tighter than SB against a ${villain} open`).toBeGreaterThan(sb);
    }
  });

  it("opens wider from every later seat", () => {
    // Monotonic by construction of the game: a later seat has fewer players
    // behind it. A set of ranges that breaks this is wrong however plausible
    // each individual number looks.
    const order = ["UTG:rfi", "MP:rfi", "CO:rfi", "BTN:rfi"] as const;
    const widths = order.map((ref) => {
      const node = data.preflop.find((candidate) => candidate.ref === ref);
      return node === undefined ? null : continueWidth(node);
    });

    for (let i = 1; i < widths.length; i++) {
      const previous = widths[i - 1];
      const current = widths[i];
      if (previous == null || current == null) continue;
      expect(current, `${order[i]} opens tighter than ${order[i - 1]}`).toBeGreaterThan(previous);
    }
  });
});

describe("the hands a spot can deal", () => {
  /*
   * A `vs_3bet` node puts the hero in a pot they opened themselves. So the hand
   * they are holding is one they opened with — the spot is unreachable with
   * anything else, and drilling somebody on defending 72o after raising it from
   * under the gun teaches a hand that cannot occur.
   *
   * The filter lives in the generator; this asserts the data supports it, which
   * it only does if the opening range is genuinely wider than the continuing
   * one at every seat.
   */
  const openable = (heroPos: string): Set<string> => {
    const open = data.preflop.find((node) => node.ref === `${heroPos}:rfi`);
    if (open === undefined) return new Set(HAND_KEYS);
    return new Set(HAND_KEYS.filter((key) => (open.strategy[key]?.["raise"] ?? 0) > 0));
  };

  it("only deals a hand the hero could have opened with, facing a 3bet", () => {
    for (const node of data.preflop) {
      if (!node.actionSeq.startsWith("vs_3bet")) continue;

      const opens = openable(node.heroPos);
      const impossible = HAND_KEYS.filter(
        (key) => !opens.has(key) && (node.strategy[key]?.["fold"] ?? 1) < 1,
      );

      expect(
        impossible.slice(0, 8),
        `${node.ref} continues with hands ${node.heroPos} never opened`,
      ).toEqual([]);

      // And the node has to have something left to drill.
      const playable = HAND_KEYS.filter((key) => opens.has(key)).length;
      expect(
        playable,
        `${node.heroPos} opens nothing, so ${node.ref} is undealable`,
      ).toBeGreaterThan(20);
    }
  });

  it("opens every hand the hero later 4bets with", () => {
    // The stronger form: an aggressive continuation is a hand that was in the
    // opening range by construction. If it was not, the node is describing a
    // player who cold-4bet from a seat that folded.
    for (const node of data.preflop) {
      if (!node.actionSeq.startsWith("vs_3bet")) continue;

      const opens = openable(node.heroPos);
      const orphans = HAND_KEYS.filter(
        (key) => (node.strategy[key]?.["raise"] ?? 0) > 0 && !opens.has(key),
      );

      expect(orphans, `${node.ref} 4bets ${orphans.join(", ")} without opening them`).toEqual([]);
    }
  });
});

describe("hands that must not be misplayed", () => {
  /*
   * Named individually because these are the ones a reader with any poker
   * background checks first, and getting one of them wrong costs the product
   * its credibility with exactly the audience most able to tell.
   */
  const NEVER_FOLDS = ["AA", "KK", "QQ", "AKs", "AKo"] as const;

  it("never folds a premium hand at a frequency worth grading", () => {
    const offenders: string[] = [];

    for (const node of data.preflop) {
      for (const key of NEVER_FOLDS) {
        const fold = node.strategy[key]?.["fold"] ?? 0;
        if (fold > 0.05) offenders.push(`${node.ref} folds ${key} ${Math.round(fold * 100)}%`);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("raises the top of every range at least sometimes", () => {
    for (const node of data.preflop) {
      const aggressive = node.actions.filter((action) => action !== "fold" && action !== "call");
      if (aggressive.length === 0) continue;

      const raiseAces = aggressive.reduce(
        (sum, action) => sum + (node.strategy["AA"]?.[action] ?? 0),
        0,
      );
      expect(raiseAces, `${node.ref} never raises AA`).toBeGreaterThan(0.5);
    }
  });

  it("keeps the strongest hands out of the folding range everywhere", () => {
    // The general form of the check above: the best hand in the deck may never
    // be folded, at any node, at any frequency at all.
    for (const node of data.preflop) {
      expect(node.strategy["AA"]?.["fold"] ?? 0, `${node.ref} folds AA`).toBe(0);
    }
  });
});
