/**
 * The bot opponents.
 *
 * One decision engine, five profiles. Each archetype is a transformation of
 * the solution data rather than its own decision tree — so a correction to the
 * preflop set reaches every bot at once, and no archetype can invent a line the
 * solution has never heard of.
 *
 * HARD RULE: `decide` must return a LEGAL action for every reachable state and
 * must never throw. A bot that throws mid-session destroys a user's game; a bot
 * that returns an illegal action corrupts the chip count. Every path ends in a
 * legality filter, and the fallback is check-or-fold.
 *
 * Thinking time is deliberately NOT here. A delay belongs at the UI layer,
 * where it can be interrupted; putting it in pure logic would make 100,000
 * simulated hands take a day.
 */

import { type Card, type Rng } from "../cards";
import {
  type Action,
  type GameState,
  type LegalAction,
  legalActions,
  type Position,
} from "../gamestate";
import {
  boardTexture,
  classifyHand,
  type BoardTag,
  type HandClass,
  handClassRank,
  HAND_CLASSES,
} from "../handclass";
import { handToKey, type HandKey } from "../range";
import {
  frequencyOf,
  getPostflopStrategy,
  type PostflopTemplate,
  type PreflopActionName,
  type PreflopNode,
  type SolutionIndex,
} from "../solutions";

import { type BotId, BOT_IDS, type BotProfile, PROFILES, strengthPercentile } from "./profiles";

export { BOT_IDS, PROFILES, type BotId, type BotProfile } from "./profiles";

export interface BotData {
  solutions: SolutionIndex;
  templates?: readonly PostflopTemplate[];
}

