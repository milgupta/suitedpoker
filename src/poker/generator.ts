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
import { committedBbOf, seatActivity } from "./seat-activity";
import { refineEntry } from "./refine";
import {
  BASELINE_OPEN_CHIPS,
  BASELINE_THREE_BET_CHIPS,
  sizedPotBb,
  sizedRow,
  sizesFor,
} from "./sizing";

export type SpotType = "preflop" | "postflop";

export interface SpotConfig {
  type: SpotType;
  /** 1 (easiest) to 10. The generator targets it; it cannot always hit it. */
  difficulty?: number;
  tags?: string[];
  heroPos?: HeroPosition;
  actionSeq?: string;
  templateId?: string;
  /**
   * Postflop only. ANDed with other filters so a "flop + dry" mix cannot
   * accidentally pull a dry river via OR-matched board tags.
   */
  street?: "flop" | "turn" | "river";
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
  /**
   * Deal this exact raise size (in chips) rather than sampling one.
   *
   * The scripted surfaces need it: the demo hand's copy states the open size in
   * prose ("the button only raised to 5") and quotes the node's frequencies, so
   * a spot that dealt a 7-chip open would contradict its own explanation. The
   * landing showcase has the same problem for the same reason.
   *
   * Server-side only. Nothing reachable from a request body sets it.
   */
  forceFacingChips?: number;
}

export interface SeatView {
  seat: number;
  position: HeroPosition;
  stackBb: number;
  isHero: boolean;
  /** Server-owned: this seat is out of the hand. */
  folded: boolean;
  /** Server-owned: still to speak behind the hero. */
  toAct: boolean;
  /** Last action text for the badge (no position prefix), or null. */
  action: string | null;
  /** Chips in front of this seat (blind or bet), else null. */
  committedBb: number | null;
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
  /**
   * The raise hero is FACING, in chips. 0 postflop and at an unopened pot.
   *
   * Safe on the client — it is already printed in the action history — and it
   * has to travel, because the grader must price the decision against the same
   * raise the user was shown. See `src/poker/sizing.ts`.
   */
  readonly facingChips: number;
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
  // `multiway` spans both families so a lesson or a leak can ask for "a pot
  // with more than one opponent in it" without naming the shape.
  else if (node.actionSeq.startsWith("vs_open_call_")) tags.push("squeeze", "multiway");
  else if (node.actionSeq.startsWith("vs_limp_")) tags.push("limped", "multiway", "isolation");
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

/**
 * Six seats with fold / waiting / action / chip state computed once on the
 * server. The client must not re-derive this from history strings.
 */
function seatsFor(
  heroPos: HeroPosition,
  effStackBb: number,
  actionHistory: readonly string[],
  boardCount: number,
): SeatView[] {
  const activity = seatActivity(heroPos, actionHistory);
  return POSITION_STACKS.map((position, seat) => {
    const state = activity[position]!;
    return {
      seat,
      position,
      stackBb: effStackBb,
      isHero: position === heroPos,
      folded: state.folded,
      toAct: state.toAct,
      action: state.action,
      committedBb: committedBbOf(position, state, boardCount),
    };
  });
}

/**
 * Sizings in CHIPS, the engine's own unit at 2 per big blind.
 *
 * These were "2.5bb", "11bb" and "22bb". Written as chips they are 5, 22 and
 * 44 — the identical sizings, with no decimal to round and no unit a beginner
 * has to be taught before they can read the line. See `src/lib/units.ts` for
 * why the whole product moved off big blinds.
 */
const OPEN_CHIPS = BASELINE_OPEN_CHIPS;
/** A limp is exactly one big blind. */
const LIMP_CHIPS = 2;
const THREE_BET_CHIPS = BASELINE_THREE_BET_CHIPS;

/**
 * The action history, with the price hero FACES taken from the spot.
 *
 * Only the last raise varies. The sizes before it are the baseline, because
 * they are hero's own past action or a street already settled — varying those
 * too would change what hero is holding without changing the question.
 */
export function actionHistoryFor(node: PreflopNode, facingChips: number): string[] {
  if (node.actionSeq === "rfi") return ["folded to hero"];
  const opponent = node.actionSeq.split("_").pop() ?? "";

  // Multiway. Both amounts are written out because `committedBbOf` reads the
  // last figure on the line to draw a seat's chips — a bare "MP calls" would
  // put 5 chips in the pot with nothing in front of the player who paid them.
  if (node.actionSeq.startsWith("vs_limp_")) {
    return [`${opponent} limps ${LIMP_CHIPS}`];
  }
  if (node.actionSeq.startsWith("vs_open_call_")) {
    const [, , , opener, caller] = node.actionSeq.split("_");
    return [`${opener ?? ""} opens ${OPEN_CHIPS}`, `${caller ?? ""} calls ${OPEN_CHIPS}`];
  }

  if (node.actionSeq.startsWith("vs_rfi_")) return [`${opponent} opens ${facingChips}`];
  if (node.actionSeq.startsWith("vs_3bet_")) {
    return [`${node.heroPos} opens ${OPEN_CHIPS}`, `${opponent} 3bets to ${facingChips}`];
  }
  return [
    `${opponent} opens ${OPEN_CHIPS}`,
    `${node.heroPos} 3bets to ${THREE_BET_CHIPS}`,
    `${opponent} 4bets to ${facingChips}`,
  ];
}

/**
 * Which price this spot deals, weighted toward the baseline.
 *
 * Not uniform: 2.5x is by a wide margin the most common open in real games, and
 * a drill that served the three sizes equally would misrepresent how often a
 * player actually meets each one.
 */
const SIZE_WEIGHTS: readonly number[] = [0.5, 0.3, 0.2];

function pickFacingChips(node: PreflopNode, rng: Rng, forced?: number): number {
  const sizes = sizesFor(node.actionSeq);
  if (sizes.length === 0) return 0;
  if (forced !== undefined && sizes.includes(forced)) return forced;
  let target = rng();
  for (let i = 0; i < sizes.length; i++) {
    target -= SIZE_WEIGHTS[i] ?? 0;
    if (target < 0) return sizes[i]!;
  }
  return sizes[0]!;
}

export interface SolutionData {
  preflop: readonly PreflopNode[];
  postflop: readonly PostflopTemplate[];
}

const MAX_RESAMPLES = 60;

/**
 * Candidate combos considered when a postflop difficulty is requested.
 *
 * Higher than preflop's 12 because a postflop draw can be rejected before it
 * scores at all — an unreachable combo, or a hand class the template has no row
 * for — so the yield per attempt is lower.
 */
const POSTFLOP_DIFFICULTY_DRAWS = 16;

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
  const facingChips = pickFacingChips(node, rng, config.forceFacingChips);

