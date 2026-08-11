import { describe, expect, it } from "vitest";
import { BOT_NAMES, botNamesFor } from "../../../src/poker/bot-names";

describe("bot names", () => {
  it("holds exactly 50 distinct, plain names", () => {
    expect(BOT_NAMES).toHaveLength(50);
    expect(new Set(BOT_NAMES).size).toBe(50);
    for (const name of BOT_NAMES) {
      // Ordinary first names: one word, letters only, capitalised.
      expect(name).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it("is deterministic in the seed and unique per table", () => {
    const a = botNamesFor("sess:abc", 5);
    const b = botNamesFor("sess:abc", 5);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(5);
  });

  it("different seeds seat different tables", () => {
    const tables = new Set(
      Array.from({ length: 20 }, (_, i) => botNamesFor(`sess:${i}`, 5).join(",")),
    );
    // 20 identical tables from 20 seeds would mean the seed is ignored.
    expect(tables.size).toBeGreaterThan(15);
  });

  it("refuses to seat more names than exist", () => {
    expect(() => botNamesFor("s", 51)).toThrow(RangeError);
    expect(botNamesFor("s", 50)).toHaveLength(50);
  });

  it("every name in the pool is reachable", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const name of botNamesFor(`reach:${i}`, 5)) seen.add(name);
    }
    expect(seen.size).toBe(50);
  });
});
