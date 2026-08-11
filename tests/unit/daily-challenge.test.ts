/**
 * The daily challenge must survive a solution-data deploy.
 *
 * buildDailySpots is deterministic in the date AND the data: repairing one EV
 * column shifts the difficulty search, which shifts which nodes the generator
 * picks. The answer route used to rebuild the day fresh and 409 when the
 * rebuild disagreed with the stored refs — so the day the limp EVs were
 * repaired, every daily answer failed until midnight. challengeSpots exists so
 * a served challenge is always regenerated from what was STORED, and these
 * tests pin that independence.
 */

import { describe, expect, it } from "vitest";
import { buildDailySpots, challengeSpots } from "../../src/lib/daily-server";

describe("challengeSpots", () => {
  it("regenerates exactly the stored spots for a freshly built challenge", () => {
    const spots = buildDailySpots("2026-03-15");
    const challenge = {
      id: "challenge-1",
      spotRefs: spots.map((s) => ({
        seed: s.seed,
        nodeRef: s.nodeRef,
        handKey: s.handKey,
        difficulty: s.difficulty,
      })),
    };

    const regenerated = challengeSpots(challenge);
    expect(regenerated).toHaveLength(spots.length);
    for (const [i, spot] of regenerated.entries()) {
      expect(spot.nodeRef).toBe(spots[i]!.nodeRef);
      expect(spot.handKey).toBe(spots[i]!.handKey);
      expect(spot.legalActions.length).toBeGreaterThan(1);
    }
  });

  it("honours the stored refs even when a fresh rebuild would pick differently", () => {
    // A hand-written ref, deliberately NOT what buildDailySpots produces for
    // this seed — the property under test is that storage wins over rebuild.
    const challenge = {
      id: "challenge-2",
      spotRefs: [
        { seed: "alien-seed-0", nodeRef: "BB:vs_rfi_BTN", handKey: "T9s", difficulty: 3 },
        { seed: "alien-seed-1", nodeRef: "UTG:rfi", handKey: "AQo", difficulty: 2 },
      ],
    };

    const [first, second] = challengeSpots(challenge);
    expect(first?.nodeRef).toBe("BB:vs_rfi_BTN");
    expect(first?.handKey).toBe("T9s");
    expect(second?.nodeRef).toBe("UTG:rfi");
    expect(second?.handKey).toBe("AQo");
  });

  it("is deterministic — the same refs always regenerate the same cards", () => {
    const challenge = {
      id: "challenge-3",
      spotRefs: [{ seed: "seed-x", nodeRef: "CO:rfi", handKey: "77", difficulty: 3 }],
    };
    const a = challengeSpots(challenge)[0]!;
    const b = challengeSpots(challenge)[0]!;
    expect(a.heroCards).toEqual(b.heroCards);
    expect(a.id).toBe(b.id);
  });
});
