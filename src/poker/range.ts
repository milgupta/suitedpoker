/**
 * The 169-hand grid and range notation.
 *
 * Ranges are the substrate for every solution, chart and bot, so this file is
 * deliberately strict: a Range is immutable, weights live in [0, 1], and the
 * notation parser and printer are exact inverses of each other.
 *
 * Notation convention: `ATs+` fixes the HIGH card and walks the kicker up
 * (ATs, AJs, AQs, AKs). The same-gap ladder reading some tools give `65s+`
 * is NOT supported — `toNotation` never emits a form that would depend on it.
 */

import { type Card, makeCard, rankOf, type Rng, suitOf, SUIT_COUNT } from "./cards";

/** Descending, because that is the order the UI grid draws and indexes. */
export const RANKS_DESC = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

type RankDesc = (typeof RANKS_DESC)[number];

type PairKey = { [K in RankDesc]: `${K}${K}` }[RankDesc];

type NonPairKeys<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? `${Head}${Rest[number]}s` | `${Head}${Rest[number]}o` | NonPairKeys<Rest>
  : never;

/** All 169 and exactly 169: 13 pairs, 78 suited, 78 offsuit. */
export type HandKey = PairKey | NonPairKeys<typeof RANKS_DESC>;

export type HandKeyKind = "pair" | "suited" | "offsuit";

export type Combo = readonly [Card, Card];

export const GRID_SIZE = 13;
export const HAND_KEY_COUNT = 169;
export const TOTAL_COMBOS = 1326;

const COMBOS_PER_KIND: Record<HandKeyKind, number> = { pair: 6, suited: 4, offsuit: 12 };

/** Grid coordinate → rank index (0 = deuce), since the grid runs A-first. */
function gridToRank(gridIndex: number): number {
  return GRID_SIZE - 1 - gridIndex;
}

function rankCharDesc(gridIndex: number): RankDesc {
  const char = RANKS_DESC[gridIndex];
  if (char === undefined) throw new RangeError(`grid index out of range: ${gridIndex}`);
  return char;
}

const RANK_FROM_CHAR = new Map<string, number>(
  RANKS_DESC.map((char, gridIndex) => [char, gridToRank(gridIndex)]),
);

function rankCharOfIndex(rankIndex: number): RankDesc {
  return rankCharDesc(GRID_SIZE - 1 - rankIndex);
}

/**
 * Row-major over the grid: row 0 is AA, AKs … A2s; column 0 is AA, AKo … A2o.
 * A UI grid can index this array directly.
 */
export const HAND_KEYS: readonly HandKey[] = (() => {
  const keys: HandKey[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const a = rankCharDesc(row);
      const b = rankCharDesc(col);
      if (row === col) keys.push(`${a}${a}` as HandKey);
      else if (row < col) keys.push(`${a}${b}s` as HandKey);
      else keys.push(`${b}${a}o` as HandKey);
    }
  }
  return Object.freeze(keys);
})();

const HAND_KEY_ORDER = new Map<string, number>(HAND_KEYS.map((key, index) => [key, index]));

export function isHandKey(value: string): value is HandKey {
  return HAND_KEY_ORDER.has(value);
}

export function handKeyIndex(key: HandKey): number {
  const index = HAND_KEY_ORDER.get(key);
  if (index === undefined) throw new RangeError(`not a hand key: ${key}`);
  return index;
}

export interface ParsedHandKey {
  kind: HandKeyKind;
  /** Rank indices, 0 = deuce. `high >= low`, equal only for pairs. */
  high: number;
  low: number;
}

export function parseHandKey(key: HandKey): ParsedHandKey {
  const first = RANK_FROM_CHAR.get(key[0] ?? "");
  const second = RANK_FROM_CHAR.get(key[1] ?? "");
  if (first === undefined || second === undefined) throw new RangeError(`not a hand key: ${key}`);
  if (first === second) return { kind: "pair", high: first, low: first };
  const suffix = key[2];
  return {
    kind: suffix === "s" ? "suited" : "offsuit",
    high: Math.max(first, second),
    low: Math.min(first, second),
  };
}

