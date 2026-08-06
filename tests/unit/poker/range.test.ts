import { describe, expect, it } from "vitest";

import { cardsFromString, createRng, type Rng } from "@/poker/cards";
import {
  type Combo,
  combosOf,
  comboToKey,
  GRID_SIZE,
  type HandKey,
  HAND_KEY_COUNT,
  HAND_KEYS,
  handKeyIndex,
  handKeyKind,
  handToKey,
  isHandKey,
  parseHandKey,
  Range,
  randomHandFromRange,
  RANKS_DESC,
  TOTAL_COMBOS,
} from "@/poker/range";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

function key(text: string): HandKey {
  if (!isHandKey(text)) throw new Error(`not a hand key: ${text}`);
  return text;
}

// ── The 169 grid ──────────────────────────────────────────────────────────────

describe("the 169-hand grid", () => {
  it("has exactly 169 distinct keys", () => {
    expect(HAND_KEYS).toHaveLength(HAND_KEY_COUNT);
    expect(new Set(HAND_KEYS).size).toBe(HAND_KEY_COUNT);
    record("grid size", "169 distinct hand keys");
  });

  it("splits 13 / 78 / 78", () => {
    const counts = { pair: 0, suited: 0, offsuit: 0 };
    for (const handKey of HAND_KEYS) counts[handKeyKind(handKey)] += 1;
    expect(counts).toEqual({ pair: 13, suited: 78, offsuit: 78 });
    record("grid composition", "13 pairs / 78 suited / 78 offsuit");
  });

  it("lays out AA, AKs … A2s across the top row", () => {
    const topRow = HAND_KEYS.slice(0, GRID_SIZE);
    expect(topRow).toEqual([
      "AA",
      "AKs",
      "AQs",
      "AJs",
      "ATs",
      ...RANKS_DESC.slice(5).map((r) => `A${r}s`),
    ]);
  });

  it("lays out AA, AKo … A2o down the left column", () => {
    const leftColumn = Array.from({ length: GRID_SIZE }, (_, row) => HAND_KEYS[row * GRID_SIZE]);
    expect(leftColumn).toEqual([
      "AA",
      "AKo",
      "AQo",
      "AJo",
      "ATo",
      ...RANKS_DESC.slice(5).map((r) => `A${r}o`),
    ]);
  });

  it("puts pairs on the diagonal", () => {
    for (let i = 0; i < GRID_SIZE; i++) {
      const handKey = HAND_KEYS[i * GRID_SIZE + i];
      expect(handKey).toBe(`${RANKS_DESC[i]}${RANKS_DESC[i]}`);
    }
  });

  it("round-trips every key through parse and rebuild", () => {
    for (const handKey of HAND_KEYS) {
      const { kind, high, low } = parseHandKey(handKey);
      expect(handKeyIndex(handKey)).toBeGreaterThanOrEqual(0);
      const rebuilt = combosOf(handKey)[0];
      expect(rebuilt).toBeDefined();
      expect(comboToKey(rebuilt as Combo)).toBe(handKey);
      if (kind === "pair") expect(high).toBe(low);
      else expect(high).toBeGreaterThan(low);
    }
  });

  it("maps two cards to their key", () => {
    const [ah, ad, ks, kh, qh] = cardsFromString("Ah Ad Ks Kh Qh");
    expect(handToKey(ah!, ad!)).toBe("AA");
    expect(handToKey(ah!, ks!)).toBe("AKo");
    expect(handToKey(kh!, qh!)).toBe("KQs");
    expect(handToKey(qh!, kh!)).toBe("KQs");
  });
});

// ── 2. Combo counting ─────────────────────────────────────────────────────────

