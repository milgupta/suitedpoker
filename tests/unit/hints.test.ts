/**
 * THE LEAK TEST.
 *
 * A hint fires before the user acts. A level-1 or level-2 hint that names an
 * action has not given a worse hint — it has given the answer, and the drill is
 * over. So this is a security-shaped test, not a quality one: it runs over real
 * generated spots, checks the guard the route actually uses, AND re-checks the
 * output independently so a bug in the guard cannot make the test pass.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateSpot } from "../../src/poker/generator";
import { parsePreflopNode, nodeRefOf, getStrategy } from "../../src/poker/solutions";
import type { PreflopNode } from "../../src/poker/solutions";
import { redactHint } from "../../src/lib/ai/redact";
import {
  applyHintPenalty,
  HINT_PENALTY,
  MAX_HINTS_PER_DAY,
  preflopContextOf,
  streetOf,
  templateHint,
  templateHintLevel1,
  templateHintLevel2,
  templateHintLevel3,
  type HintSpotView,
} from "../../src/lib/hints";

const ROOT = resolve(process.cwd(), "src/content/solutions/preflop");

const NODES: PreflopNode[] = readdirSync(ROOT)
  .filter((f) => f.endsWith(".json"))
  .map((f) => parsePreflopNode(JSON.parse(readFileSync(join(ROOT, f), "utf8")), f));

const DATA = { preflop: NODES, postflop: [] };

/**
 * The independent check. Deliberately NOT the guard's own regexes — if the same
 * expression both produces and validates the result, the test proves nothing.
 */
const ACTION_WORDS =
  /\b(fold|folds|folded|folding|call|calls|called|calling|check|checks|checked|checking|raise|raises|raised|raising|bet|bets|betting|shove|shoves|shoving|jam|jams|all[- ]?in|3-?bet|4-?bet)\b/i;

interface Generated {
  index: number;
  nodeRef: string;
  handKey: string;
  view: HintSpotView;
  legalActions: readonly string[];
  bestAction: string;
}

