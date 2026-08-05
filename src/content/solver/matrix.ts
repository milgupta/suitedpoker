/**
 * The solver scenario matrix — what we actually solve, and why.
 *
 * This is the only step in the pipeline that requires poker judgment. A
 * mistake here produces confident, precise, wrong answers: the solver will
 * happily return a perfect strategy for a spot that never occurs.
 *
 * Two deliberate simplifications are documented rather than hidden:
 *
 * THE BET TREE IS SMALL. Two sizes per street plus all-in. The output is
 * bucketed into ~12 hand classes downstream, so a six-size tree produces
 * precision that the bucketing immediately discards — at roughly ten times the
 * compute. This is a choice, not an oversight.
 *
 * THE FLOP SUBSET IS SMALL. There are exactly 1,755 strategically distinct
 * flops. Solving all of them multiplies compute by ~350x per scenario for a
 * beginner product that teaches board TEXTURE rather than board specifics.
 * Instead each scenario gets a stratified subset chosen to span the texture
 * space in proportion to how often each texture really occurs.
 *
 * Ranges are IMPORTED from the 2.4 preflop solution set, never retyped here,
 * so the two can never drift apart. Each scenario records which node and which
 * action its ranges came from.
 */

import {
  cardsToString,
  createRng,
  type Card,
  FULL_DECK,
  makeCard,
  rankOf,
  suitOf,
} from "@/poker/cards";
import { boardTexture, type BoardTag } from "@/poker/handclass";
import { HAND_KEYS, Range } from "@/poker/range";
import {
  frequencyOf,
  type HeroPosition,
  type PreflopActionName,
  type PreflopNode,
} from "@/poker/solutions";

import { type PreflopAction, type Scenario, type SolveStreet } from "./schema";

// ── Flops ─────────────────────────────────────────────────────────────────────

export interface FlopClass {
  /** One representative flop, e.g. "Ah 7d 2c". */
  board: string;
  cards: readonly Card[];
  /** How many of the 22,100 real flops this isomorphism class stands for. */
  weight: number;
  tags: BoardTag[];
}

/**
 * The 1,755 strategically distinct flops.
 *
 * Two flops are the same problem if one becomes the other by relabelling
 * suits, so `Ah 7d 2c` and `As 7c 2d` are one class. The count is a known
 * quantity — 286 three-rank flops x 5 suit patterns, plus 156 paired x 2, plus
 * 13 trips — which makes it a real check on the canonicalisation rather than a
 * number we merely produced.
 */
const SUIT_PERMUTATIONS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  const permute = (rest: number[], acc: number[]) => {
    if (rest.length === 0) {
      out.push([...acc]);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]!]);
    }
  };
  permute([0, 1, 2, 3], []);
  return out;
})();

export function distinctFlops(): FlopClass[] {
  const classes = new Map<string, { cards: Card[]; weight: number }>();

  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      for (let c = b + 1; c < 52; c++) {
        const flop = [FULL_DECK[a]!, FULL_DECK[b]!, FULL_DECK[c]!];

        // Minimise over all 24 suit relabellings. Relabelling "by order of
        // first appearance" is NOT enough: on a paired flop the two equal-rank
        // cards have no defined order, so 7h7d2h and 7d7h2h canonicalise
        // differently and one class becomes two.
        // Numeric key rather than a string: this loop runs 22,100 x 24 times
        // and building half a million strings here measurably slowed the whole
        // test suite down.
        let bestKey = Infinity;
        let bestCards: Card[] = flop;
        for (const permutation of SUIT_PERMUTATIONS) {
          const x = makeCard(rankOf(flop[0]!), permutation[suitOf(flop[0]!)]!);
          const y = makeCard(rankOf(flop[1]!), permutation[suitOf(flop[1]!)]!);
          const z = makeCard(rankOf(flop[2]!), permutation[suitOf(flop[2]!)]!);
          const hi = x > y ? (x > z ? x : z) : y > z ? y : z;
          const lo = x < y ? (x < z ? x : z) : y < z ? y : z;
          const mid = x + y + z - hi - lo;
          const key = hi * 2704 + mid * 52 + lo;
          if (key < bestKey) {
            bestKey = key;
            bestCards = [hi as Card, mid as Card, lo as Card];
          }
        }

        const existing = classes.get(String(bestKey));
        if (existing === undefined) classes.set(String(bestKey), { cards: bestCards, weight: 1 });
        else existing.weight += 1;
      }
    }
  }

  return [...classes.values()]
    .map(({ cards, weight }) => ({
      board: cardsToString(cards),
      cards,
      weight,
      tags: boardTexture(cards),
    }))
    .sort((x, y) => x.board.localeCompare(y.board));
}

