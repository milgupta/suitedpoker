/**
 * The drill spot generator.
 *
 * ⚠️ THE SECURITY BOUNDARY LIVES HERE. `Spot` is the server's view and carries
 * `nodeRef` and `handKey`, which are enough to look the answer up. `ClientSpot`
 * is what may be serialised to a browser, and it carries neither — nor the
 * strategy, the EV table, or the best action. If the answer reaches the client
 * before the user acts, the product has no value.
 *
 * The boundary is enforced three ways: `ClientSpot` is built by omission rather
 * than by listing, a compile-time assertion below fails the build if a
 * forbidden key ever appears on it, and the test suite JSON-stringifies real
 * spots and greps for solution values.
 */

import { type Card, cardsToString, createRng, type Rng, randomInt } from "./cards";
import { classifyHand, type HandClass } from "./handclass";
import { type Combo, combosOf, type HandKey, HAND_KEYS, Range, randomHandFromRange } from "./range";
import {
  type PostflopActionName,
  type PostflopTemplate,
  type PreflopActionName,
  type PreflopNode,
  frequencyOf,
  getPostflopStrategy,
  getStrategy,
  type HeroPosition,
  evOf,
} from "./solutions";

export type SpotType = "preflop" | "postflop";

export interface SpotConfig {
  type: SpotType;
  /** 1 (easiest) to 10. The generator targets it; it cannot always hit it. */
  difficulty?: number;
  tags?: string[];
  heroPos?: HeroPosition;
  actionSeq?: string;
  templateId?: string;
  /** Node refs already shown this session, so a user never repeats a spot. */
  excludeNodeRefs?: string[];
  /**
   * Deal this exact hand rather than sampling for one.
   *
   * The sampler is right for drills: a spot the user cannot predict is the
   * whole point. It is wrong when the CALLER has already decided which hands
   * qualify — the demo hand needs a genuinely mixed strategy, and mixed hands
   * are only 2-4% of an RFI node, so sampling and retrying found one about
   * half the time and 503'd the rest.
   *
   * Server-side only. Nothing reachable from a request body sets it.
   */
  forceHandKey?: HandKey;
}

export interface SeatView {
  seat: number;
  position: HeroPosition;
  stackBb: number;
  isHero: boolean;
}

/** The server's view. Never serialise this to a browser — use `toClientSpot`. */
export interface Spot {
  readonly id: string;
  readonly seed: string;
  readonly type: SpotType;
  readonly nodeRef: string;
  readonly handKey: HandKey;
  readonly handClass: HandClass | null;
  readonly heroPos: HeroPosition;
  readonly heroCards: readonly Card[];
  readonly board: readonly Card[];
  readonly potBb: number;
  readonly effStackBb: number;
  readonly actionHistory: readonly string[];
  readonly legalActions: readonly string[];
  readonly seats: readonly SeatView[];
  readonly difficulty: number;
}

/**
 * Everything the client is allowed to see. Derived by omission so that adding
 * a field to `Spot` cannot silently add it here.
 */
export type ClientSpot = Omit<Spot, "nodeRef" | "handKey" | "handClass" | "seed">;

/**
 * Keys that must never exist on anything sent to a browser.
 *
 * `seed` is on this list even though §2.6 lists it on Spot: the seed fully
 * determines which node was chosen, so a client holding the seed and a scraped
 * copy of the solution set can rederive the answer without ever seeing it.
 * The server keeps the seed and maps `id` back to the spot.
 */
type ForbiddenOnClient =
  | "seed"
  | "nodeRef"
  | "handKey"
  | "handClass"
  | "strategy"
  | "ev"
  | "bestAction"
  | "frequencies"
  | "evLoss"
  | "solution";

type NoSolutionData<T> = Extract<keyof T, ForbiddenOnClient> extends never ? T : never;

// Compile-time guard: if ClientSpot ever gains a forbidden key, NoSolutionData
// resolves to `never` and this line stops compiling. `npm run typecheck` is
// therefore part of the security boundary, not just a style gate.
type ClientSpotIsClean = NoSolutionData<ClientSpot>;
const _clientSpotIsClean: ClientSpotIsClean | null = null;
void _clientSpotIsClean;

