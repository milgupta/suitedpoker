import { describe, expect, it } from "vitest";
import { leakToSpotConfig, PRIMARY_LEAK_KEYS, isPrimaryLeakKey } from "@/lib/leak-targeting";
import {
  ARENA_MIX_FLOOR,
  ARENA_MIX_SHARE_REC,
  ARENA_MIX_SHARE_SOLID,
  ARENA_MIX_SOLID,
  ARENA_MIX_STRONG,
  applyArenaMix,
  isOpenArenaConfig,
} from "@/lib/arena-mix";
import type { SpotConfig } from "@/poker/generator";

describe("leakToSpotConfig", () => {
  it("maps every primary leak key", () => {
    for (const key of PRIMARY_LEAK_KEYS) {
      expect(isPrimaryLeakKey(key)).toBe(true);
      // tilt_control is behavioural — null is the mapped answer.
      if (key === "tilt_control") {
        expect(leakToSpotConfig(key)).toBeNull();
      } else {
        expect(leakToSpotConfig(key)).not.toBeNull();
      }
    }
  });

  it("returns generator-shaped filters, not onboarding vocabulary as tags", () => {
    expect(leakToSpotConfig("preflop_ranges")).toEqual({
      type: "preflop",
      tags: ["rfi", "open"],
    });
    expect(leakToSpotConfig("overcalling")).toEqual({
      type: "preflop",
      tags: ["vs-open", "defense"],
    });
    expect(leakToSpotConfig("postflop_fundamentals")?.type).toBe("postflop");
    expect(leakToSpotConfig("bluff_catching")?.type).toBe("postflop");
  });

  it("returns null for unknown keys", () => {
    expect(leakToSpotConfig("blind_defense")).toBeNull();
    expect(leakToSpotConfig("")).toBeNull();
  });
});

describe("isOpenArenaConfig", () => {
  it("accepts the default endless grind", () => {
    expect(isOpenArenaConfig({ type: "preflop" })).toBe(true);
  });

  it("rejects pinned lesson / hub presets", () => {
    expect(isOpenArenaConfig({ type: "preflop", tags: ["3bet"] })).toBe(false);
    expect(isOpenArenaConfig({ type: "preflop", actionSeq: "rfi" })).toBe(false);
    expect(isOpenArenaConfig({ type: "preflop", heroPos: "BB" })).toBe(false);
    expect(isOpenArenaConfig({ type: "postflop" })).toBe(false);
    expect(isOpenArenaConfig({ type: "postflop", templateId: "x" })).toBe(false);
  });
});

describe("applyArenaMix", () => {
  const base: SpotConfig = { type: "preflop", difficulty: 5 };

  it("leaves beginners below Rec on preflop", () => {
    expect(
      applyArenaMix(base, {
        rating: ARENA_MIX_FLOOR - 1,
        mixRoll: 0,
        familyRoll: 0,
      }),
    ).toEqual(base);
  });

  it("misses the mix share stay on preflop", () => {
    expect(
      applyArenaMix(base, {
        rating: 1100,
        mixRoll: ARENA_MIX_SHARE_REC,
        familyRoll: 0,
      }),
    ).toEqual(base);
  });

  it("deals flop-only dry/ace-high for Recreational", () => {
    const next = applyArenaMix(base, {
      rating: 1100,
      mixRoll: 0,
      familyRoll: 0.5,
    });
    expect(next.type).toBe("postflop");
    expect(next.street).toBe("flop");
    expect(next.tags).toEqual(["dry", "ace-high"]);
    expect(next.difficulty).toBe(5);
  });

  it("widens textures for Solid and can pick turn", () => {
    const flop = applyArenaMix(base, {
      rating: ARENA_MIX_SOLID,
      mixRoll: 0,
      familyRoll: 0.1,
    });
    expect(flop.street).toBe("flop");
    expect(flop.tags).toContain("wet");

    const turn = applyArenaMix(base, {
      rating: ARENA_MIX_SOLID,
      mixRoll: 0,
      familyRoll: 0.9,
    });
    expect(turn.street).toBe("turn");
  });

  it("can deal river only at Strong+", () => {
    const river = applyArenaMix(base, {
      rating: ARENA_MIX_STRONG,
      mixRoll: 0,
      familyRoll: 0,
    });
    expect(river.type).toBe("postflop");
    expect(river.street).toBe("river");

    // Same familyRoll at Solid never picks river.
    const solid = applyArenaMix(base, {
      rating: ARENA_MIX_SOLID,
      mixRoll: 0,
      familyRoll: 0,
    });
    expect(solid.street).not.toBe("river");
  });

  it("uses the solid share threshold", () => {
    expect(
      applyArenaMix(base, {
        rating: ARENA_MIX_SOLID,
        mixRoll: ARENA_MIX_SHARE_SOLID - 0.001,
        familyRoll: 0.5,
      }).type,
    ).toBe("postflop");
    expect(
      applyArenaMix(base, {
        rating: ARENA_MIX_SOLID,
        mixRoll: ARENA_MIX_SHARE_SOLID,
        familyRoll: 0.5,
      }),
    ).toEqual(base);
  });
});