/** The coarse texture stratum a flop belongs to. */
export function flopStratum(flop: FlopClass): string {
  const top = Math.max(...flop.cards.map(rankOf));
  const height = top >= 8 ? "high" : top >= 5 ? "middle" : "low";
  const paired = flop.tags.includes("paired") ? "paired" : "unpaired";
  const suits = flop.tags.includes("monotone")
    ? "monotone"
    : flop.tags.includes("two-tone")
      ? "two-tone"
      : "rainbow";
  const shape = flop.tags.includes("connected") ? "connected" : "disconnected";
  return `${height}/${paired}/${suits}/${shape}`;
}

let flopCache: FlopClass[] | null = null;
function allFlops(): FlopClass[] {
  flopCache ??= distinctFlops();
  return flopCache;
}

/**
 * `n` flops spanning the texture space in proportion to real frequency.
 *
 * Stratified, not sampled at random: random sampling of 5 flops will routinely
 * miss monotone and paired boards entirely, and those are exactly the textures
 * a beginner plays worst. Slots are allocated to strata by largest remainder on
 * real flop frequency, and the representative of each stratum is chosen
 * deterministically so the same `n` always yields the same subset — the solve
 * cache key depends on it.
 */
export function selectFlopSubset(n: number, seed: string | number = "flops"): FlopClass[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be a positive integer, got ${n}`);
  const flops = allFlops();
  const rngForCoverage = createRng(`${String(seed)}:${n}:coverage`);

  // PHASE 1 — coverage. Allocating slots purely in proportion to real
  // frequency collapses a five-flop subset onto the modal texture: every flop
  // comes out high, dry and disconnected, because that is what most flops are.
  // Monotone and paired boards then never get solved, and those are exactly
  // the textures a beginner plays worst. So take the tags first, greedily,
  // preferring the most common flop that adds new coverage.
  const chosen: FlopClass[] = [];
  const takenBoards = new Set<string>();
  const coveredTags = new Set<BoardTag>();
  const allTags = new Set<BoardTag>(flops.flatMap((f) => f.tags));

  while (chosen.length < n && coveredTags.size < allTags.size) {
    let best: FlopClass | null = null;
    let bestGain = 0;
    let bestWeight = -1;
    for (const flop of flops) {
      if (takenBoards.has(flop.board)) continue;
      let gain = 0;
      for (const tag of flop.tags) if (!coveredTags.has(tag)) gain++;
      if (gain === 0) continue;
      // Jitter the weight comparison so different scenarios pick different
      // representatives of the same texture while still covering everything.
      const weight = flop.weight * (1 + rngForCoverage() * 0.001);
      if (gain > bestGain || (gain === bestGain && weight > bestWeight)) {
        best = flop;
        bestGain = gain;
        bestWeight = weight;
      }
    }
    if (best === null) break;
    chosen.push(best);
    takenBoards.add(best.board);
    for (const tag of best.tags) coveredTags.add(tag);
  }

  if (chosen.length >= n) return chosen.slice(0, n);

  // PHASE 2 — fill the remaining slots in proportion to real frequency.
  const remainingSlots = n - chosen.length;
  const strata = new Map<string, FlopClass[]>();
  for (const flop of flops) {
    if (takenBoards.has(flop.board)) continue;
    const key = flopStratum(flop);
    const bucket = strata.get(key);
    if (bucket === undefined) strata.set(key, [flop]);
    else bucket.push(flop);
  }

  const pool = flops.filter((f) => !takenBoards.has(f.board));
  const totalWeight = pool.reduce((sum, f) => sum + f.weight, 0);
  const entries = [...strata.entries()]
    .map(([key, members]) => ({
      key,
      members,
      weight: members.reduce((sum, f) => sum + f.weight, 0),
    }))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

  // Largest-remainder allocation, so small-but-real strata are not rounded away.
  const exact = entries.map((entry) => (entry.weight / totalWeight) * remainingSlots);
  const slots = exact.map(Math.floor);
  let remaining = remainingSlots - slots.reduce((sum, s) => sum + s, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    slots[index] = (slots[index] ?? 0) + 1;
    remaining -= 1;
  }

  const rng = createRng(`${String(seed)}:${n}`);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const take = slots[i] ?? 0;
    if (take === 0) continue;
    // Heaviest members first, then a deterministic offset so repeated draws
    // from one stratum are not all the same shape.
    const ordered = [...entry.members].sort(
      (a, b) => b.weight - a.weight || a.board.localeCompare(b.board),
    );
    const offset = Math.floor(rng() * ordered.length);
    for (let k = 0; k < take && k < ordered.length; k++) {
      const candidate = ordered[(offset + k * 7) % ordered.length]!;
      if (takenBoards.has(candidate.board)) continue;
      takenBoards.add(candidate.board);
      chosen.push(candidate);
    }
  }
  return chosen.slice(0, n);
}

/**
 * Turn and river cards, alternating a blank and a scare card rather than
 * sampling. A randomly drawn turn is a blank most of the time, and "what to do
 * when the flush comes in" is precisely the lesson a beginner needs.
 */
function extendBoard(flop: FlopClass, street: SolveStreet, index: number): string {
  if (street === "flop") return flop.board;
  const used = new Set<number>(flop.cards);
  const flopSuits = new Set(flop.cards.map(suitOf));
  const flopRanks = new Set(flop.cards.map(rankOf));

  const pickScare = (): Card => {
    // A card that completes a flush draw or brings a broadway overcard.
    for (const suit of flopSuits) {
      for (let rank = 12; rank >= 8; rank--) {
        const card = makeCard(rank, suit);
        if (!used.has(card)) return card;
      }
    }
    throw new Error("no scare card available");
  };
  const pickBlank = (): Card => {
    for (let rank = 0; rank <= 5; rank++) {
      for (let suit = 0; suit < 4; suit++) {
        if (flopSuits.has(suit)) continue;
        const card = makeCard(rank, suit);
        if (!used.has(card) && !flopRanks.has(rank)) return card;
      }
    }
    throw new Error("no blank card available");
  };

  const board = [...flop.cards];
  const turn = index % 2 === 0 ? pickBlank() : pickScare();
  board.push(turn);
  used.add(turn);
  if (street === "river") {
    const river = index % 2 === 0 ? pickScare() : pickBlank();
    board.push(river);
  }
  return cardsToString(board);
}

// ── Ranges, imported from the 2.4 solution set ────────────────────────────────

export interface RangeRef {
  nodeRef: string;
  action: PreflopActionName;
}

/**
 * Rebuilds a range from a solution node's own frequencies. This is the reason
 * the matrix cannot drift from the preflop set: nothing is retyped.
 */
export function rangeFromNode(node: PreflopNode, action: PreflopActionName): Range {
  return Range.fromWeights(
    HAND_KEYS.map((key) => [key, frequencyOf(node, key, action)] as const).filter(
      ([, weight]) => weight > 0,
    ),
  );
}

// ── Scenario specs ────────────────────────────────────────────────────────────

const DEFAULT_BET_TREE = {
  flop: [0.33, 0.75],
  turn: [0.5, 1],
  river: [0.5, 1.25],
  raiseSizes: [2.5],
  allowAllIn: true,
};

/** Standard online cash rake. Stated explicitly, never zero. */
const RAKE = { percent: 0.05, capBb: 3 };

const ACCURACY_TARGET_PCT_POT = 0.3;
const EFF_STACK_BB = 100;
const FLOPS_PER_SCENARIO = 5;

interface Matchup {
  opener: HeroPosition;
  responder: HeroPosition;
  potType: "srp" | "3bet";
  openTo: number;
  threeBetTo?: number;
  rationale: string;
}

const MATCHUPS: Matchup[] = [
  {
    opener: "BTN",
    responder: "BB",
    potType: "srp",
    openTo: 2.5,
    rationale:
      "The single most common postflop configuration in 6-max. The button's range is at its widest and the big blind's is at its most defensive, so the two ranges are maximally asymmetric",
  },
  {
    opener: "CO",
    responder: "BTN",
    potType: "srp",
    openTo: 2.5,
    rationale:
      "The most common in-position cold call. Both ranges are strong and the caller has position, which inverts the usual c-bet advice",
  },
  {
    opener: "CO",
    responder: "BB",
    potType: "srp",
    openTo: 2.5,
    rationale:
      "Blind defense against a late-position open that is tighter than the button's — the correct defending range differs enough from the button case to need its own solve",
  },
  {
    opener: "UTG",
    responder: "BB",
    potType: "srp",
    openTo: 2.5,
    rationale:
      "The tightest opening range a beginner faces. Under-defending here is cheap; over-defending is expensive, and beginners do both",
  },
  {
    opener: "MP",
    responder: "BB",
    potType: "srp",
    openTo: 2.5,
    rationale:
      "Middle position sits between the UTG and CO cases and beginners tend to treat all three identically",
  },
  {
    opener: "SB",
    responder: "BB",
    potType: "srp",
    openTo: 3,
    rationale:
      "Blind versus blind. Both players are wide, both are near-capped, and it is the highest-variance spot a beginner plays regularly",
  },
  {
    opener: "BTN",
    responder: "SB",
    potType: "srp",
    openTo: 2.5,
    rationale:
      "The small blind defends out of position against the widest opening range, with the big blind still to act preflop",
  },
  {
    opener: "BTN",
    responder: "BB",
    potType: "3bet",
    openTo: 2.5,
    threeBetTo: 11,
    rationale:
      "The most common 3-bet pot. The 3-bettor is out of position with a polarised range against a wide caller",
  },
  {
    opener: "CO",
    responder: "BTN",
    potType: "3bet",
    openTo: 2.5,
    threeBetTo: 8,
    rationale:
      "3-bet pot with the 3-bettor IN position — the strategy inverts almost entirely from the out-of-position case",
  },
  {
    opener: "BTN",
    responder: "SB",
    potType: "3bet",
    openTo: 2.5,
    threeBetTo: 11,
    rationale:
      "Small blind 3-bets the button. Out of position against a caller who has position for the rest of the hand",
  },
  {
    opener: "CO",
    responder: "BB",
    potType: "3bet",
    openTo: 2.5,
    threeBetTo: 11,
    rationale:
      "3-betting a late-position opener from the big blind, where the opener's continuing range is stronger than against a button open",
  },
  {
    opener: "UTG",
    responder: "CO",
    potType: "3bet",
    openTo: 2.5,
    threeBetTo: 8,
    rationale:
      "3-betting the tightest opening range. Both ranges are narrow and strong, which makes this the highest-stakes error a beginner can make preflop",
  },
  {
    opener: "MP",
    responder: "BB",
    potType: "3bet",
    openTo: 2.5,
    threeBetTo: 11,
    rationale:
      "Completes the 3-bet coverage across opener positions so the templates are not all derived from button opens",
  },
];

/** Which streets each matchup gets solved on, and from whose seat. */
const STREET_PLAN: Array<{ street: SolveStreet; heroIsOpener: boolean }> = [
  { street: "flop", heroIsOpener: true },
  { street: "flop", heroIsOpener: false },
  { street: "turn", heroIsOpener: true },
  { street: "turn", heroIsOpener: false },
];

function actionHistoryFor(matchup: Matchup): { history: PreflopAction[]; potBb: number } {
  const { opener, responder, potType, openTo, threeBetTo } = matchup;
  const history: PreflopAction[] = [];
  const commit = (actor: HeroPosition, action: PreflopAction["action"], toBb: number) => {
    history.push({ actor, action, toBb });
  };

  commit("SB", "post", 0.5);
  commit("BB", "post", 1);
  commit(opener, "raise", openTo);

  if (potType === "srp") {
    commit(responder, "call", openTo);
  } else {
    const threeBet = threeBetTo ?? 11;
    commit(responder, "raise", threeBet);
    commit(opener, "call", threeBet);
  }

  const committed = new Map<string, number>();
  for (const action of history) committed.set(action.actor, action.toBb);
  const potBb = [...committed.values()].reduce((sum, bb) => sum + bb, 0);
  return { history, potBb };
}

function rangeRefsFor(matchup: Matchup): { opener: RangeRef; responder: RangeRef } {
  const { opener, responder, potType } = matchup;
  if (potType === "srp") {
    return {
      opener: { nodeRef: `${opener}:rfi`, action: "raise" },
      responder: { nodeRef: `${responder}:vs_rfi_${opener}`, action: "call" },
    };
  }
  return {
    opener: { nodeRef: `${opener}:vs_3bet_${responder}`, action: "call" },
    responder: { nodeRef: `${responder}:vs_rfi_${opener}`, action: "raise" },
  };
}

export interface MatrixOptions {
  flopsPerScenario?: number;
  betTree?: typeof DEFAULT_BET_TREE;
}

/**
 * Builds the matrix from the loaded 2.4 solution set. Takes the data as an
 * argument rather than reading it, so this stays pure and testable and the
 * ranges provably come from the shipped solution files.
 */
export function buildMatrix(
  nodes: readonly PreflopNode[],
  options: MatrixOptions = {},
): Scenario[] {
  const byRef = new Map(nodes.map((node) => [node.ref, node]));
  const flopsPerScenario = options.flopsPerScenario ?? FLOPS_PER_SCENARIO;
  const betTree = options.betTree ?? DEFAULT_BET_TREE;

  const nodeFor = (ref: string): PreflopNode => {
    const node = byRef.get(ref);
    if (node === undefined) {
      throw new Error(`the matrix references solution node ${ref}, which does not exist`);
    }
    return node;
  };

  const scenarios: Scenario[] = [];
  let index = 0;

  for (const matchup of MATCHUPS) {
    const { history, potBb } = actionHistoryFor(matchup);
    const refs = rangeRefsFor(matchup);
    const openerRange = rangeFromNode(nodeFor(refs.opener.nodeRef), refs.opener.action);
    const responderRange = rangeFromNode(nodeFor(refs.responder.nodeRef), refs.responder.action);

    for (const { street, heroIsOpener } of STREET_PLAN) {
      // The 3-bet turn nodes for the caller are dropped: at 100bb the stack-to-
      // pot ratio is low enough that turn play is near-trivial, and the slots
      // are better spent on single-raised pots that occur far more often.
      if (matchup.potType === "3bet" && street === "turn" && !heroIsOpener) continue;

      const heroPos = heroIsOpener ? matchup.opener : matchup.responder;
      const villainPos = heroIsOpener ? matchup.responder : matchup.opener;
      const heroRef = heroIsOpener ? refs.opener : refs.responder;
      const villainRef = heroIsOpener ? refs.responder : refs.opener;
      const heroRange = heroIsOpener ? openerRange : responderRange;
      const villainRange = heroIsOpener ? responderRange : openerRange;

      const role =
        matchup.potType === "srp"
          ? heroIsOpener
            ? "as the preflop raiser"
            : "as the caller"
          : heroIsOpener
            ? "as the player who called the 3-bet"
            : "as the 3-bettor";

      const flops = selectFlopSubset(
        flopsPerScenario,
        `${matchup.opener}-${matchup.responder}-${street}`,
      );
      const boards = flops.map((flop, i) => extendBoard(flop, street, index + i));

      scenarios.push({
        id: `${matchup.potType}-${matchup.opener.toLowerCase()}-vs-${matchup.responder.toLowerCase()}-${street}-${heroIsOpener ? "pfr" : "caller"}`,
        label: `${matchup.potType === "srp" ? "Single-raised pot" : "3-bet pot"}: ${matchup.opener} vs ${matchup.responder}, ${street}, hero ${role}`,
        rationale: `${matchup.rationale}. Solved on the ${street} with hero ${role}.`,
        tableSize: 6,
        effStackBb: EFF_STACK_BB - potBb / 2,
        potType: matchup.potType,
        heroPos,
        villainPos,
        street,
        actionHistory: history,
        potBb,
        heroRange: heroRange.toNotation(),
        villainRange: villainRange.toNotation(),
        heroRangeRef: `${heroRef.nodeRef}#${heroRef.action}`,
        villainRangeRef: `${villainRef.nodeRef}#${villainRef.action}`,
        boards,
        betTree,
        rake: RAKE,
        accuracyTargetPctPot: ACCURACY_TARGET_PCT_POT,
      });
      index += flopsPerScenario;
    }
  }

  return scenarios;
}

/** Texture coverage of a set of boards, for the report the plan asks for. */
export function textureCoverage(boards: readonly string[]): Map<BoardTag, number> {
  const counts = new Map<BoardTag, number>();
  for (const board of boards) {
    const cards = board
      .trim()
      .split(/\s+/)
      .map((text) => {
        const ranks = "23456789TJQKA";
        const suits = "cdhs";
        return makeCard(
          ranks.indexOf(text[0]!.toUpperCase()),
          suits.indexOf(text[1]!.toLowerCase()),
        );
      });
    for (const tag of boardTexture(cards.slice(0, 3))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}