export function makeHandKey(high: number, low: number, kind: HandKeyKind): HandKey {
  if (kind === "pair") {
    if (high !== low) throw new RangeError(`a pair needs equal ranks, got ${high} and ${low}`);
    const char = rankCharOfIndex(high);
    return `${char}${char}` as HandKey;
  }
  if (high === low) throw new RangeError(`a non-pair needs distinct ranks, got ${high}`);
  const hi = rankCharOfIndex(Math.max(high, low));
  const lo = rankCharOfIndex(Math.min(high, low));
  return `${hi}${lo}${kind === "suited" ? "s" : "o"}` as HandKey;
}

export function handKeyKind(key: HandKey): HandKeyKind {
  return parseHandKey(key).kind;
}

export function comboCountOf(key: HandKey): number {
  return COMBOS_PER_KIND[parseHandKey(key).kind];
}

export function handToKey(a: Card, b: Card): HandKey {
  const rankA = rankOf(a);
  const rankB = rankOf(b);
  if (rankA === rankB) return makeHandKey(rankA, rankA, "pair");
  const suited = suitOf(a) === suitOf(b);
  return makeHandKey(Math.max(rankA, rankB), Math.min(rankA, rankB), suited ? "suited" : "offsuit");
}

export function comboToKey(combo: Combo): HandKey {
  return handToKey(combo[0], combo[1]);
}

/** Higher card first, so a combo has one canonical spelling. */
export function combosOf(key: HandKey): Combo[] {
  const { kind, high, low } = parseHandKey(key);
  const combos: Combo[] = [];
  if (kind === "pair") {
    for (let a = 0; a < SUIT_COUNT; a++) {
      for (let b = a + 1; b < SUIT_COUNT; b++) {
        combos.push([makeCard(high, b), makeCard(high, a)]);
      }
    }
    return combos;
  }
  if (kind === "suited") {
    for (let suit = 0; suit < SUIT_COUNT; suit++) {
      combos.push([makeCard(high, suit), makeCard(low, suit)]);
    }
    return combos;
  }
  for (let hiSuit = 0; hiSuit < SUIT_COUNT; hiSuit++) {
    for (let loSuit = 0; loSuit < SUIT_COUNT; loSuit++) {
      if (hiSuit === loSuit) continue;
      combos.push([makeCard(high, hiSuit), makeCard(low, loSuit)]);
    }
  }
  return combos;
}

// ── Notation ──────────────────────────────────────────────────────────────────

interface Atom {
  high: number;
  low: number;
  /** `both` is the bare form — `AK` means AKs and AKo. */
  kind: HandKeyKind | "both";
}

function parseAtom(text: string, token: string): Atom {
  if (text.length !== 2 && text.length !== 3) {
    throw new SyntaxError(`cannot read "${text}" in range token "${token}"`);
  }
  const first = RANK_FROM_CHAR.get(text[0]!.toUpperCase());
  const second = RANK_FROM_CHAR.get(text[1]!.toUpperCase());
  if (first === undefined || second === undefined) {
    throw new SyntaxError(`cannot read "${text}" in range token "${token}"`);
  }
  const suffix = text.length === 3 ? text[2]!.toLowerCase() : undefined;
  if (first === second) {
    if (suffix !== undefined) {
      throw new SyntaxError(`a pair cannot be suited or offsuit: "${text}"`);
    }
    return { high: first, low: first, kind: "pair" };
  }
  if (suffix !== undefined && suffix !== "s" && suffix !== "o") {
    throw new SyntaxError(`unknown suffix "${suffix}" in range token "${token}"`);
  }
  return {
    high: Math.max(first, second),
    low: Math.min(first, second),
    kind: suffix === "s" ? "suited" : suffix === "o" ? "offsuit" : "both",
  };
}

function expandAtom(atom: Atom, low: number, out: HandKey[]): void {
  if (atom.kind === "pair") {
    out.push(makeHandKey(low, low, "pair"));
    return;
  }
  if (atom.kind === "both") {
    out.push(makeHandKey(atom.high, low, "suited"));
    out.push(makeHandKey(atom.high, low, "offsuit"));
    return;
  }
  out.push(makeHandKey(atom.high, low, atom.kind));
}

