/**
 * Repairs the hand-level poker errors in the servable preflop nodes, and
 * re-derives the EV column so the printed bb figures mean something.
 *
 * WHY THIS IS A SCRIPT AND NOT A HAND EDIT
 *
 * The errors are systematic, not scattered: the previous data was produced by a
 * formula keyed on hand strength alone, which is why `AKo` carried the identical
 * EV row (`call -0.65, raise 0.40`) at a button-versus-UTG node and at a
 * big-blind-versus-button node — two spots with completely different pot odds
 * and completely different ranges behind them. Fixing that by hand across 24
 * files is how you get a 25th inconsistency.
 *
 * WHY RANGES ARE WRITTEN IN POKER NOTATION
 *
 * `A2s+, K9o+, 76s` is the form every published chart uses, so a poker player
 * can review this file directly against a source they trust. A scoring function
 * would be shorter and unreviewable — and unreviewable is the property that got
 * the set into this state.
 *
 * Run: npx tsx scripts/repair-preflop.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), "src/content/solutions/preflop");

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
type Rank = (typeof RANKS)[number];

const rankIndex = (r: string): number => RANKS.indexOf(r as Rank);

function combosOf(hand: string): number {
  if (hand.length === 2) return 6;
  return hand.endsWith("s") ? 4 : 12;
}

// ── Range notation ────────────────────────────────────────────────────────────

/** "A2s+" → A2s..AQs; "22+" → 22..AA; "T6s-T4s" → T6s,T5s,T4s. */
function expandTerm(term: string): string[] {
  const t = term.trim();
  if (t === "") return [];

  if (t.includes("-")) {
    const [lo, hi] = t.split("-").map((s) => s.trim());
    if (lo === undefined || hi === undefined) throw new Error(`bad range: ${t}`);
    return expandBetween(lo, hi);
  }

  if (t.endsWith("+")) return expandPlus(t.slice(0, -1));

  return [t];
}

function expandPlus(base: string): string[] {
  if (base.length === 2 && base[0] === base[1]) {
    // "22+" — every pair from that rank up.
    const from = rankIndex(base[0]!);
    return RANKS.slice(0, from + 1).map((r) => `${r}${r}`);
  }

  const high = base[0]!;
  const low = base[1]!;
  const suffix = base.slice(2);
  const out: string[] = [];
  // "K9o+" walks the KICKER up to just below the high card.
  for (let i = rankIndex(low); i > rankIndex(high); i--) {
    out.push(`${high}${RANKS[i]}${suffix}`);
  }
  return out;
}