/** 50 real spots, deterministically seeded so a failure is reproducible. */
const SPOTS: Generated[] = Array.from({ length: 50 }, (_, i) => {
  const spot = generateSpot({ type: "preflop" }, DATA, `hint-leak-${i}`);
  const node = NODES.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
  if (node === undefined) throw new Error(`no node for ${spot.nodeRef}`);
  const mix = getStrategy(node, spot.handKey);
  const bestAction = Object.entries(mix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "fold";

  return {
    index: i,
    nodeRef: spot.nodeRef,
    handKey: spot.handKey,
    legalActions: spot.legalActions,
    bestAction,
    view: {
      heroPos: spot.heroPos,
      street: streetOf(spot.board.length),
      potBb: spot.potBb,
      effStackBb: spot.effStackBb,
      actionHistory: spot.actionHistory,
      legalActions: spot.legalActions,
      handClass: spot.handClass,
      boardCards: spot.board.length,
      preflop: spot.board.length === 0 ? preflopContextOf(node.actionSeq) : null,
    },
  };
});

describe("the leak test — 50 spots, levels 1 and 2", () => {
  const hints = SPOTS.map((spot) => ({
    spot,
    level1: templateHintLevel1(spot.view),
    level2: templateHintLevel2(spot.view),
  }));

  it("prints all 50 so they can be read", () => {
    const lines = hints.map(
      ({ spot, level1, level2 }) =>
        `[${String(spot.index + 1).padStart(2, "0")}] ${spot.nodeRef} · ${spot.handKey} (best: ${spot.bestAction})\n` +
        `     L1: ${level1}\n` +
        `     L2: ${level2}`,
    );
    console.log(`\n${"=".repeat(72)}\n50 PRE-DECISION HINTS\n${"=".repeat(72)}\n`);
    console.log(lines.join("\n"));
    console.log(`\n${"=".repeat(72)}\n`);
    expect(hints).toHaveLength(50);
  });

  it("contains no action word at level 1", () => {
    const leaked = hints
      .filter(({ level1 }) => ACTION_WORDS.test(level1))
      .map(({ spot, level1 }) => `${spot.nodeRef}: ${level1}`);
    expect(leaked, `level 1 named an action:\n${leaked.join("\n")}`).toEqual([]);
  });

  it("contains no action word at level 2", () => {
    const leaked = hints
      .filter(({ level2 }) => ACTION_WORDS.test(level2))
      .map(({ spot, level2 }) => `${spot.nodeRef}: ${level2}`);
    expect(leaked, `level 2 named an action:\n${leaked.join("\n")}`).toEqual([]);
  });

  it("passes the guard the route actually uses", () => {
    for (const { spot, level1, level2 } of hints) {
      expect(redactHint(level1, 1, spot.legalActions).safe, `L1 ${spot.nodeRef}: ${level1}`).toBe(
        true,
      );
      expect(redactHint(level2, 2, spot.legalActions).safe, `L2 ${spot.nodeRef}: ${level2}`).toBe(
        true,
      );
    }
  });

  it("says something different for different spots", () => {
    // A single canned sentence would pass every leak assertion above and be
    // worthless. Variety is the thing that makes the fallback a real product.
    const distinctL1 = new Set(hints.map((h) => h.level1)).size;
    const distinctL2 = new Set(hints.map((h) => h.level2)).size;
    expect(distinctL1, "every level-1 hint was identical").toBeGreaterThan(1);
    expect(distinctL2, "every level-2 hint was identical").toBeGreaterThan(1);
  });

  it("never leaks the hand or the node", () => {
    for (const { spot, level1, level2 } of hints) {
      for (const text of [level1, level2]) {
        expect(text).not.toContain(spot.handKey);
        expect(text).not.toContain(spot.nodeRef);
      }
    }
  });
});

describe("level 3", () => {
  it("names the action category", () => {
    expect(templateHintLevel3("fold")).toBe("This is a folding hand.");
    expect(templateHintLevel3("call")).toBe("This is a calling hand.");
    expect(templateHintLevel3("check")).toBe("This is a checking hand.");
    expect(templateHintLevel3("raise")).toBe("This is a raising hand.");
    expect(templateHintLevel3("bet")).toBe("This is a betting hand.");
  });

  it("never gives a size or a frequency", () => {
    for (const spot of SPOTS) {
      const text = templateHint(3, spot.view, spot.bestAction);
      expect(text, `level 3 leaked a number: ${text}`).not.toMatch(/\d/);
      expect(text).not.toContain("%");
    }
  });

  it("is the only level allowed to name an action", () => {
    for (const spot of SPOTS) {
      const text = templateHint(3, spot.view, spot.bestAction);
      expect(redactHint(text, 3, spot.legalActions).safe).toBe(true);
      // The same text at level 1 must be rejected — proving the guard is
      // level-sensitive rather than permissive.
      const asLevel1 = redactHint(text, 1, spot.legalActions);
      if (ACTION_WORDS.test(text)) expect(asLevel1.safe).toBe(false);
    }
  });

  it("degrades to a level-2 hint when the best action is unknown", () => {
    const spot = SPOTS[0];
    if (spot === undefined) throw new Error("no spots");
    expect(templateHint(3, spot.view, null)).toBe(templateHintLevel2(spot.view));
  });
});

describe("the rating penalty", () => {
  it("uses the rates the plan specifies", () => {
    expect(HINT_PENALTY[1]).toBe(0);
    expect(HINT_PENALTY[2]).toBe(0.3);
    expect(HINT_PENALTY[3]).toBe(0.6);
  });

  it("leaves an unhinted gain alone", () => {
    expect(applyHintPenalty(20, 0)).toBe(20);
    expect(applyHintPenalty(20, 1)).toBe(20);
  });

  it("cuts a gain by 30% at level 2 and 60% at level 3", () => {
    expect(applyHintPenalty(20, 2)).toBe(14);
    expect(applyHintPenalty(20, 3)).toBe(8);
    expect(applyHintPenalty(100, 2)).toBe(70);
    expect(applyHintPenalty(100, 3)).toBe(40);
  });

  it("never zeroes a gain out — the goal is learning, not gatekeeping", () => {
    for (const level of [2, 3]) {
      expect(applyHintPenalty(10, level)).toBeGreaterThan(0);
    }
  });

  it("does not soften a loss", () => {
    // Otherwise a user farms hints to protect a rating, and the rating stops
    // meaning anything.
    expect(applyHintPenalty(-20, 3)).toBe(-20);
    expect(applyHintPenalty(0, 3)).toBe(0);
  });

  it("clamps a nonsense level rather than throwing", () => {
    expect(applyHintPenalty(20, 9)).toBe(8);
    expect(applyHintPenalty(20, -1)).toBe(20);
  });
});

describe("the daily budget", () => {
  it("is 20, and the rule matches the constant", async () => {
    const { RULES } = await import("../../src/lib/ratelimit");
    expect(MAX_HINTS_PER_DAY).toBe(20);
    expect(RULES.HINTS_DAILY.limit).toBe(MAX_HINTS_PER_DAY);
    // A calendar day, because "resets at midnight" is the only phrasing the
    // counter in the UI can honestly use.
    expect(RULES.HINTS_DAILY.kind).toBe("calendarDay");
    // Hints cost money, so an outage must not open the tap.
    expect(RULES.HINTS_DAILY.failMode).toBe("closed");
  });

  it("is never preempted by the burst guard", async () => {
    // Two limits with the same number means the softer one is unreachable: the
    // user gets a 429 where the product promised "20 hints left today". This
    // actually happened, and the e2e caught it.
    const { RULES } = await import("../../src/lib/ratelimit");
    expect(RULES.COACH_HINT.limit).toBeGreaterThan(RULES.HINTS_DAILY.limit);
  });
});

describe("streetOf", () => {
  it("maps board size to street", () => {
    expect(streetOf(0)).toBe("preflop");
    expect(streetOf(3)).toBe("flop");
    expect(streetOf(4)).toBe("turn");
    expect(streetOf(5)).toBe("river");
  });
});

describe("the level 1-2 guard covers EVERY action word", () => {
  /**
   * Regression: the guard used to iterate only the spot's LEGAL actions, so a
   * word that was not legal there was never tested. A level-1 hint shipped
   * saying "when your opponent makes a massive four-bet, look at the strength
   * required to play back against them" — found by tests/e2e/hint.spec.ts,
   * which had always used the full vocabulary while the product used a subset.
   */
  const NOT_LEGAL_HERE = ["fold", "call", "check", "raise", "bet"] as const;

  it.each(NOT_LEGAL_HERE)('blocks "%s" even when it is not a legal action', (word) => {
    for (const level of [1, 2] as const) {
      const result = redactHint(`Consider how often they ${word} in this spot.`, level, []);
      expect(result.safe, `level ${level} let "${word}" through with no legal actions`).toBe(false);
    }
  });

  it("blocks the compound forms a model actually reaches for", () => {
    for (const text of [
      "When your opponent makes a massive four-bet, look at the strength required.",
      "A three-bet from that position narrows things considerably.",
      "Think about what an all-in means here.",
    ]) {
      expect(redactHint(text, 1, []).safe, text).toBe(false);
    }
  });

  it("still allows a hint that names no action at all", () => {
    // The guard must not be a mute button — see the templates in hints.ts.
    const result = redactHint(
      "Think about your position and how much is already in the middle.",
      1,
      ["fold", "call", "raise"],
    );
    expect(result.safe).toBe(true);
  });

  it("leaves level 3 free to name the action, which is its entire job", () => {
    expect(redactHint("Raising is the line here.", 3, ["fold", "raise"]).safe).toBe(true);
  });
});
