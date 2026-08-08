import { describe, expect, it } from "vitest";
import { loadSolutionData } from "@/lib/solution-data";
import { generateSpot } from "@/poker/generator";
import { nodeRefOf } from "@/poker/solutions";
import type { HandKey } from "@/poker/range";
import {
  ALL_DEMO_SPOTS,
  demoSeedFor,
  demoSpotCandidates,
  MAX_DEMO_TOP_FREQ,
  mixedHandsAt,
  pickMixedHand,
} from "@/lib/demo-hand";
import type { SkillTier } from "@/lib/explain-policy";

/**
 * THE TEST THAT WAS MISSING.
 *
 * The demo hand shipped able to deal for tier `videos` and unable to deal for
 * tier `never` — the beginners this entire screen exists for. Every existing
 * test passed, because the e2e created its user with one hardcoded tier and the
 * unit tests checked the SELECTION rules without ever asking whether the
 * selected node could actually produce a hand.
 *
 * So this asserts dealability across the whole cross-product, not one path
 * through it.
 */

const TIERS: readonly SkillTier[] = ["never", "videos", "charts", "solver"];

/** Spread across the hash space; ids are uuids in production. */
const USER_IDS = Array.from({ length: 40 }, (_, i) => `user-${i}-${(i * 2654435761) % 99991}`);

describe("demo hand dealability", () => {
  const data = loadSolutionData();

  it("EVERY tier can deal a mixed hand for EVERY user", () => {
    const failures: string[] = [];

    for (const tier of TIERS) {
      for (const userId of USER_IDS) {
        let dealt: { id: string; handKey: string; topFreq: number } | null = null;

        for (const candidate of demoSpotCandidates(userId, tier)) {
          const node = data.preflop.find(
            (n) => n.ref === nodeRefOf(candidate.heroPos, candidate.actionSeq),
          );
          if (node === undefined) continue;
          const handKey = pickMixedHand(mixedHandsAt(node.strategy), userId);
          if (handKey === null) continue;

          const spot = generateSpot(
            {
              type: "preflop",
              heroPos: candidate.heroPos,
              actionSeq: candidate.actionSeq,
              difficulty: candidate.difficulty,
              forceHandKey: handKey as HandKey,
            },
            data,
            demoSeedFor(userId),
          );
          const freqs = Object.values(node.strategy[handKey] ?? {});
          dealt = { id: candidate.id, handKey: spot.handKey, topFreq: Math.max(...freqs) };
          break;
        }

        if (dealt === null) failures.push(`${tier}/${userId}`);
        else if (dealt.topFreq > MAX_DEMO_TOP_FREQ) {
          failures.push(`${tier}/${userId} served a PURE spot (${dealt.topFreq})`);
        }
      }
    }

    expect(failures, failures.slice(0, 5).join("; ")).toEqual([]);
  });

  it("the engine deals the hand it was told to, not a sampled one", () => {
    // The whole fix rests on forceHandKey being honoured. If the sampler ever
    // wins, dealability silently reverts to a 2-4% coin flip.
    const node = data.preflop.find((n) => n.ref === nodeRefOf("CO", "rfi"));
    expect(node, "CO:rfi is in the shortlist and must exist").toBeDefined();

    for (const handKey of mixedHandsAt(node!.strategy)) {
      const spot = generateSpot(
        { type: "preflop", heroPos: "CO", actionSeq: "rfi", forceHandKey: handKey as HandKey },
        data,
        "any-seed",
      );
      expect(spot.handKey).toBe(handKey);
    }
  });

  it("every shortlisted node has at least one mixed hand", () => {
    // Names the node rather than failing somewhere downstream if the data
    // changes. RFI nodes are only 2-4% mixed, so this margin is genuinely thin.
    const counts = ALL_DEMO_SPOTS.map((spot) => {
      const node = data.preflop.find((n) => n.ref === nodeRefOf(spot.heroPos, spot.actionSeq));
      return { id: spot.id, mixed: node === undefined ? 0 : mixedHandsAt(node.strategy).length };
    });
    for (const { id, mixed } of counts) {
      expect(mixed, `${id} has no mixed hands — it cannot be a demo spot`).toBeGreaterThan(0);
    }
  });

  it("a user always gets the same hand back", () => {
    // The abuse bound: refreshing must not reroll for an easier spot.
    for (const tier of TIERS) {
      const [first] = demoSpotCandidates("stable-user", tier);
      const node = data.preflop.find((n) => n.ref === nodeRefOf(first!.heroPos, first!.actionSeq));
      const a = pickMixedHand(mixedHandsAt(node!.strategy), "stable-user");
      const b = pickMixedHand(mixedHandsAt(node!.strategy), "stable-user");
      expect(a).toBe(b);
    }
  });
});