function keysForToken(token: string): { keys: HandKey[]; weight: number } {
  const colon = token.lastIndexOf(":");
  const body = colon === -1 ? token : token.slice(0, colon);
  const weightText = colon === -1 ? undefined : token.slice(colon + 1);

  let weight = 1;
  if (weightText !== undefined) {
    weight = Number(weightText);
    if (!Number.isFinite(weight) || weightText.trim() === "") {
      throw new SyntaxError(`weight must be a number in "${token}"`);
    }
    if (weight < 0 || weight > 1) {
      throw new SyntaxError(`weight must be between 0 and 1 in "${token}"`);
    }
  }

  const keys: HandKey[] = [];

  if (body.endsWith("+")) {
    const atom = parseAtom(body.slice(0, -1), token);
    const top = atom.kind === "pair" ? GRID_SIZE - 1 : atom.high - 1;
    for (let low = atom.low; low <= top; low++) expandAtom(atom, low, keys);
    return { keys, weight };
  }

  const dash = body.indexOf("-", 1);
  if (dash !== -1) {
    const left = parseAtom(body.slice(0, dash), token);
    const right = parseAtom(body.slice(dash + 1), token);
    if (left.kind !== right.kind) {
      throw new SyntaxError(`both ends of a range must match in "${token}"`);
    }
    if (left.kind === "pair") {
      const lo = Math.min(left.low, right.low);
      const hi = Math.max(left.low, right.low);
      for (let rank = lo; rank <= hi; rank++) expandAtom(left, rank, keys);
      return { keys, weight };
    }
    if (left.high !== right.high) {
      throw new SyntaxError(`both ends of a range must share a high card in "${token}"`);
    }
    const lo = Math.min(left.low, right.low);
    const hi = Math.max(left.low, right.low);
    for (let low = lo; low <= hi; low++) expandAtom(left, low, keys);
    return { keys, weight };
  }

  const atom = parseAtom(body, token);
  expandAtom(atom, atom.low, keys);
  return { keys, weight };
}

/** Maximal runs of consecutive values in an ascending list. */
function runsOf(sortedAscending: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const value of sortedAscending) {
    const last = runs[runs.length - 1];
    if (last !== undefined && value === last[1] + 1) last[1] = value;
    else runs.push([value, value]);
  }
  return runs;
}

function formatPairRun(lo: number, hi: number): string {
  const loChar = rankCharOfIndex(lo);
  const hiChar = rankCharOfIndex(hi);
  if (lo === hi) return `${loChar}${loChar}`;
  if (hi === GRID_SIZE - 1) return `${loChar}${loChar}+`;
  return `${loChar}${loChar}-${hiChar}${hiChar}`;
}

function formatNonPairRun(high: number, lo: number, hi: number, suffix: string): string {
  const highChar = rankCharOfIndex(high);
  const loChar = rankCharOfIndex(lo);
  const hiChar = rankCharOfIndex(hi);
  if (lo === hi) return `${highChar}${loChar}${suffix}`;
  if (hi === high - 1) return `${highChar}${loChar}${suffix}+`;
  return `${highChar}${loChar}${suffix}-${highChar}${hiChar}${suffix}`;
}

// ── Range ─────────────────────────────────────────────────────────────────────

export class Range {
  private readonly weights: ReadonlyMap<HandKey, number>;

  private constructor(weights: ReadonlyMap<HandKey, number>) {
    this.weights = weights;
  }

  static empty(): Range {
    return new Range(new Map());
  }

  static full(weight = 1): Range {
    return Range.fromWeights(HAND_KEYS.map((key) => [key, weight]));
  }

