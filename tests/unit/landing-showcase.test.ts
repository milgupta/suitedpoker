/**
 * THE NUMBERS ON THE LANDING PAGE MUST BE IN THE SOLUTION FILES.
 *
 * The page this replaced printed "AQo on the button, first in — Raise 62% /
 * Fold 38%" as its centrepiece for four substages. `BTN.rfi.json` says AQo is a
 * pure raise. Nothing failed, because no test had ever read the figures on the
 * marketing page against the data the product grades with.
 *
 * So this file reads the real JSON off disk and checks the derivation against
 * it, rather than against a fixture that could drift the same way.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { marketingContrast } from "@/lib/marketing-contrast";
import {
  buildShowcase,
  handNameOf,
  mixExplanation,
  rangeStrategyOf,
  segmentsFor,
  situationOf,
  SHOWCASE_HAND,
  SHOWCASE_NODE_REF,
} from "@/lib/landing-showcase";
import { parsePreflopNode, type PreflopNode } from "@/poker/solutions";
import { HAND_KEYS } from "@/poker/range";
import { bandFor } from "@/poker/grader";

function loadNode(file: string): PreflopNode {
  const path = resolve(process.cwd(), "src/content/solutions/preflop", file);
  return parsePreflopNode(JSON.parse(readFileSync(path, "utf8")), file);
}

const NODE = loadNode("BB.vs_rfi_BTN.json");

describe("the landing showcase", () => {
  it("draws from the node it says it draws from", () => {
    expect(NODE.ref).toBe(SHOWCASE_NODE_REF);
  });

  it("the featured hand is genuinely MIXED, which is the claim the page makes", () => {
    const cell = NODE.strategy[SHOWCASE_HAND];
    expect(cell, `${SHOWCASE_HAND} is not in ${NODE.ref}`).toBeDefined();

    const played = Object.values(cell!).filter((freq) => freq > 0);
    expect(
      played.length,
      `${SHOWCASE_HAND} at ${NODE.ref} plays one action — the page would be showing a pure spot while telling the reader strategy is a mix`,
    ).toBeGreaterThan(1);

    // And no action is so dominant that the mix is a rounding error.
    // 0.8 is allowed — that is the widest mix the hero panel is built to show.
    expect(Math.max(...played)).toBeLessThanOrEqual(0.8);
  });

  it("every segment frequency comes from the file", () => {
    const segments = segmentsFor(NODE, SHOWCASE_HAND);
    const cell = NODE.strategy[SHOWCASE_HAND]!;

    for (const segment of segments) {
      expect(segment.freq, `${segment.action} is not what the file says`).toBe(
        cell[segment.action],
      );
    }

    // Frequencies of the actions actually played sum to 1.
    const total = segments.reduce((sum, s) => sum + s.freq, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it("evLoss is the grader's definition — bestEv minus this action's EV", () => {
    const segments = segmentsFor(NODE, SHOWCASE_HAND);
    const ev = NODE.ev[SHOWCASE_HAND]!;
    const bestEv = Math.max(...NODE.actions.map((action) => ev[action] ?? 0));

    for (const segment of segments) {
      expect(segment.evLoss).toBeCloseTo(Math.max(0, bestEv - (ev[segment.action] ?? 0)), 6);
    }

    // The widest action is the best one here, so it gives up nothing.
    expect(segments[0]!.evLoss).toBe(0);
  });

  it("the alternative the hero panel names is a SOLID, not a blunder", () => {
    // The panel's whole sentence is "a different line, not a mistake". If the
    // second action ever bands worse than `solid`, that sentence is false.
    const segments = segmentsFor(NODE, SHOWCASE_HAND);
    const alternative = segments[1];
    expect(alternative).toBeDefined();

    const band = bandFor(alternative!.evLoss);
    expect(
      ["best", "solid"],
      `the second line at ${NODE.ref} ${SHOWCASE_HAND} bands as "${band}" (${alternative!.evLoss.toFixed(2)}bb) — the hero copy calls it "not a mistake"`,
    ).toContain(band);

    console.log(
      `  ${SHOWCASE_HAND} ${NODE.ref}: ` +
        segments.map((s) => `${s.action} ${Math.round(s.freq * 100)}%`).join(" / ") +
        ` — second line gives up ${alternative!.evLoss.toFixed(2)}bb (${band})`,
    );
  });

  it("segments are ordered widest first", () => {
    const freqs = segmentsFor(NODE, SHOWCASE_HAND).map((s) => s.freq);
    expect([...freqs].sort((a, b) => b - a)).toEqual(freqs);
  });

  it("never emits an action the solution does not play", () => {
    for (const segment of segmentsFor(NODE, SHOWCASE_HAND)) {
      expect(segment.freq).toBeGreaterThan(0);
      expect(NODE.actions).toContain(segment.action);
    }
  });

  it("the grid gets all 169 hands", () => {
    const strategy = rangeStrategyOf(NODE);
    for (const key of HAND_KEYS) {
      expect(strategy[key], `${key} missing from the grid data`).toBeDefined();
    }
  });

  it("spells positions out — no abbreviation reaches the page", () => {
    expect(situationOf(NODE)).toBe("In the big blind, facing an open from the button");

    // The other shapes, so a future showcase node cannot produce "In the BTN".
    expect(situationOf({ ...NODE, heroPos: "BTN", actionSeq: "rfi" })).toBe(
      "On the button, folded to you",
    );
    expect(situationOf({ ...NODE, heroPos: "MP", actionSeq: "rfi" })).toBe(
      "In middle position, folded to you",
    );

    for (const text of [
      situationOf(NODE),
      situationOf({ ...NODE, heroPos: "CO", actionSeq: "vs_rfi_UTG" }),
    ]) {
      expect(text, `"${text}" still contains an abbreviation`).not.toMatch(
        /\b(?:BTN|CO|MP|UTG|SB|BB)\b/,
      );
    }
  });

  it("buildShowcase carries the node's own pot and stack depth", () => {
    const showcase = buildShowcase(NODE);
    expect(showcase.potBb).toBe(NODE.potBb);
    expect(showcase.effStackBb).toBe(NODE.effStackBb);
    expect(showcase.nodeRef).toBe(NODE.ref);
    expect(showcase.legalActions).toEqual(NODE.actions);
  });

  it("the How-it-works table matches a real drill of this node", () => {
    const showcase = buildShowcase(NODE);
    const { table } = showcase;

    expect(table.opponents.map((seat) => seat.position)).toEqual(["UTG", "MP", "CO", "BTN", "SB"]);
    expect(table.opponents.some((seat) => seat.position === "BB")).toBe(false);

    const byPos = new Map(table.opponents.map((seat) => [seat.position, seat]));
    expect(byPos.get("UTG")?.folded).toBe(true);
    expect(byPos.get("BTN")?.folded).toBe(false);
    expect(byPos.get("BTN")?.isDealer).toBe(true);
    expect(byPos.get("BTN")?.betBb).toBe(2.5);
    expect(byPos.get("SB")?.folded).toBe(true);

    expect(table.history).toBe("BTN opens 2.5bb");
    expect(table.situationLine).toMatch(/button/i);
    expect(table.situationLine).toMatch(/big blind/i);
    expect(table.strengthLabel).toBe("High card");
    expect(table.heroBetBb).toBe(1);
  });

  it("names the featured hand in English, never as a grid key", () => {
    expect(handNameOf("KQs")).toBe("King-Queen suited");
    expect(handNameOf("AA")).toBe("Pocket Aces");
    expect(handNameOf("AKo")).toBe("Ace-King offsuit");
    expect(buildShowcase(NODE).handName).toBe("King-Queen suited");
  });

  it("the How-it-works explanation is the mix, derived from the file", () => {
    const showcase = buildShowcase(NODE);
    const cell = NODE.strategy[SHOWCASE_HAND]!;
    const callPct = Math.round((cell.call ?? 0) * 100);
    const raisePct = Math.round((cell.raise ?? 0) * 100);

    expect(showcase.explanation).toContain("genuine mix");
    expect(showcase.explanation).toContain(`${callPct}%`);
    expect(showcase.explanation).toContain(`${raisePct}%`);
    expect(showcase.explanation).not.toMatch(/100%/);
    expect(mixExplanation(showcase.segments)).toBe(showcase.explanation);
  });

  it("a pure line does not claim to be a mix", () => {
    const line = mixExplanation([{ action: "fold", freq: 1, evLoss: 0 }]);
    expect(line).toMatch(/100%/);
    expect(line).not.toMatch(/genuine mix/);
  });

  it("marketing contrast exaggerates colour only on an indifferent mix", () => {
    const painted = marketingContrast([
      { action: "call", freq: 0.7, evLoss: 0 },
      { action: "raise", freq: 0.3, evLoss: 0 },
    ]);
    expect(painted[0]?.evLoss).toBe(0);
    expect(painted[1]?.evLoss).toBe(0.4);

    const honest = marketingContrast([
      { action: "call", freq: 0.7, evLoss: 0 },
      { action: "raise", freq: 0.3, evLoss: 0.5 },
    ]);
    expect(honest[1]?.evLoss).toBe(0.5);
  });

  it("throws rather than rendering a blank for a hand the node has no strategy for", () => {
    const stripped: PreflopNode = { ...NODE, strategy: {}, ev: {} };
    expect(() => segmentsFor(stripped, SHOWCASE_HAND)).toThrow(/no strategy/i);
  });
});
