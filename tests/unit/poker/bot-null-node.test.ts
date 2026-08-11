import { describe, expect, it } from "vitest";

import { archetypeFrequencies } from "@/poker/bots";
import { PROFILES } from "@/poker/bots/profiles";
import { HAND_KEYS, type HandKey } from "@/poker/range";

/**
 * When the preflop tree has no node for a line (missing vs_3bet pairings),
 * bots used to hard-cut at defendWidth and fold almost everything to a raise.
 * The soft null-node path has to keep mid hands in the mix.
 */
describe("null-node defend fallback", () => {
  it("continues more often than the hard defendWidth cut against a raise", () => {
    const profile = PROFILES.tag;
    let softPlay = 0;
    let hardPlay = 0;
    const n = HAND_KEYS.length;

    for (const key of HAND_KEYS) {
      const soft = archetypeFrequencies(null, key as HandKey, profile, true, true);
      softPlay += 1 - (soft.fold ?? 1);

      // Old cliff: only top defendWidth.
      const cut = 1 - profile.defendWidth;
      // Approximate via soft frequencies with a fake node would need strength —
      // instead assert soft play rate is meaningfully above defendWidth alone.
      void cut;
      hardPlay += 0;
    }

    const softRate = softPlay / n;
    // Tag defendWidth is 0.20; soft path should clear ~0.28+ of combos in play.
    expect(softRate).toBeGreaterThan(profile.defendWidth + 0.06);
    expect(softRate).toBeLessThan(0.7);
    void hardPlay;
  });

  it("still folds most trash for a nit facing a raise with no node", () => {
    const foldy = archetypeFrequencies(null, "72o", PROFILES.nit, true, true);
    expect(foldy.fold ?? 0).toBeGreaterThan(0.85);

    const strong = archetypeFrequencies(null, "AA", PROFILES.nit, true, true);
    expect(1 - (strong.fold ?? 1)).toBeGreaterThan(0.9);
  });

  it("lets a station keep middling hands vs a raise with no node", () => {
    const mid = archetypeFrequencies(null, "KTo", PROFILES.station, true, true);
    expect(1 - (mid.fold ?? 1)).toBeGreaterThan(0.3);
  });
});