  // Difficulty is measured on the SIZED row, not the authored one. Facing a
  // bigger raise genuinely changes the question — a hand that was a clear call
  // at 5 chips can be a coin flip at 7 — and a difficulty computed from the
  // baseline would rank a spot the grader then treats differently.
  const rowFor = (handKey: HandKey) => sizedRow(node, handKey, facingChips);
  const difficultyFor = (handKey: HandKey): number => {
    const row = rowFor(handKey);
    const evs = node.actions.map((a) => row.ev[a] ?? 0).sort((x, y) => y - x);
    return difficultyOf({
      entropy: strategyEntropy(node.actions.map((a) => row.strategy[a] ?? 0)),
      evGap: (evs[0] ?? 0) - (evs[1] ?? 0),
      street: "preflop",
      classAmbiguity: 0,
    });
  };

  // Draw a few candidate hands and keep the one closest to the requested
  // difficulty. Sampling once and hoping would make `difficulty` decorative.
  const target = config.difficulty;
  let best: { handKey: HandKey; difficulty: number } | null = null;
  const forced = config.forceHandKey;
  const draws = forced !== undefined ? 0 : target === undefined ? 1 : 12;

  if (forced !== undefined) {
    best = { handKey: forced, difficulty: difficultyFor(forced) };
  }

  const reachable = reachableHands(node, data);

