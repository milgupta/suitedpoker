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
import { classifyHand, type HandClass, handClassRank, HAND_CLASSES } from "../handclass";
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

/** The safest legal action: check if free, otherwise fold. */
function passiveFallback(legal: readonly LegalAction[]): Action {
  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  const fold = legal.find((a) => a.type === "fold");
  if (fold !== undefined) return { type: "fold" };
  const call = legal.find((a) => a.type === "call");
  if (call !== undefined) return { type: "call", amount: call.amount };
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
  const width = facingBet ? profile.defendWidth : profile.openWidth;
  const inWidth = strengthPercentile(handKey) >= 1 - width;
  const archetypePlay = inWidth ? 1 : 0;
  const archetypeAggressionShare = profile.raiseShare;

  if (node === null) {
    // No modelled node for this line — a limped pot, a four-way flop, anything
    // the 43-node set does not cover. Falling through to a fold here was the
    // first calibration bug: it dropped every bot's VPIP by roughly ten points
    // and made the archetypes indistinguishable.
    const aggressive = archetypePlay * archetypeAggressionShare;
    return { fold: 1 - archetypePlay, call: archetypePlay - aggressive, raise: aggressive };
  }

  const base: Record<string, number> = {};
  for (const action of node.actions) base[action] = frequencyOf(node, handKey, action);

  const solutionPlay = 1 - (base.fold ?? 0);
  const play = Math.max(
    0,
    Math.min(
      1,
      solutionPlay * profile.solutionWeight + archetypePlay * (1 - profile.solutionWeight),
    ),
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
  const frequencies = archetypeFrequencies(node, handKey, profile, facingBet, canCall);

  const choice = pickWeighted(Object.entries(frequencies), rng);
  if (choice === undefined) return undefined;
  return toLegalAction(choice as PreflopActionName, legal, state.pot);
}

/** Maps a solution action name onto something legal in this exact state. */
function toLegalAction(
  action: PreflopActionName | "check",
  legal: readonly LegalAction[],
  potBb: number,
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
  // raise / allin
  const option = legal.find((a) => a.type === "raise") ?? legal.find((a) => a.type === "bet");
  if (option === undefined) return undefined;
  const min = option.min ?? 0;
  const max = option.max ?? 0;
  if (max < min) return undefined;
  const amount = action === "allin" ? max : Math.max(min, Math.min(max, Math.round(potBb * 1.1)));
  return { type: option.type, amount };
}

// ── Postflop ──────────────────────────────────────────────────────────────────

const STRONGEST = handClassRank("straight_flush");
const WEAKEST = handClassRank("air");

/** 1 for the nuts, 0 for air. */
export function classStrength(handClass: HandClass): number {
  return 1 - (handClassRank(handClass) - STRONGEST) / (WEAKEST - STRONGEST);
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

  // A matching template is ground truth; the archetype only bends it.
  const template = data.templates?.find(
    (t) => t.street === streetName(state.board.length) && t.heroPos === hero.position,
  );
  const entry = template === undefined ? undefined : getPostflopStrategy(template, handClass);
  const templateBet = entry
    ? Object.entries(entry.strategy)
        .filter(([action]) => action.startsWith("bet_") || action.startsWith("raise"))
        .reduce((sum, [, f]) => sum + f, 0)
    : null;

  const facingBet = legal.some((a) => a.type === "call");

  if (!facingBet) {
    const base = templateBet ?? strength;
    const betProbability = profile.valueAggression * base + profile.bluffFrequency * (1 - base);
    if (rng() < betProbability) {
      const fraction = strength > 0.6 ? 0.66 : 0.4;
      const bet = aggressiveAction(legal, state.pot, fraction);
      if (bet !== undefined) return bet;
    }
    return passiveFallback(legal);
  }

  // Facing a bet: continue in proportion to strength, fold in proportion to the
  // archetype's fear of aggression.
  const continueProbability = Math.max(
    0,
    Math.min(1, strength * (1 - profile.foldToAggression) + (1 - profile.foldToAggression) * 0.35),
  );
  if (rng() >= continueProbability) {
    return legal.some((a) => a.type === "fold") ? { type: "fold" } : passiveFallback(legal);
  }

  // The bluff term carries real weight here: it is what separates the maniac's
  // aggression factor from the regular's. At 0.08 both bots measured the same.
  const raiseProbability =
    profile.valueAggression * strength * 0.45 + profile.bluffFrequency * 0.26;
  if (rng() < raiseProbability) {
    const raise = aggressiveAction(legal, state.pot, 0.8);
    if (raise !== undefined) return raise;
  }
  const call = legal.find((a) => a.type === "call");
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
