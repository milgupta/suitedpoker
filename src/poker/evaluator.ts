/**
 * Hand evaluation.
 *
 * There are deliberately TWO implementations here:
 *
 *   evaluate5 — sorts and pattern-matches. Slow, boring, obviously correct.
 *               Validated by exhaustively enumerating all 2,598,960 five-card
 *               hands and matching the known category counts exactly.
 *
 *   evaluate7 — bit masks and a straight lookup table. Fast, and the one every
 *               hot path uses.
 *
 * evaluate7 does NOT call evaluate5. That is the point: the differential test
 * (evaluate7 vs. the max over all 21 five-card subsets) only means something if
 * the two are independent derivations. An evaluate7 written as "max over
 * subsets" would pass a differential test against itself and prove nothing.
 */

import { type Card, type Rank, rankChar, RANK_COUNT } from "./cards";

export const HAND_CATEGORIES = [
  "high_card",
  "pair",
  "two_pair",
  "trips",
  "straight",
  "flush",
  "full_house",
  "quads",
  "straight_flush",
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];

const HIGH_CARD = 0;
const PAIR = 1;
const TWO_PAIR = 2;
const TRIPS = 3;
const STRAIGHT = 4;
const FLUSH = 5;
const FULL_HOUSE = 6;
const QUADS = 7;
const STRAIGHT_FLUSH = 8;

/**
 * How many of the five packed rank slots carry meaning, per category. Comparing
 * across categories never happens — the category dominates the packed integer —
 * so the unused low slots are simply zero.
 */
const SIGNIFICANT_RANKS: readonly number[] = [
  5, // high card
  4, // pair
  3, // two pair
  3, // trips
  1, // straight
  5, // flush
  2, // full house
  2, // quads
  1, // straight flush
];

/**
 * Packed: category << 20, then five rank indices at 4 bits each, most
 * significant first. Higher is strictly better, and a plain `>` is a legal
 * comparison — which is what makes side-pot resolution cheap.
 */
export type HandValue = number & { readonly __brand: "HandValue" };

export interface HandDescription {
  category: HandCategory;
  categoryIndex: number;
  /** Most significant first: [quad rank, kicker], [straight high], etc. */
  ranks: Rank[];
}

function pack(category: number, r1: number, r2 = 0, r3 = 0, r4 = 0, r5 = 0): HandValue {
  const packed = (category << 20) | (r1 << 16) | (r2 << 12) | (r3 << 8) | (r4 << 4) | r5;
  return packed as HandValue;
}

export function categoryOf(value: HandValue): HandCategory {
  const index = value >>> 20;
  const category = HAND_CATEGORIES[index];
  if (category === undefined) throw new RangeError(`not a hand value: ${value}`);
  return category;
}

export function describeHand(value: HandValue): HandDescription {
  const categoryIndex = value >>> 20;
  const category = HAND_CATEGORIES[categoryIndex];
  if (category === undefined) throw new RangeError(`not a hand value: ${value}`);
  const significant = SIGNIFICANT_RANKS[categoryIndex] ?? 5;
  const ranks: Rank[] = [];
  for (let i = 0; i < significant; i++) {
    ranks.push(rankChar((value >>> (16 - i * 4)) & 0xf));
  }
  return { category, categoryIndex, ranks };
}

// ── Straight lookup ───────────────────────────────────────────────────────────

const WHEEL_MASK = (1 << 12) | (1 << 3) | (1 << 2) | (1 << 1) | 1; // A5432

/** rank-mask (13 bits) → index of the straight's high card, or -1. */
const STRAIGHT_HIGH: Int8Array = (() => {
  const table = new Int8Array(1 << RANK_COUNT).fill(-1);
  for (let mask = 0; mask < table.length; mask++) {
    let high = -1;
    for (let top = RANK_COUNT - 1; top >= 4; top--) {
      const run = 0b11111 << (top - 4);
      if ((mask & run) === run) {
        high = top;
        break;
      }
    }
    // The wheel plays A-low, so its high card is the five.
    if (high === -1 && (mask & WHEEL_MASK) === WHEEL_MASK) high = 3;
    table[mask] = high;
  }
  return table;
})();