  static fromWeights(entries: Iterable<readonly [HandKey, number]>): Range {
    const map = new Map<HandKey, number>();
    for (const [key, weight] of entries) {
      if (!isHandKey(key)) throw new RangeError(`not a hand key: ${key}`);
      if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
        throw new RangeError(`weight for ${key} must be between 0 and 1, got ${weight}`);
      }
      if (weight === 0) map.delete(key);
      else map.set(key, weight);
    }
    return new Range(map);
  }

  /**
   * Comma- or whitespace-separated tokens. A later token overrides an earlier
   * one for the same hand, so `"22+, AA:0.5"` reads the way it looks.
   */
  static parse(notation: string): Range {
    const map = new Map<HandKey, number>();
    for (const token of notation.split(/[,\s]+/)) {
      if (token === "") continue;
      const { keys, weight } = keysForToken(token);
      for (const key of keys) {
        if (weight === 0) map.delete(key);
        else map.set(key, weight);
      }
    }
    return new Range(map);
  }

  weight(key: HandKey): number {
    return this.weights.get(key) ?? 0;
  }

  has(key: HandKey): boolean {
    return this.weights.has(key);
  }

  get size(): number {
    return this.weights.size;
  }

  isEmpty(): boolean {
    return this.weights.size === 0;
  }

  /** Present hands in canonical grid order. */
  keys(): HandKey[] {
    return HAND_KEYS.filter((key) => this.weights.has(key));
  }

  entries(): Array<[HandKey, number]> {
    return this.keys().map((key) => [key, this.weights.get(key) ?? 0]);
  }

  withWeight(key: HandKey, weight: number): Range {
    return Range.fromWeights([...this.entries(), [key, weight]]);
  }

  /** Combos present, ignoring weight. A full range is 1326. */
  totalCombos(): number {
    let total = 0;
    for (const key of this.weights.keys()) total += comboCountOf(key);
    return total;
  }

  /** Combos scaled by weight — the number that means "how much range is this". */
  weightedCombos(): number {
    let total = 0;
    for (const [key, weight] of this.weights) total += comboCountOf(key) * weight;
    return total;
  }

  percentOfHands(): number {
    return (this.weightedCombos() / TOTAL_COMBOS) * 100;
  }

  combos(): Combo[] {
    return this.keys().flatMap((key) => combosOf(key));
  }

  combosBlocked(deadCards: Iterable<Card>): Combo[] {
    const dead = new Set<Card>(deadCards);
    if (dead.size === 0) return this.combos();
    return this.combos().filter(([a, b]) => !dead.has(a) && !dead.has(b));
  }

  /** Every live combo with the weight of its hand key attached. */
  comboEntries(deadCards: Iterable<Card> = []): Array<{ combo: Combo; weight: number }> {
    const dead = new Set<Card>(deadCards);
    const out: Array<{ combo: Combo; weight: number }> = [];
    for (const key of this.keys()) {
      const weight = this.weights.get(key) ?? 0;
      for (const combo of combosOf(key)) {
        if (dead.has(combo[0]) || dead.has(combo[1])) continue;
        out.push({ combo, weight });
      }
    }
    return out;
  }

  union(other: Range): Range {
    const map = new Map(this.weights);
    for (const [key, weight] of other.weights) {
      map.set(key, Math.max(map.get(key) ?? 0, weight));
    }
    return new Range(map);
  }

  intersect(other: Range): Range {
    const map = new Map<HandKey, number>();
    for (const [key, weight] of this.weights) {
      const overlap = Math.min(weight, other.weights.get(key) ?? 0);
      if (overlap > 0) map.set(key, overlap);
    }
    return new Range(map);
  }

  subtract(other: Range): Range {
    const map = new Map<HandKey, number>();
    for (const [key, weight] of this.weights) {
      const left = weight - (other.weights.get(key) ?? 0);
      if (left > 0) map.set(key, left);
    }
    return new Range(map);
  }

  equals(other: Range): boolean {
    if (this.weights.size !== other.weights.size) return false;
    for (const [key, weight] of this.weights) {
      if (other.weights.get(key) !== weight) return false;
    }
    return true;
  }

  /**
   * The shortest notation that parses back to exactly this range: consecutive
   * hands collapse into `+` and `-` runs, and a suited run with an identical
   * offsuit run collapses again into the bare form.
   */
  toNotation(): string {
    const byWeight = new Map<number, HandKey[]>();
    for (const [key, weight] of this.entries()) {
      const bucket = byWeight.get(weight);
      if (bucket === undefined) byWeight.set(weight, [key]);
      else bucket.push(key);
    }

    const tokens: string[] = [];
    const weightsDescending = [...byWeight.keys()].sort((a, b) => b - a);

    for (const weight of weightsDescending) {
      const suffix = weight === 1 ? "" : `:${weight}`;
      const keys = byWeight.get(weight) ?? [];

      const pairs: number[] = [];
      const suited = new Map<number, number[]>();
      const offsuit = new Map<number, number[]>();
      for (const key of keys) {
        const { kind, high, low } = parseHandKey(key);
        if (kind === "pair") {
          pairs.push(high);
          continue;
        }
        const target = kind === "suited" ? suited : offsuit;
        const bucket = target.get(high);
        if (bucket === undefined) target.set(high, [low]);
        else bucket.push(low);
      }

      for (const [lo, hi] of runsOf(pairs.sort((a, b) => a - b)).reverse()) {
        tokens.push(formatPairRun(lo, hi) + suffix);
      }

      const highCards = [...new Set([...suited.keys(), ...offsuit.keys()])].sort((a, b) => b - a);
      for (const high of highCards) {
        const suitedRuns = runsOf((suited.get(high) ?? []).sort((a, b) => a - b));
        const offsuitRuns = runsOf((offsuit.get(high) ?? []).sort((a, b) => a - b));
        const offsuitTaken = new Set<number>();

        const bare: Array<[number, number]> = [];
        const suitedOnly: Array<[number, number]> = [];
        for (const run of suitedRuns) {
          const twin = offsuitRuns.findIndex(
            ([lo, hi], index) => !offsuitTaken.has(index) && lo === run[0] && hi === run[1],
          );
          if (twin === -1) suitedOnly.push(run);
          else {
            offsuitTaken.add(twin);
            bare.push(run);
          }
        }

        for (const [lo, hi] of bare.reverse()) {
          tokens.push(formatNonPairRun(high, lo, hi, "") + suffix);
        }
        for (const [lo, hi] of suitedOnly.reverse()) {
          tokens.push(formatNonPairRun(high, lo, hi, "s") + suffix);
        }
        for (let index = offsuitRuns.length - 1; index >= 0; index--) {
          if (offsuitTaken.has(index)) continue;
          const run = offsuitRuns[index]!;
          tokens.push(formatNonPairRun(high, run[0], run[1], "o") + suffix);
        }
      }
    }

    return tokens.join(",");
  }

  toString(): string {
    return this.toNotation();
  }
}

