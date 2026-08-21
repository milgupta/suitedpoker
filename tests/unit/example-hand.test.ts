/**
 * The scripted example hand on /start must agree with the strategy the paid
 * product serves.
 *
 * The screen is authored — no server call, hand-written frequencies — because
 * it runs before an account exists. That makes this test the only thing
 * standing between a repair of BTN.rfi.json and a pre-paywall demo that
 * quotes numbers the drill no longer grades against. Same rule as every
 * scripted surface: the copy must match the data, enforced, not remembered.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_CORRECT_ACTION,
  EXAMPLE_FREQUENCIES,
  EXAMPLE_OUTRO,
  EXAMPLE_SEGMENTS,
  EXAMPLE_SPOT,
  exampleVerdict,
} from "../../src/lib/example-hand";
import { cardsFromString } from "../../src/poker/cards";
import { parsePreflopNode } from "../../src/poker/solutions";
import { isServableNode } from "../../src/poker/node-status";

const NODE_PATH = join(process.cwd(), "src/content/solutions/preflop/BTN.rfi.json");
const node = parsePreflopNode(JSON.parse(readFileSync(NODE_PATH, "utf8")), NODE_PATH);

describe("the example hand matches the served strategy", () => {
  it("is played at a node the product actually serves", () => {
    expect(isServableNode("BTN:rfi")).toBe(true);
    expect(EXAMPLE_SPOT.heroPos).toBe(node.heroPos);
    expect(EXAMPLE_SPOT.potBb).toBe(node.potBb);
    expect(EXAMPLE_SPOT.effStackBb).toBe(node.effStackBb);
  });

  it("offers exactly the node's actions, in its order", () => {
    expect([...EXAMPLE_SPOT.legalActions]).toEqual([...node.actions]);
  });

  it("deals ace-king suited, as every piece of its copy claims", () => {
    expect([...EXAMPLE_SPOT.heroCards]).toEqual(cardsFromString("As Ks"));
  });

  it("quotes the node's real frequencies for AKs", () => {
    const strategy = node.strategy["AKs"];
    expect(strategy, "BTN.rfi.json no longer has an AKs row").toBeDefined();
    for (const action of EXAMPLE_SPOT.legalActions) {
      expect(
        EXAMPLE_FREQUENCIES[action] ?? 0,
        `${action}: the demo's number disagrees with the served strategy`,
      ).toBe(strategy![action] ?? 0);
    }
  });

  it("marks the chart's most-played action as the correct one", () => {
    const strategy = node.strategy["AKs"]!;
    const top = Object.entries(strategy).sort((a, b) => b[1] - a[1])[0]![0];
    expect(EXAMPLE_CORRECT_ACTION).toBe(top);
    expect(exampleVerdict(EXAMPLE_CORRECT_ACTION).correct).toBe(true);
  });

  it("keeps the capsules in button order — the 3.2 capsule lesson", () => {
    expect(EXAMPLE_SEGMENTS.map((s) => s.action)).toEqual([...EXAMPLE_SPOT.legalActions]);
  });

  it("keeps the bridge's '100–0' true to the frequencies it sits under", () => {
    const raisePct = Math.round((EXAMPLE_FREQUENCIES.raise ?? 0) * 100);
    const callPct = Math.round((EXAMPLE_FREQUENCIES.call ?? 0) * 100);
    expect(EXAMPLE_OUTRO.bridge).toContain(`${raisePct}–${callPct}`);
  });

  it("grades every offered action with a verdict and never an empty one", () => {
    for (const action of EXAMPLE_SPOT.legalActions) {
      const v = exampleVerdict(action);
      expect(v.title.length, action).toBeGreaterThan(5);
      expect(v.body.length, action).toBeGreaterThan(40);
      expect(v.correct).toBe(action === EXAMPLE_CORRECT_ACTION);
    }
  });
});
