/**
 * Hand classification — what hero actually HAS, relative to the board.
 *
 * This is not the evaluator. The evaluator answers "who wins at showdown";
 * this answers "what kind of holding is this", which is the axis postflop
 * strategy is authored along. `AhKh` on `Ks 7d 2c` is top pair good kicker
 * whether or not it happens to be winning.
 *
 * Two judgment calls worth knowing about:
 *
 * 1. `set` covers both a set (pocket pair plus a board card) and trips (one
 *    hole card plus a paired board). The class list in the build plan has no
 *    separate `trips`, and for a beginner-facing tool the strategic advice is
 *    close enough that splitting them would add a class nobody could act on.
 *
 * 2. Playing the board — hero's five best cards ARE the board — classifies on
 *    the high-card ladder, not as the board's made hand. Holding 72o on
 *    `Ah Kh Qh Jh Th` is not "a straight flush" in any sense that should drive
 *    a bet: hero can only chop, never win.
 */

import { bestFive, evaluate5, evaluateHand } from "./evaluator";
import { type Card, rankOf, suitOf } from "./cards";

/** Strongest to weakest. The order IS the precedence rule. */
export const HAND_CLASSES = [
  "straight_flush",
  "quads",
  "full_house",
  "flush",
  "straight",
  "set",
  "two_pair",
  "overpair",
  "top_pair_good_kicker",
  "top_pair_weak_kicker",
  "middle_pair",
  "combo_draw",
  "bottom_pair",
  "pocket_pair_below_top",
  "flush_draw",
  "open_ended",
  "ace_high",
  "gutshot",
  "overcards_bdfd",
  "overcards",
  "air",
] as const;

export type HandClass = (typeof HAND_CLASSES)[number];

export const BOARD_TAGS = [
  "dry",
  "wet",
  "paired",
  "monotone",
  "two-tone",
  "rainbow",
  "ace-high",
  "connected",
  "low",
  "broadway",
] as const;

export type BoardTag = (typeof BOARD_TAGS)[number];

const GOOD_KICKER_RANK = 8; // rank index 8 is a ten

function rankCounts(cards: readonly Card[]): number[] {
  const counts = new Array<number>(13).fill(0);
  for (const card of cards) counts[rankOf(card)] = (counts[rankOf(card)] ?? 0) + 1;
  return counts;
}

function suitCounts(cards: readonly Card[]): number[] {
  const counts = new Array<number>(4).fill(0);
  for (const card of cards) counts[suitOf(card)] = (counts[suitOf(card)] ?? 0) + 1;
  return counts;
}

function rankMask(cards: readonly Card[]): number {
  let mask = 0;
  for (const card of cards) mask |= 1 << rankOf(card);
  return mask;
}

/** Distinct board ranks, high to low. */
function boardRanks(board: readonly Card[]): number[] {
  return [...new Set(board.map(rankOf))].sort((a, b) => b - a);
}

/**
 * How many more cards of one suit hero needs. Only counts suits hero actually
 * holds — a four-flush on the board that hero has no card of is not hero's draw.
 */
function flushDrawCount(hole: readonly Card[], board: readonly Card[]): number {
  const all = [...hole, ...board];
  const counts = suitCounts(all);
  let best = 0;
  for (let suit = 0; suit < 4; suit++) {
    if (!hole.some((c) => suitOf(c) === suit)) continue;
    best = Math.max(best, counts[suit] ?? 0);
  }
  return best;
}

const STRAIGHT_WINDOWS: readonly number[] = (() => {
  const windows = [(1 << 12) | (1 << 3) | (1 << 2) | (1 << 1) | 1]; // the wheel
  for (let high = 4; high <= 12; high++) windows.push(0b11111 << (high - 4));
  return windows;
})();

/**
 * The distinct RANKS that would complete a straight. Counting ranks rather
 * than windows is what makes open-ended and double-gutshot come out the same,
 * which is right: both are eight outs and both play the same way.
 */