export function toClientSpot(spot: Spot): ClientSpot {
  const {
    nodeRef: _nodeRef,
    handKey: _handKey,
    handClass: _handClass,
    seed: _seed,
    ...client
  } = spot;
  return client;
}

/**
 * An opaque, deterministic spot id. It has to be stable so a server can look
 * the spot back up, and opaque so it cannot carry the node reference — an id
 * of `BTN:rfi#seed` would hand the client the answer in the one field nobody
 * thinks to check.
 */
function spotId(nodeRef: string, seed: string): string {
  let hash = 0x811c9dc5;
  const text = `${nodeRef}#${seed}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

// ── Instructiveness ───────────────────────────────────────────────────────────

/** Shannon entropy of a strategy, normalised to [0,1]. */
export function strategyEntropy(frequencies: readonly number[]): number {
  const live = frequencies.filter((f) => f > 0);
  if (live.length <= 1) return 0;
  let entropy = 0;
  for (const f of live) entropy -= f * Math.log2(f);
  return entropy / Math.log2(live.length);
}

/**
 * How much a hand teaches, in [0, ~1.6].
 *
 * Two terms:
 *
 * - MIXING (weight 1.0). A hand a solver mixes is where a beginner's intuition
 *   is most likely to be wrong, and it is the only place the "poker is a
 *   distribution" lesson can land at all.
 * - CLOSENESS TO THE DECISION BOUNDARY (weight 0.6, SQUARED). A hand whose
 *   best and second-best action are nearly equal in EV is a hand a beginner
 *   can plausibly get wrong. Squared because the linear form left AA at only
 *   20% below uniform, which is not "almost never" by any reading.
 *
 * NOTE — this inverts the build plan's wording, deliberately. §2.6 says to
 * favour "hands with high EV loss for the wrong action", but the same sentence
 * says AA teaches nothing, and AA has the highest EV loss for the wrong action
 * in the entire game: folding it costs about 5.5bb. Implemented literally, the
 * rule makes AA maximally instructive. What actually makes a hand worth
 * drilling is that the wrong action is TEMPTING, and temptation lives at the
 * boundary where the EV gap is small. Measured that way AA scores near zero,
 * which is what the plan asks for.
 */
export function instructiveness(handKey: HandKey, node: PreflopNode): number {
  const strategy = getStrategy(node, handKey);
  const frequencies = node.actions.map((action) => strategy[action] ?? 0);
  const mixing = strategyEntropy(frequencies);
  const closeness = 1 / (1 + evGapOf(node, handKey));
  return mixing * 1.0 + closeness * closeness * 0.6;
}

/**
 * Difficulty 1-10. Mixing dominates, because a mixed spot is genuinely hard
 * even when the pot is small, and a close EV gap makes it harder still.
 */
export function difficultyOf(options: {
  entropy: number;
  evGap: number;
  street: "preflop" | "flop" | "turn" | "river";
  classAmbiguity: number;
}): number {
  const streetWeight = { preflop: 0, flop: 0.8, turn: 1.4, river: 2 }[options.street];
  // A small gap between the best and second-best action is what makes a spot
  // genuinely close, so it scales inversely.
  const closeness = 1 / (1 + options.evGap);
  const raw =
    1 + options.entropy * 5.0 + closeness * 2.2 + streetWeight + options.classAmbiguity * 0.8;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

function evGapOf(node: PreflopNode, handKey: HandKey): number {
  const evs = node.actions.map((action) => evOf(node, handKey, action)).sort((a, b) => b - a);
  return (evs[0] ?? 0) - (evs[1] ?? 0);
}

// ── Node selection ────────────────────────────────────────────────────────────

export function tagsForNode(node: PreflopNode): string[] {
  const tags = ["preflop"];
  if (node.actionSeq === "rfi") tags.push("rfi", "open");
  else if (node.actionSeq.startsWith("vs_rfi_")) tags.push("vs-open", "defense");
  else if (node.actionSeq.startsWith("vs_3bet_")) tags.push("3bet");
  else if (node.actionSeq.startsWith("vs_4bet_")) tags.push("4bet");
  if (node.heroPos === "SB" || node.heroPos === "BB") tags.push("blind-defense");
  return tags;
}

function matchesConfig(node: PreflopNode, config: SpotConfig): boolean {
  if (config.heroPos !== undefined && node.heroPos !== config.heroPos) return false;
  if (config.actionSeq !== undefined && node.actionSeq !== config.actionSeq) return false;
  if (config.excludeNodeRefs?.includes(node.ref) === true) return false;
  if (config.tags !== undefined && config.tags.length > 0) {
    const tags = tagsForNode(node);
    if (!config.tags.some((tag) => tags.includes(tag))) return false;
  }
  return true;
}

const POSITION_STACKS: readonly HeroPosition[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

function seatsFor(heroPos: HeroPosition, effStackBb: number): SeatView[] {
  return POSITION_STACKS.map((position, seat) => ({
    seat,
    position,
    stackBb: effStackBb,
    isHero: position === heroPos,
  }));
}

function actionHistoryFor(node: PreflopNode): string[] {
  if (node.actionSeq === "rfi") return ["folded to hero"];
  const opponent = node.actionSeq.split("_").pop() ?? "";
  if (node.actionSeq.startsWith("vs_rfi_")) return [`${opponent} opens 2.5bb`];
  if (node.actionSeq.startsWith("vs_3bet_")) {
    return [`${node.heroPos} opens 2.5bb`, `${opponent} 3bets to 11bb`];
  }
  return [`${opponent} opens 2.5bb`, `${node.heroPos} 3bets to 11bb`, `${opponent} 4bets to 22bb`];
}

export interface SolutionData {
  preflop: readonly PreflopNode[];
  postflop: readonly PostflopTemplate[];
}

const MAX_RESAMPLES = 60;

function pick<T>(items: readonly T[], rng: Rng): T {
  const item = items[randomInt(rng, items.length)];
  if (item === undefined) throw new RangeError("cannot pick from an empty list");
  return item;
}

function comboFor(handKey: HandKey, dead: readonly Card[], rng: Rng): Combo {
  const live = combosOf(handKey).filter((c) => !dead.includes(c[0]) && !dead.includes(c[1]));
  if (live.length === 0) throw new Error(`every combo of ${handKey} is blocked`);
  return pick(live, rng);
}

/**
 * The hands the hero can actually be holding at this node.
 *
 * A `vs_3bet` node means the hero OPENED and was raised, so the hand has to be
 * one the hero opens. Sampling across all 169 dealt spots that cannot exist —
 * "you opened 2.5bb from UTG with 72o and the big blind 3bet you" — to a user
 * being taught opening ranges by the same product, twenty minutes after being
 * told UTG folds 72o. That is not a rounding error in a frequency, it is the
 * table describing an impossible hand, and it discredits every correct number
 * next to it.
 *
 * `null` means every hand is reachable: at an `rfi` node the hero has not acted,
 * and at `vs_rfi` they are yet to act for the first time.
 */
export function reachableHands(node: PreflopNode, data: SolutionData): ReadonlySet<HandKey> | null {
  if (!node.actionSeq.startsWith("vs_3bet_")) return null;

  const open = data.preflop.find((n) => n.heroPos === node.heroPos && n.actionSeq === "rfi");
  if (open === undefined) return null;

  const keys = HAND_KEYS.filter((key) => frequencyOf(open, key, "raise") > 0);
  // An empty set would make the node undealable; a missing opening range is a
  // data problem to surface elsewhere, not a reason to deal nothing here.
  return keys.length === 0 ? null : new Set(keys);
}

/** Weighted sample of a hand key by instructiveness. */
function sampleInstructiveHand(
  node: PreflopNode,
  rng: Rng,
  reachable: ReadonlySet<HandKey> | null,
): HandKey {
  const pool = reachable === null ? HAND_KEYS : HAND_KEYS.filter((key) => reachable.has(key));
  const weights: Array<{ key: HandKey; weight: number }> = [];
  let total = 0;
  for (const key of pool) {
    // A flat floor so no hand is unreachable — folding correctly is a skill
    // too. Deliberately NOT larger for hands the node plays: that variant gave
    // AA a bigger floor than trash and undid the instructiveness weighting.
    const weight = instructiveness(key, node) + 0.01;
    weights.push({ key, weight });
    total += weight;
  }
  let target = rng() * total;
  for (const { key, weight } of weights) {
    target -= weight;
    if (target < 0) return key;
  }
  return weights[weights.length - 1]?.key ?? "AA";
}

// ── Generation ────────────────────────────────────────────────────────────────

export function generateSpot(config: SpotConfig, data: SolutionData, seed: number | string): Spot {
  const seedText = String(seed);
  const rng = createRng(seedText);
  return config.type === "preflop"
    ? generatePreflop(config, data, rng, seedText)
    : generatePostflop(config, data, rng, seedText);
}

function generatePreflop(config: SpotConfig, data: SolutionData, rng: Rng, seed: string): Spot {
  const candidates = data.preflop.filter((node) => matchesConfig(node, config));
  if (candidates.length === 0) {
    throw new Error(
      `no preflop node matches ${JSON.stringify({ ...config, excludeNodeRefs: undefined })}`,
    );
  }
  const node = pick(candidates, rng);

  // Draw a few candidate hands and keep the one closest to the requested
  // difficulty. Sampling once and hoping would make `difficulty` decorative.
  const target = config.difficulty;
  let best: { handKey: HandKey; difficulty: number } | null = null;
  const forced = config.forceHandKey;
  const draws = forced !== undefined ? 0 : target === undefined ? 1 : 12;

  if (forced !== undefined) {
    const strategy = getStrategy(node, forced);
    best = {
      handKey: forced,
      difficulty: difficultyOf({
        entropy: strategyEntropy(node.actions.map((a) => strategy[a] ?? 0)),
        evGap: evGapOf(node, forced),
        street: "preflop",
        classAmbiguity: 0,
      }),
    };
  }

  const reachable = reachableHands(node, data);

  for (let i = 0; i < draws; i++) {
    const handKey = sampleInstructiveHand(node, rng, reachable);
    const strategy = getStrategy(node, handKey);
    const difficulty = difficultyOf({
      entropy: strategyEntropy(node.actions.map((a) => strategy[a] ?? 0)),
      evGap: evGapOf(node, handKey),
      street: "preflop",
      classAmbiguity: 0,
    });
    if (best === null || Math.abs(difficulty - target!) < Math.abs(best.difficulty - target!)) {
      best = { handKey, difficulty };
    }
    if (target !== undefined && best.difficulty === target) break;
  }
  const chosen = best!;
  const combo = comboFor(chosen.handKey, [], rng);

  return {
    id: spotId(node.ref, seed),
    seed,
    type: "preflop",
    nodeRef: node.ref,
    handKey: chosen.handKey,
    handClass: null,
    heroPos: node.heroPos,
    heroCards: [combo[0], combo[1]],
    board: [],
    potBb: node.potBb,
    effStackBb: node.effStackBb,
    actionHistory: actionHistoryFor(node),
    legalActions: [...node.actions],
    seats: seatsFor(node.heroPos, node.effStackBb),
    difficulty: chosen.difficulty,
  };
}

function generatePostflop(config: SpotConfig, data: SolutionData, rng: Rng, seed: string): Spot {
  const candidates = data.postflop.filter((template) => {
    if (config.templateId !== undefined && template.id !== config.templateId) return false;
    if (config.heroPos !== undefined && template.heroPos !== config.heroPos) return false;
    if (config.excludeNodeRefs?.includes(template.id) === true) return false;
    if (config.tags !== undefined && config.tags.length > 0) {
      const tags = [...template.boardTags, template.street, "postflop"];
      if (!config.tags.some((tag) => tags.includes(tag))) return false;
    }
    return true;
  });
  if (candidates.length === 0) {
    throw new Error(`no postflop template matches ${JSON.stringify(config)}`);
  }

  const template = pick(candidates, rng);
  const heroRange = safeRange(template.heroRange);

  for (let attempt = 0; attempt < MAX_RESAMPLES; attempt++) {
    const boardText = pick(template.exampleBoards, rng);
    const board = boardText
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => parseCardStrict(text));

    const combo = randomHandFromRange(heroRange, board, rng);
    if (combo === undefined) continue;

    const handClass = classifyHand([combo[0], combo[1]], board);
    const entry = getPostflopStrategy(template, handClass);
    if (entry === undefined) continue;

    const frequencies = template.actions.map((a) => entry.strategy[a] ?? 0);
    const evs = template.actions.map((a) => entry.ev[a] ?? 0).sort((x, y) => y - x);
    const difficulty = difficultyOf({
      entropy: strategyEntropy(frequencies),
      evGap: (evs[0] ?? 0) - (evs[1] ?? 0),
      street: template.street,
      classAmbiguity: template.strategies.length > 10 ? 1 : 0.5,
    });

    return {
      id: spotId(template.id, seed),
      seed,
      type: "postflop",
      nodeRef: template.id,
      handKey: comboKeyOf(combo),
      handClass,
      heroPos: template.heroPos,
      heroCards: [combo[0], combo[1]],
      board,
      potBb: template.potBb,
      effStackBb: template.effStackBb,
      actionHistory: [...template.actionHistory],
      legalActions: [...template.actions],
      seats: seatsFor(template.heroPos, template.effStackBb),
      difficulty,
    };
  }

  // Fail loudly. A silent fallback here would serve a spot whose hand class the
  // template has no strategy for, and the grader would then have nothing to
  // grade against.
  throw new Error(
    `could not build a spot for ${template.id} in ${MAX_RESAMPLES} attempts — ` +
      `its hero range and its strategy list probably do not overlap`,
  );
}

function comboKeyOf(combo: Combo): HandKey {
  const [a, b] = combo;
  const rank = (card: Card) => card >> 2;
  const suit = (card: Card) => card & 3;
  const high = Math.max(rank(a), rank(b));
  const low = Math.min(rank(a), rank(b));
  const chars = "23456789TJQKA";
  if (high === low) return `${chars[high]}${chars[low]}` as HandKey;
  return `${chars[high]}${chars[low]}${suit(a) === suit(b) ? "s" : "o"}` as HandKey;
}

function safeRange(notation: string): Range {
  try {
    return Range.parse(notation);
  } catch {
    // A template whose range is prose rather than notation still has to
    // generate something; fall back to a wide default and let the template's
    // own confidence note carry the warning.
    return Range.parse("22+,A2s+,K5s+,Q8s+,J8s+,T8s+,98s,87s,76s,ATo+,KJo+,QJo");
  }
}

function parseCardStrict(text: string): Card {
  const ranks = "23456789TJQKA";
  const suits = "cdhs";
  const rank = ranks.indexOf(text[0]?.toUpperCase() ?? "");
  const suit = suits.indexOf(text[1]?.toLowerCase() ?? "");
  if (rank < 0 || suit < 0) throw new SyntaxError(`not a card: ${text}`);
  return ((rank << 2) | suit) as Card;
}

/**
 * A batch for the daily challenge. Never repeats a node inside one batch — the
 * same spot twice in a ten-hand challenge is immediately noticeable.
 */
export function generateSpotBatch(
  config: SpotConfig,
  count: number,
  seed: number | string,
): (data: SolutionData) => Spot[] {
  return (data: SolutionData) => {
    const spots: Spot[] = [];
    const used: string[] = [...(config.excludeNodeRefs ?? [])];
    for (let i = 0; i < count; i++) {
      const spot = generateSpot({ ...config, excludeNodeRefs: used }, data, `${String(seed)}:${i}`);
      spots.push(spot);
      used.push(spot.nodeRef);
    }
    return spots;
  };
}

export function describeSpot(spot: Spot): string {
  const board = spot.board.length > 0 ? ` on ${cardsToString(spot.board)}` : "";
  return `${spot.heroPos} ${spot.nodeRef} with ${cardsToString(spot.heroCards)}${board}`;
}

export type { PreflopActionName, PostflopActionName };
