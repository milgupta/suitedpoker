import { describe, expect, it } from "vitest";
import { leakToSpotConfig, PRIMARY_LEAK_KEYS, isPrimaryLeakKey } from "@/lib/leak-targeting";
import {
  ARENA_MIX_FLOOR,
  ARENA_MIX_REC,
  ARENA_MIX_SHARE_REC,
  ARENA_MIX_SHARE_SOLID,
  ARENA_MIX_SHARE_STARTER,
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

  it("pins the bands", () => {
    // Onboarding places beginners at 700–850; the floor must sit at the top of
    // that band or the target audience never sees a postflop spot at all.
    expect(ARENA_MIX_FLOOR).toBe(850);
    expect(ARENA_MIX_REC).toBe(1000);
    expect(ARENA_MIX_SOLID).toBe(1200);
    expect(ARENA_MIX_STRONG).toBe(1400);
    expect(ARENA_MIX_SHARE_STARTER).toBe(0.1);
    expect(ARENA_MIX_SHARE_REC).toBe(0.2);
    expect(ARENA_MIX_SHARE_SOLID).toBe(0.35);
  });

  it("leaves beginners below the floor on preflop", () => {
    expect(
      applyArenaMix(base, {
        rating: ARENA_MIX_FLOOR - 1,
        mixRoll: 0,
        familyRoll: 0,
      }),
    ).toEqual(base);
  });

  it("gives the 850–999 band a small share of the easiest flops", () => {
    const hit = applyArenaMix(base, {
      rating: ARENA_MIX_FLOOR,
      mixRoll: ARENA_MIX_SHARE_STARTER - 0.001,
      familyRoll: 0.5,
    });
    expect(hit.type).toBe("postflop");
    expect(hit.street).toBe("flop");
    expect(hit.tags).toEqual(["dry", "ace-high"]);
    expect(hit.difficulty).toBe(5);

    // The starter share is 10%, not Rec's 20% — a roll between the two stays
    // preflop below 1000 and deals postflop at 1000.
    const betweenShares = {
      mixRoll: ARENA_MIX_SHARE_STARTER,
      familyRoll: 0.5,
    };
    expect(applyArenaMix(base, { rating: ARENA_MIX_REC - 1, ...betweenShares })).toEqual(base);
    expect(applyArenaMix(base, { rating: ARENA_MIX_REC, ...betweenShares }).type).toBe("postflop");
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