function expandBetween(loTerm: string, hiTerm: string): string[] {
  // Written high-to-low in poker notation: "A5s-A2s" starts at A5s.
  if (loTerm.length === 2 && loTerm[0] === loTerm[1]) {
    const a = rankIndex(loTerm[0]!);
    const b = rankIndex(hiTerm[0]!);
    const [from, to] = a < b ? [a, b] : [b, a];
    return RANKS.slice(from, to + 1).map((r) => `${r}${r}`);
  }
  const high = loTerm[0]!;
  const suffix = loTerm.slice(2);
  const a = rankIndex(loTerm[1]!);
  const b = rankIndex(hiTerm[1]!);
  const [from, to] = a < b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${high}${RANKS[i]}${suffix}`);
  return out;
}

function parseRange(spec: string): string[] {
  return spec
    .split(",")
    .flatMap(expandTerm)
    .filter((h) => h !== "");
}

// ── The repaired ranges ───────────────────────────────────────────────────────

interface Weighted {
  readonly range: string;
  readonly freq: number;
}

interface NodeSpec {
  readonly ref: string;
  /** Why this node was rewritten. Printed in the report. */
  readonly reason: string;
  readonly raise: readonly Weighted[];
  readonly call: readonly Weighted[];
  /**
   * What the aggressive action is called in the file. vs_4bet nodes shove
   * rather than size-raise; the range notation is the same either way.
   */
  readonly aggressiveAction?: "raise" | "allin";
}

/**
 * The big blind closes the action for 1.5bb into a 4bb pot, so it needs about
 * 27% equity to call — by far the best price anyone at the table gets. Every
 * published solve defends it enormously wide, and the previous data defended
 * 25.6% against a button open where the real figure is around 40%.
 *
 * The file's own note claimed this was "the widest calling range in the set and
 * the one I would defend least". It was the tightest relative to source, which
 * is what an unchecked self-assessment is worth.
 */
const BB_VS_BTN: NodeSpec = {
  ref: "BB:vs_rfi_BTN",
  reason: "defended 25.6% against a button open; published solves are near 40%",
  raise: [
    { range: "JJ+, AKs, AKo", freq: 1 },
    { range: "TT, AQs", freq: 0.6 },
    { range: "AQo, KQs", freq: 0.3 },
    // The standard bluff family: wheel aces block the nutted end of their
    // calling range and make disguised straights when called.
    { range: "A5s-A2s", freq: 0.4 },
    { range: "K6s-K5s, 76s, 65s", freq: 0.25 },
  ],
  call: [
    { range: "99-22", freq: 1 },
    { range: "TT", freq: 0.4 },
    { range: "AQs, AJs-A2s", freq: 1 },
    { range: "AQo, KQs", freq: 0.7 },
    { range: "KJs-K2s", freq: 1 },
    { range: "QTs-Q4s", freq: 1 },
    { range: "JTs-J6s", freq: 1 },
    { range: "T9s-T6s", freq: 1 },
    { range: "98s-95s, 87s-85s, 76s-74s, 65s-63s, 54s-53s, 43s", freq: 1 },
    { range: "AJo-A2o", freq: 1 },
    { range: "KQo-K9o", freq: 1 },
    { range: "QJo-Q9o", freq: 1 },
    { range: "JTo-J9o", freq: 1 },
    { range: "T9o, 98o, 87o", freq: 1 },
  ],
};

const BB_VS_CO: NodeSpec = {
  ref: "BB:vs_rfi_CO",
  reason:
    "defended 29.7% after the first repair; a 28% cutoff open at this price gets defended " +
    "around 36% in published solves",
  raise: [
    { range: "JJ+, AKs, AKo", freq: 1 },
    { range: "TT, AQs", freq: 0.5 },
    { range: "AQo, KQs", freq: 0.25 },
    { range: "A5s-A3s", freq: 0.4 },
    { range: "K6s-K5s", freq: 0.2 },
  ],
  call: [
    { range: "99-22", freq: 1 },
    { range: "TT", freq: 0.5 },
    { range: "AQs, AJs-A2s", freq: 1 },
    { range: "AQo, KQs", freq: 0.75 },
    { range: "KJs-K3s", freq: 1 },
    { range: "QTs-Q4s", freq: 1 },
    { range: "JTs-J5s", freq: 1 },
    { range: "T9s-T5s", freq: 1 },
    { range: "98s-94s, 87s-84s, 76s-74s, 65s-63s, 54s-53s, 43s", freq: 1 },
    { range: "AJo-A4o", freq: 1 },
    { range: "KQo-K9o", freq: 1 },
    { range: "QJo-Q9o", freq: 1 },
    { range: "JTo-J9o, T9o, 98o", freq: 1 },
  ],
};

const BB_VS_MP: NodeSpec = {
  ref: "BB:vs_rfi_MP",
  reason:
    "defended 25.1% after the first repair against a 20% open; published solves sit near 32% " +
    "at this price, the gap being low suited connectors and gappers",
  raise: [
    { range: "QQ+, AKs, AKo", freq: 1 },
    { range: "JJ, AQs", freq: 0.5 },
    { range: "A5s-A4s", freq: 0.35 },
  ],
  call: [
    { range: "TT-22", freq: 1 },
    { range: "JJ", freq: 0.5 },
    { range: "AQs, AJs-A2s", freq: 1 },
    { range: "AQo, KQs", freq: 1 },
    { range: "KJs-K4s", freq: 1 },
    { range: "QTs-Q5s", freq: 1 },
    { range: "JTs-J6s", freq: 1 },
    { range: "T9s-T6s", freq: 1 },
    { range: "98s-95s, 87s-84s, 76s-74s, 65s-63s, 54s-53s, 43s", freq: 1 },
    { range: "AJo-A8o", freq: 1 },
    { range: "KQo-KTo", freq: 1 },
    { range: "QJo-QTo", freq: 1 },
    { range: "JTo, T9o, 98o", freq: 1 },
  ],
};

const BB_VS_UTG: NodeSpec = {
  ref: "BB:vs_rfi_UTG",
  reason:
    "defended 20.3% after the first repair; published BB-vs-UTG defence at this price is ~30%, " +
    "and the missing third was the suited junk that makes the seat live to play against",
  raise: [
    { range: "QQ+, AKs, AKo", freq: 1 },
    { range: "JJ, AQs", freq: 0.4 },
    { range: "A5s-A4s", freq: 0.3 },
  ],
  call: [
    { range: "TT-22", freq: 1 },
    { range: "JJ", freq: 0.6 },
    { range: "AQs, AJs-A2s", freq: 1 },
    { range: "AQo, KQs", freq: 1 },
    { range: "KJs-K5s", freq: 1 },
    { range: "QTs-Q6s", freq: 1 },
    { range: "JTs-J7s", freq: 1 },
    { range: "T9s-T6s", freq: 1 },
    { range: "98s-95s, 87s-85s, 76s-74s, 65s-64s, 54s-53s, 43s", freq: 1 },
    { range: "AJo-A9o", freq: 1 },
    { range: "KQo-KTo", freq: 1 },
    { range: "QJo-QTo", freq: 1 },
    { range: "JTo, T9o", freq: 1 },
  ],
};

/**
 * The small blind opens ~39% and the big blind is in position on it all hand,
 * with the same 1.5bb-into-4bb price. This is the widest defence in the game.
 */
const BB_VS_SB: NodeSpec = {
  ref: "BB:vs_rfi_SB",
  reason:
    "defended 50.1% after the first repair, past the ~45% published figure — the bottom " +
    "offsuit junk (65o, 32s-class hands) does not defend even at this price",
  raise: [
    { range: "TT+, AQs+, AKo", freq: 1 },
    { range: "99, AJs, AQo, KQs", freq: 0.45 },
    { range: "A5s-A2s", freq: 0.4 },
    { range: "K7s-K5s, 87s, 76s, 65s", freq: 0.25 },
  ],
  call: [
    { range: "88-22", freq: 1 },
    { range: "99", freq: 0.55 },
    { range: "AJs, AQo, KQs", freq: 0.55 },
    { range: "ATs-A2s", freq: 1 },
    { range: "KJs-K2s", freq: 1 },
    { range: "QTs-Q3s", freq: 1 },
    { range: "JTs-J5s", freq: 1 },
    { range: "T9s-T5s", freq: 1 },
    { range: "98s-94s, 87s-84s, 76s-74s, 65s-63s, 54s-53s, 43s", freq: 1 },
    { range: "AJo-A3o", freq: 1 },
    { range: "KQo-K8o", freq: 1 },
    { range: "QJo-Q9o", freq: 1 },
    { range: "JTo-J9o", freq: 1 },
    { range: "T9o-T8o, 98o-97o, 87o, 76o", freq: 1 },
  ],
};

/**
 * The button facing an early open.
 *
 * Three errors here, all of them things a player notices in one session:
 * `AKo` folded 30% of the time; `JJ`, `TT` and `AQs` never 3bet, so 3-betting
 * them was graded an inaccuracy costing 1.55bb; and every pair below 77 folded,
 * throwing away the cheapest set-mine in poker — 100bb deep, closing to a
 * single raise, with position for the rest of the hand.
 */
const BTN_VS_UTG: NodeSpec = {
  ref: "BTN:vs_rfi_UTG",
  reason:
    "AKo folded 30%; JJ/TT/AQs never 3bet; every pair below 77 folded in position. Widened " +
    "to ~15% continue in the realism pass with the suited connectors position pays for",
  raise: [
    { range: "QQ+, AKs", freq: 1 },
    { range: "AKo", freq: 0.75 },
    { range: "JJ", freq: 0.5 },
    { range: "TT, AQs", freq: 0.3 },
    { range: "A5s-A4s", freq: 0.35 },
    { range: "KJs", freq: 0.15 },
  ],
  call: [
    { range: "JJ", freq: 0.5 },
    { range: "TT, AQs", freq: 0.7 },
    { range: "AKo", freq: 0.25 },
    { range: "99-22", freq: 1 },
    { range: "AJs-A7s, A5s-A2s", freq: 1 },
    { range: "AQo", freq: 0.75 },
    { range: "KQs-K9s", freq: 1 },
    { range: "KJs", freq: 0.85 },
    { range: "QJs-Q9s, JTs-J9s, T9s-T8s, 98s, 87s, 76s, 65s", freq: 1 },
    { range: "KQo", freq: 0.4 },
    { range: "AJo", freq: 0.5 },
  ],
};

const BTN_VS_MP: NodeSpec = {
  ref: "BTN:vs_rfi_MP",
  reason:
    "same shape as the UTG node — no fold on AKo, a real 3bet frequency, pairs call. " +
    "Widened to ~17% continue in the realism pass",
  raise: [
    { range: "QQ+, AKs, AKo", freq: 1 },
    { range: "JJ", freq: 0.55 },
    { range: "TT, AQs", freq: 0.35 },
    { range: "A5s-A4s", freq: 0.4 },
    { range: "KJs", freq: 0.15 },
  ],
  call: [
    { range: "JJ", freq: 0.45 },
    { range: "TT, AQs", freq: 0.65 },
    { range: "99-22", freq: 1 },
    { range: "AJs-A6s, A5s-A2s", freq: 1 },
    { range: "AQo, AJo", freq: 1 },
    { range: "KQs-K8s", freq: 1 },
    { range: "KJs", freq: 0.85 },
    { range: "QJs-Q8s, JTs-J8s, T9s-T7s, 98s-97s, 87s-86s, 76s, 65s, 54s", freq: 1 },
    { range: "KQo", freq: 0.6 },
    { range: "ATo", freq: 0.5 },
  ],
};

const BTN_VS_CO: NodeSpec = {
  ref: "BTN:vs_rfi_CO",
  reason:
    "the widest button defence — a cutoff opens 28%, and the button has position on all of it",
  raise: [
    { range: "JJ+, AKs, AKo", freq: 1 },
    { range: "TT, AQs", freq: 0.45 },
    { range: "A5s-A3s", freq: 0.4 },
    { range: "KJs-KTs", freq: 0.2 },
  ],
  call: [
    { range: "TT, AQs", freq: 0.55 },
    { range: "99-22", freq: 1 },
    { range: "AJs-A6s, A5s-A2s", freq: 1 },
    { range: "AQo-ATo", freq: 1 },
    { range: "KQs-K8s", freq: 1 },
    { range: "KJs-KTs", freq: 0.8 },
    { range: "QJs-Q8s, JTs-J8s, T9s-T7s, 98s-96s, 87s-86s, 76s-75s, 65s, 54s", freq: 1 },
    { range: "KQo-KJo, QJo", freq: 1 },
  ],
};

/**
 * The cutoff and middle position facing an early open. Same two structural
 * errors as the button — a fold on AKo and no 3bet frequency for the hands
 * directly under the premiums — but tighter, because there are still players
 * behind who have not acted.
 */
const CO_VS_UTG: NodeSpec = {
  ref: "CO:vs_rfi_UTG",
  reason:
    "AKo folded; JJ/TT/AQs pure calls with players still to act behind. Widened to ~11% " +
    "continue in the realism pass, adding the small pairs and suited broadways every chart keeps",
  raise: [
    { range: "QQ+, AKs", freq: 1 },
    { range: "AKo", freq: 0.8 },
    { range: "JJ", freq: 0.45 },
    { range: "AQs", freq: 0.25 },
    { range: "A5s", freq: 0.3 },
  ],
  call: [
    { range: "JJ", freq: 0.55 },
    { range: "AQs", freq: 0.75 },
    { range: "AKo", freq: 0.2 },
    { range: "TT-33", freq: 1 },
    { range: "AJs-A9s, A5s-A4s", freq: 1 },
    { range: "AQo", freq: 0.6 },
    { range: "KQs-KTs, QJs-QTs, JTs, T9s, 98s", freq: 1 },
  ],
};

const CO_VS_MP: NodeSpec = {
  ref: "CO:vs_rfi_MP",
  reason: "AKo folded; JJ/TT/AQs pure calls",
  raise: [
    { range: "QQ+, AKs, AKo", freq: 1 },
    { range: "JJ", freq: 0.5 },
    { range: "TT, AQs", freq: 0.3 },
    { range: "A5s-A4s", freq: 0.35 },
  ],
  call: [
    { range: "JJ", freq: 0.5 },
    { range: "TT, AQs", freq: 0.7 },
    { range: "99-44", freq: 1 },
    { range: "AJs-A9s, A5s-A3s", freq: 1 },
    { range: "AQo, AJo", freq: 1 },
    { range: "KQs-KTs, QJs-QTs, JTs, T9s, 98s", freq: 1 },
  ],
};

const MP_VS_UTG: NodeSpec = {
  ref: "MP:vs_rfi_UTG",
  reason:
    "AKo folded; the tightest defence in the set still cannot fold ace-king. Widened to ~9% " +
    "continue in the realism pass — 7.6% made the seat fold to an open three hands in four",
  raise: [
    { range: "QQ+, AKs", freq: 1 },
    { range: "AKo", freq: 0.8 },
    { range: "JJ", freq: 0.4 },
    { range: "A5s", freq: 0.25 },
  ],
  call: [
    { range: "JJ", freq: 0.6 },
    { range: "AKo", freq: 0.2 },
    { range: "TT-44", freq: 1 },
    { range: "AQs-ATs, A5s", freq: 1 },
    { range: "AQo", freq: 0.5 },
    { range: "KQs-KJs, QJs, JTs, T9s", freq: 1 },
  ],
};

/**
 * The small blind never closes the action — the big blind is always still to
 * act behind — so it defends far tighter than the big blind and leans on the
 * 3bet rather than the call. That asymmetry is the whole lesson of the seat.
 */
const SB_VS_BTN: NodeSpec = {
  ref: "SB:vs_rfi_BTN",
  reason:
    "no fold on AKo; a 3bet-leaning range out of position with the big blind behind. " +
    "Widened to ~16% continue in the realism pass",
  raise: [
    { range: "TT+, AQs+, AKo", freq: 1 },
    { range: "99, AJs, AQo, KQs", freq: 0.5 },
    { range: "A5s-A2s", freq: 0.45 },
    { range: "K9s-K7s, Q9s, 76s, 65s", freq: 0.25 },
  ],
  call: [
    { range: "88-22", freq: 1 },
    { range: "99, AJs, KQs", freq: 0.5 },
    { range: "ATs-A6s", freq: 1 },
    { range: "KJs-KTs, QJs-QTs, JTs-J9s, T9s-T8s, 98s, 87s, 76s, 65s, 54s", freq: 1 },
    { range: "AQo", freq: 0.5 },
    { range: "AJo, ATo, KQo, KJo", freq: 0.5 },
  ],
};

const SB_VS_CO: NodeSpec = {
  ref: "SB:vs_rfi_CO",
  reason: "no fold on AKo; a 3bet-leaning range out of position",
  raise: [
    { range: "JJ+, AQs+, AKo", freq: 1 },
    { range: "TT, AJs, AQo", freq: 0.5 },
    { range: "A5s-A3s", freq: 0.4 },
    { range: "K9s, 76s, 65s", freq: 0.2 },
  ],
  call: [
    { range: "99-22", freq: 1 },
    { range: "TT, AJs", freq: 0.5 },
    { range: "ATs-A7s", freq: 1 },
    { range: "KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s", freq: 1 },
    { range: "AQo", freq: 0.5 },
    { range: "AJo, KQo", freq: 0.4 },
  ],
};

const SB_VS_MP: NodeSpec = {
  ref: "SB:vs_rfi_MP",
  reason:
    "no fold on AKo; tighter again against a 20% open. Widened to ~12% continue in the " +
    "realism pass",
  raise: [
    { range: "JJ+, AQs+, AKo", freq: 1 },
    { range: "TT, AJs", freq: 0.4 },
    { range: "A5s-A4s", freq: 0.35 },
  ],
  call: [
    { range: "99-22", freq: 1 },
    { range: "TT, AJs", freq: 0.6 },
    { range: "ATs-A7s", freq: 1 },
    { range: "KQs-KTs, QJs-QTs, JTs, T9s, 98s", freq: 1 },
    { range: "AQo", freq: 0.6 },
    { range: "KQo", freq: 0.3 },
  ],
};

const SB_VS_UTG: NodeSpec = {
  ref: "SB:vs_rfi_UTG",
  reason:
    "no fold on AKo against the tightest open in the game. Widened to ~11% continue in the " +
    "realism pass — 7.8% folded the seat out of the game entirely",
  raise: [
    { range: "QQ+, AKs, AKo", freq: 1 },
    { range: "JJ, AQs", freq: 0.45 },
    { range: "A5s", freq: 0.3 },
  ],
  call: [
    { range: "TT-33", freq: 1 },
    { range: "JJ, AQs", freq: 0.55 },
    { range: "AJs-A9s", freq: 1 },
    { range: "KQs-KTs, QJs-QTs, JTs, T9s, 98s", freq: 1 },
    { range: "AQo", freq: 0.5 },
  ],
};

/**
 * Facing a 3bet. The hero already opened, so the range here is a subset of
 * their opening range by construction — a check the repair asserts rather than
 * assumes. `AKo` and `JJ` carried a fold frequency in every one of these; at
 * 100bb neither ever folds to a single 3bet.
 */
const CO_VS_3BET_BB: NodeSpec = {
  ref: "CO:vs_3bet_BB",
  reason: "AKo and the pairs under queens carried a fold frequency they should not have",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ, AKs", freq: 0.6 },
    { range: "AKo", freq: 0.55 },
    { range: "A5s-A4s", freq: 0.4 },
  ],
  call: [
    { range: "QQ, AKs", freq: 0.4 },
    { range: "AKo", freq: 0.45 },
    { range: "JJ-88", freq: 1 },
    { range: "AQs-ATs", freq: 1 },
    { range: "KQs-KJs, QJs, JTs, T9s", freq: 1 },
    { range: "AQo", freq: 0.45 },
    { range: "77-66", freq: 0.5 },
  ],
};

const CO_VS_3BET_BTN: NodeSpec = {
  ref: "CO:vs_3bet_BTN",
  reason:
    "a cold 3bet from the button is stronger than a blind's, and the cutoff plays it out of position",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ", freq: 0.55 },
    { range: "AKs", freq: 0.5 },
    { range: "AKo", freq: 0.4 },
    { range: "A5s", freq: 0.3 },
  ],
  call: [
    { range: "QQ", freq: 0.45 },
    { range: "AKs", freq: 0.5 },
    { range: "AKo", freq: 0.6 },
    { range: "JJ-99", freq: 1 },
    { range: "AQs-AJs", freq: 1 },
    { range: "KQs, QJs, JTs", freq: 1 },
    { range: "88-77", freq: 0.5 },
    { range: "AQo", freq: 0.3 },
  ],
};

const SB_VS_3BET_BB: NodeSpec = {
  ref: "SB:vs_3bet_BB",
  reason: "AKo and JJ carried a fold frequency out of position that neither has at 100bb",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ, AKs", freq: 0.6 },
    { range: "AKo", freq: 0.5 },
    { range: "A5s-A4s", freq: 0.35 },
  ],
  call: [
    { range: "QQ, AKs", freq: 0.4 },
    { range: "AKo", freq: 0.5 },
    { range: "JJ-99", freq: 1 },
    { range: "AQs-AJs", freq: 1 },
    { range: "KQs, QJs, JTs", freq: 1 },
    { range: "88-77", freq: 0.45 },
    { range: "AQo", freq: 0.35 },
  ],
};

const UTG_VS_3BET_MP: NodeSpec = {
  ref: "UTG:vs_3bet_MP",
  reason:
    "the tightest opening range in the game, so it continues with the largest fraction of itself",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ", freq: 0.6 },
    { range: "AKs", freq: 0.55 },
    { range: "AKo", freq: 0.45 },
    { range: "A5s", freq: 0.3 },
  ],
  call: [
    { range: "QQ", freq: 0.4 },
    { range: "AKs", freq: 0.45 },
    { range: "AKo", freq: 0.55 },
    { range: "JJ-99", freq: 1 },
    { range: "AQs-AJs", freq: 1 },
    { range: "KQs, QJs, JTs", freq: 1 },
    { range: "88-77", freq: 0.5 },
    { range: "AQo", freq: 0.4 },
  ],
};

/**
 * Button opened ~48% and faces a blind 3bet. In position with the widest
 * opening range, it continues wider than the cutoff — more speculative
 * suited connectors and a thicker 4bet-bluff band.
 */
const BTN_VS_3BET_BB: NodeSpec = {
  ref: "BTN:vs_3bet_BB",
  reason:
    "button opens nearly half the deck, so its continue vs a blind 3bet is wider than the cutoff's",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ, AKs", freq: 0.55 },
    { range: "AKo", freq: 0.5 },
    { range: "A5s-A3s", freq: 0.45 },
    { range: "76s, 65s", freq: 0.25 },
  ],
  call: [
    { range: "QQ, AKs", freq: 0.45 },
    { range: "AKo", freq: 0.5 },
    { range: "JJ-77", freq: 1 },
    { range: "AQs-A9s", freq: 1 },
    { range: "KQs-KTs, QJs-QTs, JTs, T9s, 98s", freq: 1 },
    { range: "AQo-AJo", freq: 0.55 },
    { range: "66-55", freq: 0.55 },
    { range: "KQo", freq: 0.35 },
  ],
};

/** Button vs a small-blind 3bet — tighter than vs BB, still in position. */
const BTN_VS_3BET_SB: NodeSpec = {
  ref: "BTN:vs_3bet_SB",
  reason:
    "a small-blind 3bet is stronger than a big-blind's, so the button continues tighter than vs BB",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ, AKs", freq: 0.6 },
    { range: "AKo", freq: 0.55 },
    { range: "A5s-A4s", freq: 0.4 },
  ],
  call: [
    { range: "QQ, AKs", freq: 0.4 },
    { range: "AKo", freq: 0.45 },
    { range: "JJ-88", freq: 1 },
    { range: "AQs-ATs", freq: 1 },
    { range: "KQs-KJs, QJs, JTs, T9s", freq: 1 },
    { range: "AQo", freq: 0.5 },
    { range: "77-66", freq: 0.5 },
  ],
};

/**
 * MP opened ~20%. Absolute continue is narrower than CO, but as a share of its
 * own open it is denser — fewer junk hands were in the opening range to begin
 * with.
 */
const MP_VS_3BET_BB: NodeSpec = {
  ref: "MP:vs_3bet_BB",
  reason:
    "MP's open is tighter than CO's, so the continue drops the speculative end that only the cutoff had",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ, AKs", freq: 0.65 },
    { range: "AKo", freq: 0.55 },
    { range: "A5s", freq: 0.35 },
  ],
  call: [
    { range: "QQ, AKs", freq: 0.35 },
    { range: "AKo", freq: 0.45 },
    { range: "JJ-99", freq: 1 },
    { range: "AQs-AJs", freq: 1 },
    { range: "KQs, QJs, JTs", freq: 1 },
    { range: "88-77", freq: 0.55 },
    { range: "AQo", freq: 0.4 },
  ],
};

/** Cutoff vs SB 3bet — between CO-vs-BB (wider blind) and CO-vs-BTN (IP cold). */
const CO_VS_3BET_SB: NodeSpec = {
  ref: "CO:vs_3bet_SB",
  reason:
    "SB 3bets tighter than BB and the cutoff is still in position, so the continue sits between the two existing CO templates",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ, AKs", freq: 0.55 },
    { range: "AKo", freq: 0.5 },
    { range: "A5s-A4s", freq: 0.35 },
  ],
  call: [
    { range: "QQ, AKs", freq: 0.45 },
    { range: "AKo", freq: 0.5 },
    { range: "JJ-99", freq: 1 },
    { range: "AQs-ATs", freq: 1 },
    { range: "KQs-KJs, QJs, JTs", freq: 1 },
    { range: "88-77", freq: 0.45 },
    { range: "AQo", freq: 0.4 },
  ],
};

/**
 * Facing a 4bet. Aggressive action is `allin` (shove), not a sized raise.
 * Continuations are tiny — only the top of the prior 3bet range belongs.
 */
const BB_VS_4BET_BTN: NodeSpec = {
  ref: "BB:vs_4bet_BTN",
  reason:
    "button 4bets widest of any seat, so the big blind continues a touch wider than vs a tighter 4bet",
  aggressiveAction: "allin",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ", freq: 0.7 },
    { range: "AKs", freq: 0.65 },
    { range: "AKo", freq: 0.4 },
  ],
  call: [
    { range: "QQ", freq: 0.3 },
    { range: "AKs", freq: 0.35 },
    { range: "AKo", freq: 0.6 },
    { range: "JJ", freq: 0.55 },
    { range: "AQs", freq: 0.4 },
  ],
};

const BB_VS_4BET_CO: NodeSpec = {
  ref: "BB:vs_4bet_CO",
  reason: "a cutoff 4bet is tighter than a button's, so BB folds more of QQ/AK mixes",
  aggressiveAction: "allin",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ", freq: 0.8 },
    { range: "AKs", freq: 0.7 },
    { range: "AKo", freq: 0.35 },
  ],
  call: [
    { range: "QQ", freq: 0.2 },
    { range: "AKs", freq: 0.3 },
    { range: "AKo", freq: 0.65 },
    { range: "JJ", freq: 0.4 },
    { range: "AQs", freq: 0.25 },
  ],
};

const SB_VS_4BET_BTN: NodeSpec = {
  ref: "SB:vs_4bet_BTN",
  reason:
    "SB is out of position for the rest of the hand after calling a 4bet, so it shoves more and flats less than BB",
  aggressiveAction: "allin",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ, AKs", freq: 0.85 },
    { range: "AKo", freq: 0.55 },
  ],
  call: [
    { range: "QQ, AKs", freq: 0.15 },
    { range: "AKo", freq: 0.45 },
    { range: "JJ", freq: 0.35 },
  ],
};

const BTN_VS_4BET_UTG: NodeSpec = {
  ref: "BTN:vs_4bet_UTG",
  reason: "UTG 4bets the tightest range in the tree; the button continues only with premiums",
  aggressiveAction: "allin",
  raise: [
    { range: "AA, KK", freq: 1 },
    { range: "QQ", freq: 0.9 },
    { range: "AKs", freq: 0.75 },
    { range: "AKo", freq: 0.3 },
  ],
  call: [
    { range: "QQ", freq: 0.1 },
    { range: "AKs", freq: 0.25 },
    { range: "AKo", freq: 0.7 },
  ],
};

const SPECS: readonly NodeSpec[] = [
  BB_VS_BTN,
  BB_VS_CO,
  BB_VS_MP,
  BB_VS_UTG,
  BB_VS_SB,
  BTN_VS_UTG,
  BTN_VS_MP,
  BTN_VS_CO,
  CO_VS_UTG,
  CO_VS_MP,
  MP_VS_UTG,
  SB_VS_BTN,
  SB_VS_CO,
  SB_VS_MP,
  SB_VS_UTG,
  CO_VS_3BET_BB,
  CO_VS_3BET_BTN,
  SB_VS_3BET_BB,
  UTG_VS_3BET_MP,
  BTN_VS_3BET_BB,
  BTN_VS_3BET_SB,
  MP_VS_3BET_BB,
  CO_VS_3BET_SB,
  BB_VS_4BET_BTN,
  BB_VS_4BET_CO,
  SB_VS_4BET_BTN,
  BTN_VS_4BET_UTG,
];

// ── Building a strategy ───────────────────────────────────────────────────────

type Strategy = Record<string, Record<string, number>>;

function accumulate(specs: readonly Weighted[], into: Map<string, number>): void {
  for (const { range, freq } of specs) {
    for (const hand of parseRange(range)) {
      into.set(hand, (into.get(hand) ?? 0) + freq);
    }
  }
}

/**
 * Softens the bottom edge of a calling range.
 *
 * A range written as a chart has a hard edge — `J6s` calls every time and `J5s`
 * never does — and that edge is a drawing convention, not a solve. The hands at
 * the boundary are boundary hands PRECISELY because they are indifferent, and
 * an action a solver is indifferent about is one it mixes. So the weakest fifth
 * of the calling range gets a partial frequency, ramped, rather than a cliff.
 *
 * This is not decoration. It is the single most important thing the product
 * teaches — that one hand can have two right answers — and a set of ranges with
 * hard edges has almost nothing to teach it with.
 */
function softenBoundary(call: Map<string, number>, raise: Map<string, number>): void {
  const pureCalls = [...call.keys()]
    .filter((hand) => (call.get(hand) ?? 0) >= 1 && (raise.get(hand) ?? 0) === 0)
    .sort((a, b) => strengthOf(a) - strengthOf(b));

  const total = pureCalls.reduce((sum, hand) => sum + combosOf(hand), 0);
  const band = total * 0.28;

  let seen = 0;
  for (const hand of pureCalls) {
    if (seen >= band) break;
    // 0.4 at the very bottom rising to ~0.9 at the top of the band, in
    // twentieths so the panel prints round percentages.
    const share = seen / band;
    call.set(hand, Math.round((0.4 + share * 0.5) * 20) / 20);
    seen += combosOf(hand);
  }
}

function buildStrategy(spec: NodeSpec, allHands: readonly string[]): Strategy {
  const raise = new Map<string, number>();
  const call = new Map<string, number>();
  accumulate(spec.raise, raise);
  accumulate(spec.call, call);
  softenBoundary(call, raise);

  const aggressive = spec.aggressiveAction ?? "raise";

  const out: Strategy = {};
  for (const hand of allHands) {
    const r = Math.min(1, raise.get(hand) ?? 0);
    const c = Math.min(1 - r, call.get(hand) ?? 0);
    const f = Math.max(0, 1 - r - c);

    const entry: Record<string, number> = {};
    // Rounded to whole percents: the UI prints percentages, and a 0.6499
    // rendering as 65% while the grader reads 0.6499 is a difference nobody can
    // see and everybody has to reason about.
    const round = (n: number): number => Math.round(n * 100) / 100;
    if (round(f) > 0) entry.fold = round(f);
    if (round(c) > 0) entry.call = round(c);
    if (round(r) > 0) entry[aggressive] = round(r);

    // Rounding can leave the three a hundredth short or long.
    const total = Object.values(entry).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 1e-9) {
      const key = Object.entries(entry).sort((a, b) => b[1] - a[1])[0]![0];
      entry[key] = round(entry[key]! + (1 - total));
    }

    out[hand] = entry;
  }
  return out;
}

// ── EV ────────────────────────────────────────────────────────────────────────

// ── Hand strength ─────────────────────────────────────────────────────────────

/**
 * A strength ordering over all 169 hands, used only to rank EVs within a node.
 *
 * Its PRIMARY signal is the opening ranges already in the set: how many of the
 * five opening positions raise this hand. That is real poker knowledge, it is
 * the part of the data with the highest confidence, and it gets the end of the
 * ordering that a rank-arithmetic formula always gets wrong — every such formula
 * scores `72o` above `22`, because it can see the seven and not the pair.
 *
 * Card ranks break ties inside a band, which is where they work fine.
 */
function buildStrengthOrder(): Map<string, number> {
  const positions = ["UTG", "MP", "CO", "BTN", "SB"];
  const openScore = new Map<string, number>();

  for (const position of positions) {
    const file = JSON.parse(readFileSync(resolve(DIR, `${position}.rfi.json`), "utf8")) as NodeFile;
    for (const [hand, mix] of Object.entries(file.strategy)) {
      openScore.set(hand, (openScore.get(hand) ?? 0) + (mix.raise ?? 0));
    }
  }

  const tiebreak = (hand: string): number => {
    const hi = rankIndex(hand[0]!);
    const lo = rankIndex(hand[1]!);
    let score = (12 - hi) * 0.07 + (12 - lo) * 0.045;
    if (hand.length === 2) score += 0.34;
    if (hand.endsWith("s")) score += 0.03;
    if (hand.length === 3 && Math.abs(hi - lo) <= 2) score += 0.02;
    return score;
  };

  const strength = new Map<string, number>();
  for (const hand of openScore.keys()) {
    strength.set(hand, (openScore.get(hand) ?? 0) * 10 + tiebreak(hand));
  }
  return strength;
}

const STRENGTH = buildStrengthOrder();
const strengthOf = (hand: string): number => STRENGTH.get(hand) ?? 0;

// ── EV ────────────────────────────────────────────────────────────────────────

/**
 * The EV column, derived FROM the strategy instead of alongside it.
 *
 * The rule a solve obeys, and the one the old data broke on 68 hands: every
 * action in the mix is worth the same. That is what mixing means — a solver
 * splits a hand precisely because it cannot tell the two apart. When a file
 * says an action is taken 45% of the time AND costs 0.9bb, one of those two
 * numbers is wrong, and the product prints both on the same screen, three
 * inches apart.
 *
 * FOLDING IS PART OF THE MIX. This is what the first version of this function
 * missed. A hand that folds 25% and calls 75% is a hand whose call is worth
 * almost exactly ZERO, because folding is worth zero and the two are
 * indifferent — so a mixed-fold hand cannot also be worth 7bb. Three cases:
 *
 * - Folds sometimes and continues sometimes → every continue is worth ~0.
 * - Never folds → every action in the mix is worth the same POSITIVE amount,
 *   scaled by where the hand sits in the range.
 * - Always folds → continuing loses, by more the weaker the hand.
 */
function deriveEv(
  strategy: Strategy,
  actions: readonly string[],
  maxValue: number,
): Record<string, Record<string, number>> {
  const hands = Object.keys(strategy);

  const foldFreqOf = (hand: string): number => strategy[hand]!.fold ?? 0;
  const pureContinue = hands
    .filter((h) => foldFreqOf(h) === 0)
    .sort((a, b) => strengthOf(b) - strengthOf(a));

  // Where each action's range sits in strength terms, so that "how wrong is
  // this action" is a distance rather than a constant.
  const centroid = new Map<string, number>();
  for (const action of actions) {
    if (action === "fold") continue;
    const played = hands.filter((h) => (strategy[h]![action] ?? 0) > 0);
    centroid.set(
      action,
      played.length === 0 ? 0 : played.reduce((sum, h) => sum + strengthOf(h), 0) / played.length,
    );
  }

  const weakestContinue =
    pureContinue.length === 0 ? 0 : strengthOf(pureContinue[pureContinue.length - 1]!);
  const strongest = Math.max(...hands.map(strengthOf), 1);

  /** Concentrated at the top: only the premiums are worth several blinds. */
  const valueAt = (index: number): number => {
    if (pureContinue.length <= 1) return maxValue;
    const share = (pureContinue.length - 1 - index) / (pureContinue.length - 1);
    return 0.1 + (maxValue - 0.1) * share ** 2.6;
  };
  const valueByHand = new Map(pureContinue.map((hand, i) => [hand, valueAt(i)]));

  /**
   * How badly an action fits this hand, in big blinds.
   *
   * Scaled by what the hand is WORTH, not only by how far it sits from the
   * action's range: taking the wrong line with aces gives up far more than
   * taking it with deuces, because there is more to give up. The first version
   * used distance alone and put calling aces at 0.47bb behind raising them —
   * which then made aces one of the most "instructive" hands in the set,
   * because `instructiveness` reads a narrow EV gap as a close decision.
   */
  const gapFor = (value: number, hand: string, action: string): number => {
    const distance = Math.abs(strengthOf(hand) - (centroid.get(action) ?? 0)) / strongest;
    return Math.min(3.2, Math.max(0.25, 0.25 + value * 0.3 + distance * 1.6));
  };

  const out: Record<string, Record<string, number>> = {};

  for (const hand of hands) {
    const mix = strategy[hand]!;
    const row: Record<string, number> = { fold: 0 };
    const played = actions.filter((a) => a !== "fold" && (mix[a] ?? 0) > 0);

    if (played.length === 0) {
      // Always folds. How far below the bottom of the continuing range it sits
      // is how much continuing costs.
      const deficit = Math.max(0, weakestContinue - strengthOf(hand)) / strongest;
      for (const action of actions) {
        if (action === "fold") continue;
        const loss = -(0.12 + deficit * 2.6 + (action === "raise" ? 0.22 : 0));
        row[action] = Math.max(-3.2, loss);
      }
    } else if ((mix.fold ?? 0) > 0) {
      // Mixes with folding, so continuing is worth EXACTLY what folding is
      // worth: nothing. That is what it means for a hand to be on the boundary
      // of a range, and it is the only value consistent with the strategy —
      // giving the continue a hair more made folding, the MAJORITY action on 43
      // hands, cost 0.02bb, so the file recommended a line it also priced as a
      // small mistake.
      for (const action of actions) {
        if (action === "fold") continue;
        row[action] = (mix[action] ?? 0) > 0 ? 0 : -gapFor(0, hand, action);
      }
    } else {
      const value = valueByHand.get(hand) ?? 0.1;
      for (const action of actions) {
        if (action === "fold") continue;
        // EXACTLY equal, not nearly. `gradeDecision` breaks an EV tie by
        // frequency, so the majority action still comes back as the best one —
        // and a tie makes the minority action cost zero, which is the true
        // answer for a hand a solver genuinely splits. Inventing a hundredth of
        // a blind of separation here is what made 3-betting JJ on the button
        // read as an inaccuracy costing 1.55bb.
        row[action] = (mix[action] ?? 0) > 0 ? value : value - gapFor(value, hand, action);
      }
    }

    out[hand] = round2(row);
  }
  return out;
}

function round2(row: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) out[k] = Math.round(v * 100) / 100;
  return out;
}

// ── Run ───────────────────────────────────────────────────────────────────────

interface NodeFile {
  heroPos: string;
  actionSeq: string;
  actions: string[];
  strategy: Strategy;
  ev: Record<string, Record<string, number>>;
  confidence?: { rangeShape: string; frequencies: string; ev: string; note: string };
  notes?: string;
  [key: string]: unknown;
}

function pathFor(ref: string): string {
  const [pos, seq] = ref.split(":");
  return resolve(DIR, `${pos}.${seq}.json`);
}

function widthOf(strategy: Strategy, key: "continue" | "raise"): number {
  let combos = 0;
  for (const [hand, mix] of Object.entries(strategy)) {
    const weight = key === "raise" ? (mix.raise ?? 0) + (mix.allin ?? 0) : 1 - (mix.fold ?? 0);
    combos += combosOf(hand) * weight;
  }
  return (100 * combos) / 1326;
}

/**
 * The five opening ranges keep their strategies and get a new EV column.
 *
 * The ranges themselves are the strongest part of the set — 14.2% at UTG rising
 * to 48.1% on the button matches every published chart — so there is nothing to
 * repair in them. Their EVs came from the same formula as everything else, and
 * it put `MP:rfi` `A9o` at a NEGATIVE 0.14bb while opening it 40% of the time:
 * an action the file says to take four times in ten and simultaneously says
 * loses money against a free fold.
 */
const EV_ONLY: readonly string[] = ["UTG:rfi", "MP:rfi", "CO:rfi", "BTN:rfi", "SB:rfi"];

function main(): void {
  const rows: string[] = [];

  for (const ref of EV_ONLY) {
    const path = pathFor(ref);
    const file = JSON.parse(readFileSync(path, "utf8")) as NodeFile;
    file.ev = deriveEv(file.strategy, file.actions, 7);
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    rows.push(`${ref.padEnd(20)} strategy unchanged, EV column re-derived`);
  }

  for (const spec of SPECS) {
    const path = pathFor(spec.ref);
    const file = JSON.parse(readFileSync(path, "utf8")) as NodeFile;
    const hands = Object.keys(file.strategy);

    const before = widthOf(file.strategy, "continue");
    const strategy = buildStrategy(spec, hands);
    const after = widthOf(strategy, "continue");

    // What the very best hand in the node is worth. Facing a 3bet the pot is
    // already three times bigger, so the top of the range is worth more; a
    // 4bet pot is larger still.
    const maxValue = spec.ref.includes("vs_4bet") ? 18 : spec.ref.includes("vs_3bet") ? 11 : 7;

    file.strategy = strategy;
    file.ev = deriveEv(strategy, file.actions, maxValue);
    file.confidence = {
      rangeShape: "medium",
      frequencies: "medium",
      ev: "low",
      note:
        `REPAIRED. ${spec.reason}. The range is written in poker notation in ` +
        `scripts/repair-preflop.ts and is reviewable against any published chart. ` +
        `The EV column is DERIVED from the strategy under the indifference rule ` +
        `— actions played at nonzero frequency are worth the same to within a ` +
        `hundredth of a big blind — not measured by a solver. Treat the sign and ` +
        `the ordering as meaningful and the magnitude as approximate.`,
    };

    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    rows.push(
      `${spec.ref.padEnd(20)} continue ${before.toFixed(1).padStart(5)}% → ` +
        `${after.toFixed(1).padStart(5)}%   raise ${widthOf(strategy, "raise").toFixed(1).padStart(4)}%`,
    );
  }

  console.log(rows.join("\n"));
  console.log(`\n${SPECS.length} nodes repaired.`);
}

main();
