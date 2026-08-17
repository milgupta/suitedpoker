/**
 * The scenario picker on /ranges must never print an identifier.
 *
 * `describeScenario` translates an `actionSeq` into English and ends in a
 * fallback that strips underscores. That fallback is not a safety net, it is a
 * trap: two new multiway node families shipped and the picker rendered
 * "vs open call UTG MP" and "vs limp UTG" — raw action sequences on screen, in
 * the one page whose whole job is to be a readable reference.
 *
 * The static `action-copy` scan cannot catch this, because the string is built
 * at runtime from data rather than written in the source. So it is checked the
 * only way it can be: by walking every node the product actually serves.
 */

import { describe, expect, it } from "vitest";
import { __testing } from "../../src/app/(app)/ranges/ranges-client";
import { loadSolutionData } from "../../src/lib/solution-data";

const { describeScenario } = __testing;
const data = loadSolutionData();

/** Anything that looks like a code identifier rather than a phrase. */
const IDENTIFIER = /_|\bvs_|\brfi\b|\b(UTG|MP|CO|BTN|SB|BB)\b/;

describe("the /ranges scenario labels", () => {
  it("renders every served node without leaking its actionSeq", () => {
    const offenders: string[] = [];
    for (const node of data.preflop) {
      const label = describeScenario(node.actionSeq);
      if (IDENTIFIER.test(label)) offenders.push(`${node.ref} -> "${label}"`);
    }
    expect(offenders, `these print an identifier:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("names BOTH opponents in a squeeze spot", () => {
    // The distinguishing fact about the node is that two players are already
    // in. A label naming one of them describes a different spot.
    expect(describeScenario("vs_open_call_UTG_MP")).toBe(
      "vs under the gun open + middle position call",
    );
  });

  it("reads naturally for the families that already existed", () => {
    expect(describeScenario("rfi")).toBe("Open first in");
    expect(describeScenario("vs_rfi_CO")).toBe("vs cutoff open");
    expect(describeScenario("vs_3bet_BB")).toBe("vs big blind 3-bet");
    expect(describeScenario("vs_4bet_UTG")).toBe("vs under the gun 4-bet");
    expect(describeScenario("vs_limp_UTG")).toBe("vs under the gun limp");
  });
});