function completingRanks(mask: number): number[] {
  const outs = new Set<number>();
  for (const window of STRAIGHT_WINDOWS) {
    if (popcount(mask & window) !== 4) continue;
    const missing = window & ~mask;
    outs.add(Math.round(Math.log2(missing)));
  }
  return [...outs];
}

function popcount(mask: number): number {
  let n = mask - ((mask >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

export interface HandClassDetail {
  handClass: HandClass;
  /** Every class the holding satisfies, for debugging an unexpected answer. */
  matched: HandClass[];
  playsTheBoard: boolean;
}

export function classifyHandDetail(
  hole: readonly [Card, Card],
  board: readonly Card[],
): HandClassDetail {
  if (board.length < 3 || board.length > 5) {
    throw new RangeError(`board must be 3 to 5 cards, got ${board.length}`);
  }
  const seen = new Set<number>([...hole, ...board]);
  if (seen.size !== hole.length + board.length) {
    throw new RangeError("the same card appears twice between the hole cards and the board");
  }

  const all = [...hole, ...board];
  const heroValue = evaluateHand(all.length >= 5 ? [...all] : all);
  const boardValue = board.length >= 5 ? evaluate5(bestFive(board)) : null;
  const playsTheBoard = boardValue !== null && heroValue <= boardValue;

  const matched = new Set<HandClass>();
  const category = heroValue >>> 20;

  // Playing the board is air, full stop — including when a hole card happens
  // to pair it. On `Ah Kh Qh Jh Th` holding Ac2c, the ace pairs nothing that
  // matters: hero's five best cards are the board's, so hero can only chop.
  // Reporting "top pair" there would tell a beginner to bet a hand that cannot
  // win a chip.
  if (playsTheBoard) {
    return { handClass: "air", matched: ["air"], playsTheBoard: true };
  }

  // Made hands, but only when hero's cards actually contribute.
  if (!playsTheBoard) {
    if (category === 8) matched.add("straight_flush");
    if (category === 7) matched.add("quads");
    if (category === 6) matched.add("full_house");
    if (category === 5) matched.add("flush");
    if (category === 4) matched.add("straight");
    if (category === 3) matched.add("set");
    if (category === 2) matched.add("two_pair");
  }

  const holeRanks = hole.map(rankOf).sort((a, b) => b - a);
  const ranks = boardRanks(board);
  const topBoard = ranks[0] ?? -1;
  const bottomBoard = ranks[ranks.length - 1] ?? -1;
  const boardCounts = rankCounts(board);
  const isPocketPair = holeRanks[0] === holeRanks[1];

  // Pair-level classes are always relative to the board, never to the
  // evaluator's category — that is the whole point of the taxonomy.
  if (category < 3 || playsTheBoard) {
    if (isPocketPair) {
      const pairRank = holeRanks[0]!;
      if (pairRank > topBoard) matched.add("overpair");
      else if ((boardCounts[pairRank] ?? 0) === 0) matched.add("pocket_pair_below_top");
    }
    for (const rank of holeRanks) {
      if ((boardCounts[rank] ?? 0) === 0) continue;
      if (isPocketPair) continue;
      const kicker = holeRanks.find((r) => r !== rank) ?? -1;
      if (rank === topBoard) {
        matched.add(kicker >= GOOD_KICKER_RANK ? "top_pair_good_kicker" : "top_pair_weak_kicker");
      } else if (rank === bottomBoard) {
        matched.add("bottom_pair");
      } else {
        matched.add("middle_pair");
      }
    }
  }

  // Draws only exist while there is a card to come.
  const drawsLive = board.length < 5;
  const flushCards = flushDrawCount(hole, board);
  const hasFlushDraw = drawsLive && flushCards === 4;
  const hasBackdoorFlush = drawsLive && board.length === 3 && flushCards === 3;

  // Hero must improve the draw. A straight draw sitting on the board alone
  // belongs to everyone, which makes it nobody's holding.
  const heroOuts = drawsLive ? completingRanks(rankMask(all)).length : 0;
  const boardOuts = drawsLive ? completingRanks(rankMask(board)).length : 0;
  const ownOuts = heroOuts > boardOuts ? heroOuts : 0;
  const hasOpenEnded = ownOuts >= 2;
  const hasGutshot = ownOuts === 1;

  if (hasFlushDraw) matched.add("flush_draw");
  if (hasOpenEnded) matched.add("open_ended");
  if (hasGutshot) matched.add("gutshot");

  const hasPair = [...matched].some((c) =>
    (
      [
        "overpair",
        "top_pair_good_kicker",
        "top_pair_weak_kicker",
        "middle_pair",
        "bottom_pair",
        "pocket_pair_below_top",
      ] as HandClass[]
    ).includes(c),
  );

  // A draw plus a pair, or two draws at once. The one exception to
  // made-hands-beat-draws: this outranks bottom pair.
  if ((hasFlushDraw || hasOpenEnded) && (hasPair || (hasFlushDraw && hasOpenEnded))) {
    matched.add("combo_draw");
  }

  // Added unconditionally: these sit at the bottom of HAND_CLASSES, so the
  // ordered scan below only ever surfaces them when nothing better matched.
  const hasAce = holeRanks.includes(12);
  const bothOvercards = !isPocketPair && (holeRanks[1] ?? -1) > topBoard;
  if (hasAce) matched.add("ace_high");
  if (bothOvercards && hasBackdoorFlush) matched.add("overcards_bdfd");
  if (bothOvercards) matched.add("overcards");

  if (matched.size === 0) matched.add("air");

  const handClass = HAND_CLASSES.find((c) => matched.has(c)) ?? "air";
  return {
    handClass,
    matched: HAND_CLASSES.filter((c) => matched.has(c)),
    playsTheBoard,
  };
}

export function classifyHand(hole: readonly [Card, Card], board: readonly Card[]): HandClass {
  return classifyHandDetail(hole, board).handClass;
}

export function handClassRank(handClass: HandClass): number {
  return HAND_CLASSES.indexOf(handClass);
}

/** True for classes that are a made hand rather than a draw or high card. */
export function isMadeHand(handClass: HandClass): boolean {
  return (
    handClassRank(handClass) <= handClassRank("pocket_pair_below_top") && handClass !== "combo_draw"
  );
}

// ── Board texture ─────────────────────────────────────────────────────────────

export function boardTexture(board: readonly Card[]): BoardTag[] {
  if (board.length < 3 || board.length > 5) {
    throw new RangeError(`board must be 3 to 5 cards, got ${board.length}`);
  }
  const tags = new Set<BoardTag>();
  const counts = rankCounts(board);
  const suits = suitCounts(board);
  const ranks = boardRanks(board);
  const top = ranks[0] ?? 0;

  if (counts.some((c) => c >= 2)) tags.add("paired");

  const maxSuit = Math.max(...suits);
  if (maxSuit === board.length) tags.add("monotone");
  else if (maxSuit >= board.length - 1) tags.add("two-tone");
  else tags.add("rainbow");

  if (top === 12) tags.add("ace-high");
  if (ranks.filter((r) => r >= 8).length >= 2) tags.add("broadway");
  if (top <= 7) tags.add("low");

  // Connected means three distinct ranks inside one five-rank window — real
  // straight-making texture. Defining it as "any two ranks close together"
  // makes almost every five-card board connected, which drags every turn and
  // river board into `wet` and empties the tag of meaning.
  let connected = false;
  for (let low = 0; low <= 8 && !connected; low++) {
    const window = 0b11111 << low;
    let inWindow = 0;
    for (const rank of ranks) if ((window >> rank) & 1) inWindow++;
    if (inWindow >= 3) connected = true;
  }
  if (connected) tags.add("connected");

  // Scored rather than boolean: a two-tone board alone is not wet, and a
  // rainbow board with three cards in a row is. A72 two-tone stays dry; 987
  // rainbow does not.
  const wetness =
    (connected ? 2 : 0) + (tags.has("monotone") ? 2 : 0) + (tags.has("two-tone") ? 1 : 0);
  tags.add(wetness >= 2 ? "wet" : "dry");

  return BOARD_TAGS.filter((tag) => tags.has(tag));
}