describe("combo counting", () => {
  it("counts 6 for a pair, 4 suited, 12 offsuit", () => {
    expect(Range.parse("AA").totalCombos()).toBe(6);
    expect(Range.parse("AKs").totalCombos()).toBe(4);
    expect(Range.parse("AKo").totalCombos()).toBe(12);
    expect(combosOf(key("AA"))).toHaveLength(6);
    expect(combosOf(key("AKs"))).toHaveLength(4);
    expect(combosOf(key("AKo"))).toHaveLength(12);
    record("combo counts", "pair 6 / suited 4 / offsuit 12");
  });

  it("counts a full range as exactly 1326 combos", () => {
    const full = Range.full();
    expect(full.totalCombos()).toBe(TOTAL_COMBOS);
    expect(full.percentOfHands()).toBeCloseTo(100, 10);
    const all = full.combos();
    expect(all).toHaveLength(TOTAL_COMBOS);
    const distinct = new Set(all.map(([a, b]) => `${a}-${b}`));
    expect(distinct.size).toBe(TOTAL_COMBOS);
    record("full range", `${TOTAL_COMBOS} combos, all distinct`);
  });

  it("never repeats a card inside a combo", () => {
    for (const handKey of HAND_KEYS) {
      for (const [a, b] of combosOf(handKey)) expect(a).not.toBe(b);
    }
  });

  it("weights combos for the percentage", () => {
    const half = Range.parse("AA:0.5");
    expect(half.totalCombos()).toBe(6);
    expect(half.weightedCombos()).toBe(3);
    expect(half.percentOfHands()).toBeCloseTo((3 / TOTAL_COMBOS) * 100, 10);
  });
});

// ── 3. Card removal ───────────────────────────────────────────────────────────

describe("card removal", () => {
  const dead = cardsFromString("AhAd");

  it("leaves AA with exactly 1 combo and AKs with exactly 2", () => {
    expect(Range.parse("AA").combosBlocked(dead)).toHaveLength(1);
    expect(Range.parse("AKs").combosBlocked(dead)).toHaveLength(2);
    record("blockers", "Ah+Ad dead → AA has 1 combo, AKs has 2");
  });

  it("removes every combo containing a dead card", () => {
    const deadSet = new Set(dead);
    for (const combo of Range.full().combosBlocked(dead)) {
      expect(deadSet.has(combo[0])).toBe(false);
      expect(deadSet.has(combo[1])).toBe(false);
    }
    // Each dead card sits in 51 combos, and AhAd is the one counted twice.
    expect(Range.full().combosBlocked(dead)).toHaveLength(TOTAL_COMBOS - (51 + 51 - 1));
  });

  it("leaves AKo with 6 combos when both black aces are dead", () => {
    expect(Range.parse("AKo").combosBlocked(cardsFromString("AsAc"))).toHaveLength(6);
  });
});

// ── 4. Notation grammar ───────────────────────────────────────────────────────

describe("notation grammar", () => {
  const cases: Array<[string, number, string[]]> = [
    ["77+", 8 * 6, ["77", "88", "AA"]],
    ["ATs+", 4 * 4, ["ATs", "AJs", "AQs", "AKs"]],
    ["AJo+", 3 * 12, ["AJo", "AQo", "AKo"]],
    ["KQs", 4, ["KQs"]],
    ["22-99", 8 * 6, ["22", "55", "99"]],
    ["A2s-A5s", 4 * 4, ["A2s", "A3s", "A4s", "A5s"]],
    ["AKs:0.5", 4, ["AKs"]],
    ["AK", 4 + 12, ["AKs", "AKo"]],
    ["AT+", 4 * 4 + 4 * 12, ["ATs", "ATo", "AKs", "AKo"]],
    ["A2-A5", 4 * 4 + 4 * 12, ["A2s", "A5o"]],
    ["77+,ATs+,AJo+", 8 * 6 + 4 * 4 + 3 * 12, ["99", "AQs", "AKo"]],
  ];

  it.each(cases)("%s covers %d combos", (notation, combos, members) => {
    const range = Range.parse(notation);
    expect(range.totalCombos()).toBe(combos);
    for (const member of members) expect(range.has(key(member))).toBe(true);
  });

  it("reads the weight suffix", () => {
    const range = Range.parse("AKs:0.5");
    expect(range.weight(key("AKs"))).toBe(0.5);
    expect(range.weightedCombos()).toBe(2);
  });

  it("lets a later token override an earlier one", () => {
    const range = Range.parse("22+, AA:0.5");
    expect(range.weight(key("AA"))).toBe(0.5);
    expect(range.weight(key("KK"))).toBe(1);
  });

  it("treats whitespace and commas alike", () => {
    expect(Range.parse("77+ ATs+").equals(Range.parse("77+,ATs+"))).toBe(true);
    expect(Range.parse("  77+ ,  ATs+  ").equals(Range.parse("77+,ATs+"))).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(() => Range.parse("XX")).toThrow();
    expect(() => Range.parse("AAs")).toThrow();
    expect(() => Range.parse("AKx")).toThrow();
    expect(() => Range.parse("AKs:2")).toThrow();
    expect(() => Range.parse("AKs:banana")).toThrow();
    expect(() => Range.parse("22-AKs")).toThrow();
    expect(() => Range.parse("A2s-K5s")).toThrow();
    expect(() => Range.parse("A2s-A5o")).toThrow();
  });

  it("drops a hand written at weight zero", () => {
    const range = Range.parse("77+, AA:0");
    expect(range.has(key("AA"))).toBe(false);
    expect(range.has(key("KK"))).toBe(true);
  });
});