  for (let i = 0; i < draws; i++) {
    const handKey = sampleInstructiveHand(node, rng, reachable);
    const difficulty = difficultyFor(handKey);
    if (best === null || Math.abs(difficulty - target!) < Math.abs(best.difficulty - target!)) {
      best = { handKey, difficulty };
    }
    if (target !== undefined && best.difficulty === target) break;
  }
  const chosen = best!;
  const combo = comboFor(chosen.handKey, [], rng);
  const actionHistory = actionHistoryFor(node, facingChips);

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
    potBb: sizedPotBb(node, facingChips),
    effStackBb: node.effStackBb,
    actionHistory,
    legalActions: [...node.actions],
    seats: seatsFor(node.heroPos, node.effStackBb, actionHistory, 0),
    difficulty: chosen.difficulty,
    facingChips,
  };
}

function generatePostflop(config: SpotConfig, data: SolutionData, rng: Rng, seed: string): Spot {
  const candidates = data.postflop.filter((template) => {
    if (config.templateId !== undefined && template.id !== config.templateId) return false;
    if (config.heroPos !== undefined && template.heroPos !== config.heroPos) return false;
    if (config.street !== undefined && template.street !== config.street) return false;
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

  /**
   * Difficulty targeting, which this function did not do for eleven substages.
   * `config.difficulty` was computed onto the OUTPUT and never read as an
   * INPUT, so the whole adaptive-difficulty loop was inert on every postflop
   * hand: a 1400-rated player and a 700-rated one drew from the same pool.
   *
   * Same shape as the preflop path — draw candidates, keep the closest — but
   * the draws must be counted separately from the resample budget, because a
   * combo whose class the template has no row for is not a candidate at all.
   */
  const target = config.difficulty;
  const wanted = target === undefined ? 1 : POSTFLOP_DIFFICULTY_DRAWS;

  let best: { combo: Combo; board: Card[]; handClass: HandClass; difficulty: number } | null = null;
  let drawn = 0;

  for (let attempt = 0; attempt < MAX_RESAMPLES && drawn < wanted; attempt++) {
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
    drawn++;

    // Scored on the REFINED cell, not the authored one. The combo is part of
    // the decision now, so a difficulty computed from the bare class would rank
    // a spot the grader then treats as a different question.
    const refined = refineEntry(entry, template.actions, { hole: [combo[0], combo[1]], board });
    const frequencies = template.actions.map((a) => refined.strategy[a] ?? 0);
    const evs = template.actions.map((a) => refined.ev[a] ?? 0).sort((x, y) => y - x);
    const difficulty = difficultyOf({
      entropy: strategyEntropy(frequencies),
      evGap: (evs[0] ?? 0) - (evs[1] ?? 0),
      street: template.street,
      classAmbiguity: template.strategies.length > 10 ? 1 : 0.5,
    });

    if (
      best === null ||
      (target !== undefined && Math.abs(difficulty - target) < Math.abs(best.difficulty - target))
    ) {
      best = { combo, board, handClass, difficulty };
    }
    if (target !== undefined && best.difficulty === target) break;
  }

  // Fail loudly. A silent fallback here would serve a spot whose hand class the
  // template has no strategy for, and the grader would then have nothing to
  // grade against.
  if (best === null) {
    throw new Error(
      `could not build a spot for ${template.id} in ${MAX_RESAMPLES} attempts — ` +
        `its hero range and its strategy list probably do not overlap`,
    );
  }

  const actionHistory = [...template.actionHistory];

  return {
    id: spotId(template.id, seed),
    seed,
    type: "postflop",
    nodeRef: template.id,
    handKey: comboKeyOf(best.combo),
    handClass: best.handClass,
    heroPos: template.heroPos,
    heroCards: [best.combo[0], best.combo[1]],
    board: best.board,
    potBb: template.potBb,
    effStackBb: template.effStackBb,
    actionHistory,
    legalActions: [...template.actions],
    seats: seatsFor(template.heroPos, template.effStackBb, actionHistory, best.board.length),
    difficulty: best.difficulty,
    // Postflop sizing is authored into the template's own action list; there is
    // no single "raise faced" to vary.
    facingChips: 0,
  };
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