export interface BotPolicy {
  readonly id: BotId;
  readonly name: string;
  readonly description: string;
  readonly teaches: string;
  decide(state: GameState, seat: number, data: BotData, rng: Rng): Action;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickWeighted<T>(options: ReadonlyArray<[T, number]>, rng: Rng): T | undefined {
  const total = options.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (total <= 0) return options[0]?.[0];
  let target = rng() * total;
  for (const [value, weight] of options) {
    target -= Math.max(0, weight);
    if (target < 0) return value;
  }
  return options[options.length - 1]?.[0];
}

/**
 * The safest legal action: check if free, then call, then fold.
 *
 * Call before fold ON PURPOSE. This path is only reached when the bot WANTED
 * to act — usually an aggressive action the state made illegal — so folding
 * here throws away a hand the bot had already decided was worth playing.
 * Checking when free was always right; the old check→fold ordering was how a
 * bot that meant to raise an all-in folded to it instead.
 */
export function passiveFallback(legal: readonly LegalAction[]): Action {
  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  const call = legal.find((a) => a.type === "call");
  if (call !== undefined) return { type: "call", amount: call.amount };
  const fold = legal.find((a) => a.type === "fold");
  if (fold !== undefined) return { type: "fold" };
  const first = legal[0];
  if (first === undefined) throw new RangeError("no legal action available");
  return first.type === "bet" || first.type === "raise"
    ? { type: first.type, amount: first.min }
    : { type: first.type };
}

/** Clamps an aggressive action into the legal band, or downgrades it. */
function aggressiveAction(
  legal: readonly LegalAction[],
  potBb: number,
  fraction: number,
): Action | undefined {
  const raise = legal.find((a) => a.type === "raise");
  const bet = legal.find((a) => a.type === "bet");
  const option = raise ?? bet;
  if (option === undefined) return undefined;
  const min = option.min ?? 0;
  const max = option.max ?? 0;
  if (max <= 0 || max < min) return undefined;
  const wanted = Math.round(potBb * fraction);
  const amount = Math.max(min, Math.min(max, wanted));
  return { type: option.type, amount };
}

function findNode(index: SolutionIndex, position: Position, actionSeq: string): PreflopNode | null {
  return index.nodes.get(`${position}:${actionSeq}`) ?? null;
}

/**
 * Which solution node describes this spot. Preflop only, and deliberately
 * conservative: if the line is one the set does not model, we say so rather
 * than substituting a node that describes a different decision.
 */
export function preflopNodeFor(
  state: GameState,
  seat: number,
  index: SolutionIndex,
): PreflopNode | null {
  const hero = state.players[seat];
  if (hero === undefined) return null;

  const raises = state.history.filter((e) => e.kind === "action" && e.action === "raise");
  const position = hero.position;

  if (raises.length === 0) return findNode(index, position, "rfi");

  const lastRaise = raises[raises.length - 1];
  const aggressorSeat = lastRaise !== undefined && "seat" in lastRaise ? lastRaise.seat : null;
  const aggressor = aggressorSeat === null ? null : state.players[aggressorSeat]?.position;
  if (aggressor === undefined || aggressor === null) return null;

  if (raises.length === 1) return findNode(index, position, `vs_rfi_${aggressor}`);
  if (raises.length === 2) return findNode(index, position, `vs_3bet_${aggressor}`);
  return findNode(index, position, `vs_4bet_${aggressor}`);
}

// ── Price awareness ──────────────────────────────────────────────────────────

/**
 * The immediate price of continuing: chips to call over the pot after calling.
 * Unitless, so chips and bb callers agree by construction.
 */
export function potOddsOf(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}

/**
 * The odds at which the strategy's frequencies are taken at face value.
 * Cheaper than this and the bot continues more; a raise past pot and it
 * continues less. 0.5 is a pot-sized raise — deliberately above the
 * ~0.27–0.38 a standard 2.5bb open offers, which is a LOOSENESS BIAS, not a
 * measurement: ordinary opens read as a good price, so the table plays back
 * instead of folding around. A training table where half the hands end the
 * moment anyone opens teaches nothing, and that is what chart-faithful
 * frequencies produce six-handed. The differentiation between a min-raise
 * and an overbet comes from the curve, not from this anchor.
 */
const REFERENCE_ODDS = 0.5;

/**
 * How much to bend the fold frequency for the price on offer, as an exponent
 * applied to the fold mass: `fold^scale`. Above 1 means a good price (fold
 * less); below 1 a bad one. The exponent form is the whole trick — it keeps
 * both fixed points, so a pure fold stays a fold and a hand that never folds
 * still never folds, whatever the price. A multiplicative scale on the
 * continue mass would make AA fold to an overbet.
 */
export function priceScaleFor(potOdds: number, profile: BotProfile): number {
  if (potOdds <= 0) return 1;
  // Asymmetric on purpose: how much a GOOD price loosens a bot is damped by
  // its fear of aggression. A rock getting 3.7-to-1 still mostly folds — that
  // is what makes it a rock — while a big bet tightens everyone at full
  // sensitivity. Without the damping, price awareness walked the nit's VPIP
  // from 12 to 18 and erased the archetype.
  const goodPrice = potOdds < REFERENCE_ODDS;
  const exponent = profile.priceSensitivity * (goodPrice ? 1 - profile.foldToAggression : 1);
  let raw = (REFERENCE_ODDS / Math.max(potOdds, 0.05)) ** exponent;

  // Pot odds asymptote at 0.5 as a raise grows — a 40bb overbet offers ~0.48,
  // which the curve above reads as nearly neutral. So oversize is measured
  // directly: the call against everything else in the pot. Past ~2.2x (a cold
  // call of a 4bb+ open, a blind facing a 5x) the price turns bad fast, which
  // is what makes a 40bb overbet and a min-raise genuinely different worlds.
  const oversize = potOdds < 0.5 ? potOdds / (1 - 2 * potOdds) : Number.POSITIVE_INFINITY;
  if (oversize > 2.2) raw *= (2.2 / oversize) ** 0.8;

  return Math.max(0.45, Math.min(1.8, raw));
}

/** Applies the price exponent to the fold mass and renormalises the rest. */
export function applyPriceScale(
  frequencies: Record<string, number>,
  scale: number,
): Record<string, number> {
  const fold = frequencies.fold ?? 0;
  if (fold <= 0 || fold >= 1 || scale === 1) return frequencies;

  const foldAfter = fold ** scale;
  const continueBefore = 1 - fold;
  const continueAfter = 1 - foldAfter;
  const ratio = continueAfter / continueBefore;

  const out: Record<string, number> = {};
  for (const [action, frequency] of Object.entries(frequencies)) {
    out[action] = action === "fold" ? foldAfter : frequency * ratio;
  }
  return out;
}

/**
 * `fold^scale` cannot move a PURE fold, by design — and 94.3% of the strategy
 * mass is pure, so on its own the price curve barely changes what a table
 * does. This is the other half: at a good price, hands sitting JUST BELOW the
 * range boundary defend some of the time, with the chance decaying fast as
 * the hand gets further from the range. A hand one tier under the boundary is
 * exactly the hand a human widens with when the price is right; 72o stays
 * folded at any price, because the decay has already zeroed it.
 *
 * `rangeThreshold` is the strength percentile where this spot's continues
 * start; `strength` is the hand's own percentile. Freed mass goes to CALL —
 * marginal defends are calls, not new bluffs (the mix noise adds those).
 */
export function applyDefendBand(
  frequencies: Record<string, number>,
  scale: number,
  strength: number,
  rangeThreshold: number,
): Record<string, number> {
  if (scale <= 1) return frequencies;
  const fold = frequencies.fold ?? 0;
  if (fold < 0.98) return frequencies;

  const gap = Math.max(0, rangeThreshold - strength);
  const defend = (scale - 1) * 0.95 * Math.exp(-gap * 10);
  if (defend < 0.01) return frequencies;

  return {
    ...frequencies,
    fold: fold - fold * defend,
    call: (frequencies.call ?? 0) + fold * defend,
  };
}

/**
 * The strength percentile where a node's continuing range begins, cached per
 * node — combo-weighted, so it lines up with `strengthPercentile`'s scale.
 */
const NODE_THRESHOLD = new WeakMap<PreflopNode, number>();

export function nodeContinueThreshold(node: PreflopNode): number {
  const cached = NODE_THRESHOLD.get(node);
  if (cached !== undefined) return cached;

  let continueCombos = 0;
  let totalCombos = 0;
  for (const [hand, mix] of Object.entries(node.strategy)) {
    const combos = hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
    totalCombos += combos;
    continueCombos += combos * (1 - (mix.fold ?? 0));
  }
  const threshold = totalCombos === 0 ? 1 : 1 - continueCombos / totalCombos;
  NODE_THRESHOLD.set(node, threshold);
  return threshold;
}

// ── Mixing ───────────────────────────────────────────────────────────────────

/**
 * Per-decision noise: a slice of the continue mix is spread evenly over the
 * non-fold actions, so a hand the strategy plays one way 100% of the time
 * still varies by profile. 94.3% of the strategy mass is pure 0/1; without
 * this, every bot plays every hand identically every time, which is the
 * precise thing a human opponent never does.
 *
 * Hands the strategy folds outright (under 2% continue) are left alone —
 * trash staying folded is correct play, not scriptedness, and randomly
 * open-calling 72o would read as a bug.
 */
export function applyMixNoise(
  frequencies: Record<string, number>,
  temperature: number,
): Record<string, number> {
  if (temperature <= 0) return frequencies;
  const continueMass = 1 - (frequencies.fold ?? 0);
  if (continueMass <= 0.02) return frequencies;

  const continueActions = Object.keys(frequencies).filter((action) => action !== "fold");
  if (continueActions.length < 2) return frequencies;

  const uniformShare = continueMass / continueActions.length;
  const out: Record<string, number> = { ...frequencies };
  for (const action of continueActions) {
    out[action] = (1 - temperature) * (frequencies[action] ?? 0) + temperature * uniformShare;
  }
  return out;
}

// ── Sizing ───────────────────────────────────────────────────────────────────

function jittered(range: readonly [number, number], rng: Rng): number {
  const [min, max] = range;
  return min + rng() * (max - min);
}

/**
 * What a preflop raise should be, in chips, before legality clamping.
 *
 * An open is sized in big blinds, a re-raise as a multiple of the bet faced —
 * the two conventions every real player uses. Both jitter inside the
 * profile's band, because "always exactly pot × 1.1" was one of the tells
 * that made the bots feel scripted. Legality is someone else's job:
 * `toLegalAction` clamps this into the legal band.
 */
export function preflopRaiseTarget(state: GameState, profile: BotProfile, rng: Rng): number {
  const bigBlind = state.config.bigBlind;
  const opening = state.currentBet <= bigBlind;
  if (opening) return Math.round(bigBlind * jittered(profile.openRaiseBb, rng));
  return Math.round(state.currentBet * jittered(profile.reraiseX, rng));
}

// ── Preflop ───────────────────────────────────────────────────────────────────

/**
 * The archetype transformation.
 *
 * Starts from the node's own mix, then bends it: the width gate decides whether
 * the hand is played at all, and `raiseShare` decides how much of the played
 * frequency is aggressive. `solutionWeight` says how much the original mix
 * survives — which is why `gto` is not a special case so much as the limit of
 * the same formula.
 */
export function archetypeFrequencies(
  node: PreflopNode | null,
  handKey: HandKey,
  profile: BotProfile,
  facingBet: boolean,
  canCall: boolean,
): Record<string, number> {
  // `facingBet` here means facing a RAISE, not merely facing the big blind.
  // Preflop every seat but the big blind has a call available, so keying off
  // "is call legal" made openWidth dead code and every archetype came out
  // defending-wide and opening-never.
  const baseWidth = facingBet ? profile.defendWidth : profile.openWidth;
  /**
   * Missing tree (no node): a hard cut at defendWidth made mid-strength hands
   * pure folds, so a hero raise got folded by five seats every time. Widen and
   * soften the edge so continue rates have real variance.
   */
  const width =
    node === null && facingBet
      ? Math.min(0.7, Math.max(baseWidth * 1.65, profile.vpipTarget))
      : baseWidth;

  const percentile = strengthPercentile(handKey);
  const cut = 1 - width;
  let archetypePlay = 0;
  if (percentile >= cut) {
    archetypePlay = 1;
  } else if (node === null && facingBet && percentile >= cut - 0.14) {
    // Soft band below the cut — sometimes continue, never a cliff.
    archetypePlay = (percentile - (cut - 0.14)) / 0.14;
  }

  const archetypeAggressionShare = profile.raiseShare;

  if (node === null) {
    // No modelled node for this line — a limped pot, a four-way pot, or a
    // pairing the set does not cover. Soft play above replaces the old
    // binary fold cliff.
    const aggressive = archetypePlay * archetypeAggressionShare;
    const callShare = Math.max(0, archetypePlay - aggressive);
    return { fold: 1 - archetypePlay, call: callShare, raise: aggressive };
  }

  const hardInWidth = percentile >= 1 - baseWidth ? 1 : 0;
  const base: Record<string, number> = {};
  for (const action of node.actions) base[action] = frequencyOf(node, handKey, action);

  const solutionPlay = 1 - (base.fold ?? 0);
  const play = Math.max(
    0,
    Math.min(1, solutionPlay * profile.solutionWeight + hardInWidth * (1 - profile.solutionWeight)),
  );

  const aggressive = node.actions.filter((a) => a !== "fold" && a !== "call");
  // From the GAME, not the node. An `rfi` node lists only fold and raise, but
  // limping behind is legal and is exactly what a calling station does. Reading
  // this off the node forced every bot into raise-or-fold whenever it was first
  // in, which inflated PFR and suppressed VPIP across the board.
  const hasCall = canCall;

  const solutionAggressive = aggressive.reduce((sum, a) => sum + (base[a] ?? 0), 0);
  const solutionAggressionShare = solutionPlay > 0 ? solutionAggressive / solutionPlay : 1;
  const aggressionShare = hasCall
    ? solutionAggressionShare * profile.solutionWeight +
      profile.raiseShare * (1 - profile.solutionWeight)
    : 1;

  const out: Record<string, number> = { fold: 1 - play };
  const aggressiveTotal = play * aggressionShare;
  if (hasCall) out.call = play - aggressiveTotal;

  const denominator = solutionAggressive > 0 ? solutionAggressive : aggressive.length;
  for (const action of aggressive) {
    const share =
      solutionAggressive > 0 ? (base[action] ?? 0) / denominator : 1 / aggressive.length;
    out[action] = aggressiveTotal * share;
  }
  return out;
}

function decidePreflop(
  state: GameState,
  seat: number,
  data: BotData,
  rng: Rng,
  profile: BotProfile,
  legal: readonly LegalAction[],
): Action | undefined {
  const hero = state.players[seat];
  if (hero?.holeCards == null) return undefined;

  const node = preflopNodeFor(state, seat, data.solutions);
  // Facing a RAISE, not just the blind.
  const facingBet = state.currentBet > state.config.bigBlind;
  const handKey = handToKey(hero.holeCards[0], hero.holeCards[1]);
  const canCall = legal.some((a) => a.type === "call") || legal.some((a) => a.type === "check");
  let frequencies = archetypeFrequencies(node, handKey, profile, facingBet, canCall);

  if (facingBet) {
    // The strategy tables know the LINE but not the SIZE. A min-raise and a
    // 40bb overbet used to get the identical response; the price curve is what
    // separates them, and it applies to the no-data fallback identically.
    const toCall = state.currentBet - hero.committedThisStreet;
    const scale = priceScaleFor(potOddsOf(toCall, state.pot), profile);
    frequencies = applyPriceScale(frequencies, scale);
    // The band starts where the TIGHTER of the node's range and the profile's
    // own defend width ends. Without the profile half, a good price walked the
    // nit down to the node's boundary and "The Rock" measured VPIP 19 — an
    // archetype's identity has to survive its price awareness.
    const nodeThreshold = node === null ? 1 - profile.defendWidth : nodeContinueThreshold(node);
    frequencies = applyDefendBand(
      frequencies,
      scale,
      strengthPercentile(handKey),
      Math.max(nodeThreshold, 1 - profile.defendWidth),
    );
  }
  frequencies = applyMixNoise(frequencies, profile.mixTemperature);

  const choice = pickWeighted(Object.entries(frequencies), rng);
  if (choice === undefined) return undefined;
  return toLegalAction(choice as PreflopActionName, legal, preflopRaiseTarget(state, profile, rng));
}

/** Maps a solution action name onto something legal in this exact state. */
function toLegalAction(
  action: PreflopActionName | "check",
  legal: readonly LegalAction[],
  raiseTargetChips: number,
): Action | undefined {
  if (action === "fold") {
    // Never fold when checking is free — that is strictly dominated, and a bot
    // that does it looks broken to any player watching.
    const check = legal.find((a) => a.type === "check");
    if (check !== undefined) return { type: "check" };
    return legal.some((a) => a.type === "fold") ? { type: "fold" } : undefined;
  }
  if (action === "check") {
    const check = legal.find((a) => a.type === "check");
    return check === undefined ? undefined : { type: "check" };
  }
  if (action === "call") {
    const call = legal.find((a) => a.type === "call");
    if (call !== undefined) return { type: "call", amount: call.amount };
    const check = legal.find((a) => a.type === "check");
    return check === undefined ? undefined : { type: "check" };
  }
  // raise / allin. When no aggressive action is legal — a capped street, an
  // all-in already covering us — the intent was to put chips in, so degrade to
  // call, then check. Degrading to undefined sent this through the fallback,
  // which used to FOLD a hand the bot had just decided to raise.
  const option = legal.find((a) => a.type === "raise") ?? legal.find((a) => a.type === "bet");
  if (option === undefined) {
    const call = legal.find((a) => a.type === "call");
    if (call !== undefined) return { type: "call", amount: call.amount };
    const check = legal.find((a) => a.type === "check");
    return check === undefined ? undefined : { type: "check" };
  }
  const min = option.min ?? 0;
  const max = option.max ?? 0;
  if (max < min) return undefined;
  const amount = action === "allin" ? max : Math.max(min, Math.min(max, raiseTargetChips));
  return { type: option.type, amount };
}

// ── Postflop ──────────────────────────────────────────────────────────────────

const STRONGEST = handClassRank("straight_flush");
const WEAKEST = handClassRank("air");

/** 1 for the nuts, 0 for air. */
export function classStrength(handClass: HandClass): number {
  return 1 - (handClassRank(handClass) - STRONGEST) / (WEAKEST - STRONGEST);
}

/**
 * The best-matching template for the actual spot, scored rather than found.
 *
 * The old `pool.find(street && heroPos)` returned the alphabetically-first
 * file for most seats and boards — a monotone-board strategy answering on a
 * dry ace-high flop. Street must still match exactly (a river template says
 * nothing about a flop), but position and board texture are similarity, not
 * identity: a template for the right texture from the neighbouring seat beats
 * no template at all. Action vocabulary counts too — a facing-bet decision
 * needs a template that has fold/call in it, not a stab chart. Ties break by
 * id so the choice is deterministic.
 */
export function pickPostflopTemplate(
  templates: readonly PostflopTemplate[] | undefined,
  street: "flop" | "turn" | "river",
  heroPos: Position,
  boardTags: readonly BoardTag[],
  facingBet: boolean,
): PostflopTemplate | undefined {
  if (templates === undefined || templates.length === 0) return undefined;

  let best: PostflopTemplate | undefined;
  let bestScore = -Infinity;
  for (const template of templates) {
    if (template.street !== street) continue;
    let score = template.heroPos === heroPos ? 4 : 0;
    const vocabularyFits = facingBet
      ? template.actions.includes("fold") || template.actions.includes("call")
      : template.actions.some((a) => a.startsWith("bet_") || a === "check");
    if (vocabularyFits) score += 3;
    for (const tag of template.boardTags) {
      // A tag the board does not carry is a claim the template makes about a
      // different board, so it counts against, not merely for nothing.
      score += boardTags.includes(tag as BoardTag) ? 2 : -1;
    }
    if (score > bestScore || (score === bestScore && best !== undefined && template.id < best.id)) {
      best = template;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Continue probability facing a postflop bet, from hand strength against the
 * price. Strength stands in for equity — crude, but it moves in the right
 * direction — and `foldToAggression` sets how much worse than the price the
 * archetype demands its hand to be. The logistic keeps it smooth: there is no
 * strength cliff where every bot on the same board does the same thing.
 */
export function postflopContinueProbability(
  strength: number,
  potOdds: number,
  profile: BotProfile,
): number {
  const margin = strength - potOdds;
  const base = 1 / (1 + Math.exp(-(margin * 6 + 0.6)));
  return Math.max(0, Math.min(1, base ** (0.55 + profile.foldToAggression)));
}

function decidePostflop(
  state: GameState,
  seat: number,
  data: BotData,
  rng: Rng,
  profile: BotProfile,
  legal: readonly LegalAction[],
): Action | undefined {
  const hero = state.players[seat];
  if (hero?.holeCards == null || state.board.length < 3) return undefined;

  const handClass = classifyHand(hero.holeCards, state.board as readonly Card[]);
  const strength = classStrength(handClass);
  const boardTags = boardTexture(state.board as readonly Card[]);
  const facingBet = legal.some((a) => a.type === "call");
  const opponents = state.players.filter((p) => p.seat !== seat && p.status !== "folded").length;

  // A matching template is ground truth; the archetype only bends it.
  const template = pickPostflopTemplate(
    data.templates,
    streetName(state.board.length),
    hero.position,
    boardTags,
    facingBet,
  );
  const entry = template === undefined ? undefined : getPostflopStrategy(template, handClass);

  if (!facingBet) {
    const templateBet = entry
      ? Object.entries(entry.strategy)
          .filter(([action]) => action.startsWith("bet_") || action.startsWith("raise"))
          .reduce((sum, [, f]) => sum + f, 0)
      : null;
    const base = templateBet ?? strength;
    // Bluffs shrink with the field: firing air into three callers is not a
    // style, it is a leak no archetype is meant to model. The noise term keeps
    // two identical spots from always betting or always checking.
    const bluffTerm =
      (profile.bluffFrequency * (1 - base)) / (1 + 0.5 * Math.max(0, opponents - 1));
    const betProbability = Math.max(
      0,
      Math.min(1, profile.valueAggression * base + bluffTerm + (rng() - 0.5) * 0.12),
    );
    if (rng() < betProbability) {
      const fraction = (strength > 0.6 ? 0.66 : 0.4) * profile.betSizeMult + (rng() - 0.5) * 0.16;
      const bet = aggressiveAction(legal, state.pot, Math.max(0.25, fraction));
      if (bet !== undefined) return bet;
    }
    return passiveFallback(legal);
  }

  // Facing a bet: the template's fold/continue mix when we have one, and the
  // price either way. A third-pot stab and a pot-sized barrel are different
  // questions and must get different answers, template or not.
  const call = legal.find((a) => a.type === "call");
  const toCall = call?.amount !== undefined ? call.amount - hero.committedThisStreet : 0;
  const priced = postflopContinueProbability(strength, potOddsOf(toCall, state.pot), profile);

  let continueProbability: number;
  if (entry !== undefined) {
    const foldF = entry.strategy.fold ?? 0;
    const templateContinue = Math.max(0, Math.min(1, 1 - foldF));
    // Stations trust the call side; nits lean toward the fold side — and the
    // priced half is what stops a template authored for one sizing answering
    // a 3x overbet the same way.
    const fear = profile.foldToAggression;
    continueProbability = 0.55 * templateContinue * (1.15 - fear * 0.55) + 0.45 * priced;
  } else {
    continueProbability = priced;
  }
  continueProbability = Math.max(0, Math.min(1, continueProbability + (rng() - 0.5) * 0.16));

  if (rng() >= continueProbability) {
    return legal.some((a) => a.type === "fold") ? { type: "fold" } : passiveFallback(legal);
  }

  // Raise frequency from the template when present, else archetype aggression.
  // The bluff term carries real weight in the fallback: it is what separates
  // the maniac's aggression factor from the regular's.
  let raiseProbability: number;
  if (entry !== undefined) {
    const raiseF = Object.entries(entry.strategy)
      .filter(([action]) => action.startsWith("raise") || action === "allin")
      .reduce((sum, [, f]) => sum + f, 0);
    raiseProbability = raiseF * (0.55 + profile.valueAggression * 0.45);
  } else {
    raiseProbability = profile.valueAggression * strength * 0.45 + profile.bluffFrequency * 0.26;
  }
  if (rng() < raiseProbability) {
    const fraction = 0.8 * profile.betSizeMult + (rng() - 0.5) * 0.16;
    const raise = aggressiveAction(legal, state.pot, Math.max(0.4, fraction));
    if (raise !== undefined) return raise;
  }
  return call === undefined ? passiveFallback(legal) : { type: "call", amount: call.amount };
}

function streetName(boardLength: number): "flop" | "turn" | "river" {
  return boardLength >= 5 ? "river" : boardLength === 4 ? "turn" : "flop";
}

// ── The policies ──────────────────────────────────────────────────────────────

function makePolicy(profile: BotProfile): BotPolicy {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    teaches: profile.teaches,
    decide(state, seat, data, rng): Action {
      const legal = legalActions(state);
      if (legal.length === 0) {
        throw new RangeError(`bot ${profile.id} asked to act with no legal action at seat ${seat}`);
      }
      try {
        const chosen =
          state.street === "preflop"
            ? decidePreflop(state, seat, data, rng, profile, legal)
            : decidePostflop(state, seat, data, rng, profile, legal);
        if (chosen !== undefined && isLegalChoice(chosen, legal)) return chosen;
      } catch {
        // A bot that throws ruins a live session. Fall through to something
        // legal and boring instead — and the tests assert this never has to
        // happen on a reachable state.
      }
      return passiveFallback(legal);
    },
  };
}

function isLegalChoice(action: Action, legal: readonly LegalAction[]): boolean {
  for (const option of legal) {
    if (option.type !== action.type) continue;
    if (option.type === "fold" || option.type === "check") return true;
    if (action.amount === undefined || !Number.isInteger(action.amount)) return false;
    if (option.type === "call") return action.amount === option.amount;
    return action.amount >= (option.min ?? 0) && action.amount <= (option.max ?? 0);
  }
  return false;
}

export const BOTS: Record<BotId, BotPolicy> = {
  nit: makePolicy(PROFILES.nit),
  station: makePolicy(PROFILES.station),
  maniac: makePolicy(PROFILES.maniac),
  tag: makePolicy(PROFILES.tag),
  gto: makePolicy(PROFILES.gto),
};

export function getBot(id: BotId): BotPolicy {
  const bot = BOTS[id];
  if (bot === undefined) throw new RangeError(`unknown bot: ${id}`);
  return bot;
}

export const ALL_BOTS: readonly BotPolicy[] = BOT_IDS.map((id) => BOTS[id]);

export { HAND_CLASSES };