function popcount(mask: number): number {
  let n = mask - ((mask >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

/** The five highest set bits of a rank mask, most significant first. */
function topFive(mask: number): [number, number, number, number, number] {
  const out: number[] = [];
  for (let r = RANK_COUNT - 1; r >= 0 && out.length < 5; r--) {
    if ((mask >> r) & 1) out.push(r);
  }
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0, out[3] ?? 0, out[4] ?? 0];
}

// ── evaluate5: the reference implementation ───────────────────────────────────

export function evaluate5(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new RangeError(`evaluate5 needs 5 cards, got ${cards.length}`);

  const ranks: number[] = [];
  let sameSuit = true;
  const firstSuit = (cards[0] ?? 0) & 3;
  for (const card of cards) {
    ranks.push(card >> 2);
    if ((card & 3) !== firstSuit) sameSuit = false;
  }
  ranks.sort((a, b) => b - a);

  // Group by rank: [count, rank] sorted by count desc then rank desc, so the
  // packed kickers fall out in comparison order for every category at once.
  const groups: Array<[number, number]> = [];
  for (const rank of ranks) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last[1] === rank) last[0] += 1;
    else groups.push([1, rank]);
  }
  groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);

  const distinct = groups.length;
  const g0 = groups[0]!;

  if (distinct === 5) {
    let straightHigh = -1;
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks[0] === 12 && ranks[1] === 3 && ranks[4] === 0) straightHigh = 3;

    if (straightHigh >= 0 && sameSuit) return pack(STRAIGHT_FLUSH, straightHigh);
    if (sameSuit) return pack(FLUSH, ranks[0]!, ranks[1]!, ranks[2]!, ranks[3]!, ranks[4]!);
    if (straightHigh >= 0) return pack(STRAIGHT, straightHigh);
    return pack(HIGH_CARD, ranks[0]!, ranks[1]!, ranks[2]!, ranks[3]!, ranks[4]!);
  }

  const g1 = groups[1]!;
  if (g0[0] === 4) return pack(QUADS, g0[1], g1[1]);
  if (g0[0] === 3 && g1[0] === 2) return pack(FULL_HOUSE, g0[1], g1[1]);
  if (g0[0] === 3) return pack(TRIPS, g0[1], g1[1], groups[2]![1]);
  if (g0[0] === 2 && g1[0] === 2) return pack(TWO_PAIR, g0[1], g1[1], groups[2]![1]);
  return pack(PAIR, g0[1], g1[1], groups[2]![1], groups[3]![1]);
}

// ── evaluate7: the fast path ──────────────────────────────────────────────────

/** Reused across calls: evaluate7 is the hottest function in the codebase. */
const rankCounts: number[] = new Array<number>(RANK_COUNT).fill(0);