// ── 1. Round trip ─────────────────────────────────────────────────────────────

describe("toNotation is the inverse of parse", () => {
  it("emits the shortest form for the canonical shapes", () => {
    expect(Range.parse("77,88,99,TT,JJ,QQ,KK,AA").toNotation()).toBe("77+");
    expect(Range.parse("22,33,44,55,66,77,88,99").toNotation()).toBe("22-99");
    expect(Range.parse("ATs,AJs,AQs,AKs").toNotation()).toBe("ATs+");
    expect(Range.parse("A2s,A3s,A4s,A5s").toNotation()).toBe("A2s-A5s");
    expect(Range.parse("KQs").toNotation()).toBe("KQs");
    expect(Range.parse("AKs,AKo").toNotation()).toBe("AK");
    expect(Range.parse("ATs+,ATo+").toNotation()).toBe("AT+");
    expect(Range.parse("AKs:0.5").toNotation()).toBe("AKs:0.5");
    expect(Range.empty().toNotation()).toBe("");
    record(
      "shortest form",
      "runs collapse to + and -, matching suited/offsuit runs collapse to bare",
    );
  });

  it("round-trips 500 randomly generated ranges", () => {
    const rng = createRng("range-round-trip");
    const weightPool = [1, 0.75, 0.5, 0.32, 0.05];
    let checked = 0;

    for (let trial = 0; trial < 500; trial++) {
      const density = 0.05 + rng() * 0.9;
      const entries: Array<[HandKey, number]> = [];
      for (const handKey of HAND_KEYS) {
        if (rng() > density) continue;
        const weight = weightPool[Math.floor(rng() * weightPool.length)] ?? 1;
        entries.push([handKey, weight]);
      }
      const original = Range.fromWeights(entries);
      const notation = original.toNotation();
      const reparsed = Range.parse(notation);
      if (!reparsed.equals(original)) {
        throw new Error(`round-trip failed for "${notation}"`);
      }
      // Idempotent: printing the reparsed range gives the identical string.
      expect(reparsed.toNotation()).toBe(notation);
      checked++;
    }

    expect(checked).toBe(500);
    record("round trip", "parse(toNotation(r)) deep-equals r for 500 random ranges");
  });

  it("round-trips ranges built from awkward float weights", () => {
    const weird = [0.1 + 0.2, 1 / 3, 0.9999999999999999, 1e-7];
    const range = Range.fromWeights(
      weird.map((weight, index) => [HAND_KEYS[index]!, weight] as const),
    );
    expect(Range.parse(range.toNotation()).equals(range)).toBe(true);
  });
});

// ── Set algebra ───────────────────────────────────────────────────────────────

describe("set algebra", () => {
  it("unions to the higher weight", () => {
    const a = Range.parse("77+,AKs:0.5");
    const b = Range.parse("AKs,AQs:0.25");
    const union = a.union(b);
    expect(union.weight(key("AKs"))).toBe(1);
    expect(union.weight(key("AQs"))).toBe(0.25);
    expect(union.weight(key("AA"))).toBe(1);
  });

  it("intersects to the lower weight", () => {
    const a = Range.parse("77+,AKs:0.5");
    const b = Range.parse("99+,AKs");
    const intersect = a.intersect(b);
    expect(intersect.has(key("77"))).toBe(false);
    expect(intersect.weight(key("99"))).toBe(1);
    expect(intersect.weight(key("AKs"))).toBe(0.5);
  });

  it("subtracts weight and drops what reaches zero", () => {
    const a = Range.parse("77+,AKs");
    const b = Range.parse("99+,AKs:0.25");
    const difference = a.subtract(b);
    expect(difference.has(key("99"))).toBe(false);
    expect(difference.weight(key("77"))).toBe(1);
    expect(difference.weight(key("AKs"))).toBe(0.75);
  });

  it("is immutable", () => {
    const original = Range.parse("77+");
    const changed = original.withWeight(key("AKs"), 1);
    expect(original.has(key("AKs"))).toBe(false);
    expect(changed.has(key("AKs"))).toBe(true);
  });
});