/**
 * Weighted sample of a single combo, respecting card removal.
 *
 * Sampling is COMBO-weighted, not hand-key-weighted: AA at weight 1 is six
 * combos and AKo at weight 1 is twelve, so AKo must come up twice as often.
 * Getting this backwards would quietly skew every bot's range and every
 * generated spot toward pairs.
 */
export function randomHandFromRange(
  range: Range,
  deadCards: Iterable<Card>,
  rng: Rng,
): Combo | undefined {
  const dead = new Set<Card>(deadCards);

  let total = 0;
  for (const [key, weight] of range.entries()) {
    for (const combo of combosOf(key)) {
      if (dead.has(combo[0]) || dead.has(combo[1])) continue;
      total += weight;
    }
  }
  if (total <= 0) return undefined;

  let target = rng() * total;
  for (const [key, weight] of range.entries()) {
    for (const combo of combosOf(key)) {
      if (dead.has(combo[0]) || dead.has(combo[1])) continue;
      target -= weight;
      if (target < 0) return combo;
    }
  }

  // Only reachable through floating-point drift at the very top of the range.
  const live = range.comboEntries(dead);
  return live[live.length - 1]?.combo;
}

/** Convenience for `Range.parse` at call sites that read better without the class. */
export function parseRange(notation: string): Range {
  return Range.parse(notation);
}