export function evaluate7(cards: readonly Card[]): HandValue {
  if (cards.length !== 7) throw new RangeError(`evaluate7 needs 7 cards, got ${cards.length}`);

  for (let r = 0; r < RANK_COUNT; r++) rankCounts[r] = 0;

  let rankMask = 0;
  let suit0 = 0;
  let suit1 = 0;
  let suit2 = 0;
  let suit3 = 0;
  for (let i = 0; i < 7; i++) {
    const card = cards[i]!;
    const rank = card >> 2;
    const bit = 1 << rank;
    rankMask |= bit;
    rankCounts[rank] = (rankCounts[rank] ?? 0) + 1;
    switch (card & 3) {
      case 0:
        suit0 |= bit;
        break;
      case 1:
        suit1 |= bit;
        break;
      case 2:
        suit2 |= bit;
        break;
      default:
        suit3 |= bit;
        break;
    }
  }

  // A seven-card hand cannot hold both a flush and quads or a full house: five
  // cards of one suit have five distinct ranks, leaving only two cards to build
  // a triple with, and none to pair alongside it. So the flush branch is final.
  let flushMask = -1;
  if (popcount(suit0) >= 5) flushMask = suit0;
  else if (popcount(suit1) >= 5) flushMask = suit1;
  else if (popcount(suit2) >= 5) flushMask = suit2;
  else if (popcount(suit3) >= 5) flushMask = suit3;

  if (flushMask >= 0) {
    const straightFlushHigh = STRAIGHT_HIGH[flushMask] ?? -1;
    if (straightFlushHigh >= 0) return pack(STRAIGHT_FLUSH, straightFlushHigh);
    const [a, b, c, d, e] = topFive(flushMask);
    return pack(FLUSH, a, b, c, d, e);
  }

  let quadRank = -1;
  let tripsHigh = -1;
  let tripsLow = -1;
  let pairHigh = -1;
  let pairSecond = -1;
  for (let rank = RANK_COUNT - 1; rank >= 0; rank--) {
    const count = rankCounts[rank] ?? 0;
    if (count === 4) quadRank = rank;
    else if (count === 3) {
      if (tripsHigh === -1) tripsHigh = rank;
      else if (tripsLow === -1) tripsLow = rank;
    } else if (count === 2) {
      if (pairHigh === -1) pairHigh = rank;
      else if (pairSecond === -1) pairSecond = rank;
    }
  }

  if (quadRank >= 0) {
    const kicker = topFive(rankMask & ~(1 << quadRank))[0];
    return pack(QUADS, quadRank, kicker);
  }

  if (tripsHigh >= 0 && (tripsLow >= 0 || pairHigh >= 0)) {
    const paired = Math.max(tripsLow, pairHigh);
    return pack(FULL_HOUSE, tripsHigh, paired);
  }

  const straightHigh = STRAIGHT_HIGH[rankMask] ?? -1;
  if (straightHigh >= 0) return pack(STRAIGHT, straightHigh);

  if (tripsHigh >= 0) {
    const [k1, k2] = topFive(rankMask & ~(1 << tripsHigh));
    return pack(TRIPS, tripsHigh, k1, k2);
  }

  if (pairHigh >= 0 && pairSecond >= 0) {
    const kicker = topFive(rankMask & ~(1 << pairHigh) & ~(1 << pairSecond))[0];
    return pack(TWO_PAIR, pairHigh, pairSecond, kicker);
  }

  if (pairHigh >= 0) {
    const [k1, k2, k3] = topFive(rankMask & ~(1 << pairHigh));
    return pack(PAIR, pairHigh, k1, k2, k3);
  }

  const [a, b, c, d, e] = topFive(rankMask);
  return pack(HIGH_CARD, a, b, c, d, e);
}

/** Dispatches on length. Accepts 5, 6 or 7 cards. */
export function evaluateHand(cards: readonly Card[]): HandValue {
  if (cards.length === 5) return evaluate5(cards);
  if (cards.length === 7) return evaluate7(cards);
  if (cards.length === 6) return bestValueOfSubsets(cards);
  throw new RangeError(`evaluateHand needs 5 to 7 cards, got ${cards.length}`);
}

function bestValueOfSubsets(cards: readonly Card[]): HandValue {
  let best = 0 as HandValue;
  const hand: Card[] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            hand[0] = cards[a]!;
            hand[1] = cards[b]!;
            hand[2] = cards[c]!;
            hand[3] = cards[d]!;
            hand[4] = cards[e]!;
            const value = evaluate5(hand);
            if (value > best) best = value;
          }
        }
      }
    }
  }
  return best;
}

/** The five cards that make the hand — for highlighting them in the UI. */
export function bestFive(cards: readonly Card[]): Card[] {
  if (cards.length < 5) throw new RangeError(`bestFive needs at least 5 cards`);
  if (cards.length === 5) return [...cards];
  let best = 0 as HandValue;
  let bestHand: Card[] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const hand = [cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!];
            const value = evaluate5(hand);
            if (value > best) {
              best = value;
              bestHand = hand;
            }
          }
        }
      }
    }
  }
  return bestHand;
}

export function compareHandValues(a: HandValue, b: HandValue): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compares two made hands of 5-7 cards. Returns 0 for an exact tie — chopped
 * pots are common and a near-miss here silently pays the wrong player.
 */
export function compareHands(a: readonly Card[], b: readonly Card[]): -1 | 0 | 1 {
  return compareHandValues(evaluateHand(a), evaluateHand(b));
}

export function handValueToString(value: HandValue): string {
  const { category, ranks } = describeHand(value);
  return `${category} (${ranks.join("")})`;
}