// ── 5. Weighted sampling ──────────────────────────────────────────────────────

describe("randomHandFromRange", () => {
  it("matches the intended weights over 200,000 draws", () => {
    // Chosen so the four hands span all three kinds and both weightings.
    const range = Range.parse("AA, AKo:0.5, KQs, 72o:0.25");
    const rng: Rng = createRng("weighted-sampling");
    const draws = 200_000;

    const counts = new Map<HandKey, number>();
    for (let i = 0; i < draws; i++) {
      const combo = randomHandFromRange(range, [], rng);
      if (combo === undefined) throw new Error("sampled nothing from a non-empty range");
      const handKey = comboToKey(combo);
      counts.set(handKey, (counts.get(handKey) ?? 0) + 1);
    }

    const totalWeightedCombos = range.weightedCombos();
    const rows: string[] = [];
    let worst = 0;
    for (const [handKey, weight] of range.entries()) {
      const expected = (combosOf(handKey).length * weight) / totalWeightedCombos;
      const observed = (counts.get(handKey) ?? 0) / draws;
      worst = Math.max(worst, Math.abs(observed - expected));
      rows.push(
        `  ${handKey.padEnd(5)} expected ${(expected * 100).toFixed(2)}%  observed ${(observed * 100).toFixed(2)}%`,
      );
    }
    console.log(
      `\nweighted sampling over ${draws.toLocaleString("en-US")} draws:\n${rows.join("\n")}\n`,
    );

    expect(worst).toBeLessThan(0.01);
    record(
      "weighted sampling",
      `200,000 draws, worst deviation ${(worst * 100).toFixed(3)}pp (tolerance 1pp)`,
    );
  }, 30_000);

  it("weights by combos, not by hand key", () => {
    // AA and AKo both at weight 1: AKo has twice the combos and must appear
    // twice as often. Sampling per key would give them 50/50.
    const range = Range.parse("AA,AKo");
    const rng = createRng("combo-weighting");
    let akoCount = 0;
    const draws = 60_000;
    for (let i = 0; i < draws; i++) {
      const combo = randomHandFromRange(range, [], rng);
      if (combo !== undefined && comboToKey(combo) === "AKo") akoCount++;
    }
    expect(akoCount / draws).toBeCloseTo(12 / 18, 2);
  });

  it("never returns a blocked combo", () => {
    const dead = cardsFromString("AhAdKsQh");
    const deadSet = new Set(dead);
    const range = Range.parse("22+,A2s+,KQs,AKo");
    const rng = createRng("blocked-sampling");
    for (let i = 0; i < 20_000; i++) {
      const combo = randomHandFromRange(range, dead, rng);
      if (combo === undefined) throw new Error("sampled nothing");
      expect(deadSet.has(combo[0])).toBe(false);
      expect(deadSet.has(combo[1])).toBe(false);
    }
    record("sampling respects blockers", "20,000 draws with four dead cards, zero collisions");
  });

  it("only ever returns the last live combo of a fully blocked pair", () => {
    const dead = cardsFromString("AhAd");
    const range = Range.parse("AA");
    const rng = createRng("blocked-aces");
    for (let i = 0; i < 200; i++) {
      const combo = randomHandFromRange(range, dead, rng);
      expect(combo).toBeDefined();
      expect(new Set(combo)).toEqual(new Set(cardsFromString("AsAc")));
    }
  });

  it("returns undefined when nothing is left", () => {
    expect(randomHandFromRange(Range.empty(), [], createRng(1))).toBeUndefined();
    const allAcesDead = cardsFromString("AhAdAsAc");
    expect(randomHandFromRange(Range.parse("AA"), allAcesDead, createRng(1))).toBeUndefined();
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.2 — range model and notation parser\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});
