import "server-only";

import { createRng } from "@/poker/cards";
import { getBot, preflopNodeFor, type BotId } from "@/poker/bots";
import { PROFILES } from "@/poker/bots";
import {
  advanceUntilAction,
  applyAction,
  awardPot,
  createGame,
  describeAction,
  isLegal,
  legalActions,
  toHandHistory,
  type Action,
  type GameState,
  type HandEvent,
  type HandHistory,
} from "@/poker/gamestate";
import { grade as gradePreflop, gradePostflop } from "@/poker/grader";
import { boardTexture, classifyHand, type BoardTag } from "@/poker/handclass";
import { handToKey } from "@/poker/range";
import {
  buildSolutionIndex,
  type PostflopActionName,
  type PostflopTemplate,
  type PreflopActionName,
  type SolutionIndex,
} from "@/poker/solutions";
import { QUARANTINED_NODES } from "@/poker/node-status";
import { loadSolutionData } from "@/lib/solution-data";
import {
  botDisplayNames,
  describeBotAction,
  isGradedDepth,
  PRESETS,
  resultLineFor,
  type BotMove,
  type LiveSimState,
  type PresetId,
  type SimDecision,
  type SimHandRecord,
} from "@/lib/sim";
import { handStrength } from "@/poker/hand-strength";
import type { Card } from "@/poker/cards";

/**
 * The server side of the simulator: dealing, the bot loop, and settlement.
 *
 * The client sends hero actions and receives a view. Everything else — whose
 * turn it is, what the bots do, what the cards are — happens here, against the
 * 2.3 engine. The functions are pure over LiveSimState so the routes stay thin
 * and the tests can drive whole sessions without HTTP.
 */

/**
 * The engine deals in INTEGER chips. One big blind is two chips (SB 1, BB 2),
 * and every bb figure the user sees is converted at this boundary. Fractional
 * blinds inside the engine would reintroduce float drift into pot arithmetic,
 * which is the exact class of bug integer chips exist to prevent.
 */
export const CHIPS_PER_BB = 2;

export function chipsToBb(chips: number): number {
  return chips / CHIPS_PER_BB;
}

/**
 * Servable preflop only — what we grade the hero against. Quarantined nodes
 * must not become ground truth for a paying user's score.
 */
let cachedGradeIndex: SolutionIndex | null = null;

function gradeIndex(): SolutionIndex {
  if (cachedGradeIndex === null) {
    cachedGradeIndex = buildSolutionIndex(loadSolutionData().preflop);
  }
  return cachedGradeIndex;
}

function servedTemplates(): readonly PostflopTemplate[] {
  return loadSolutionData().postflop;
}

/**
 * Where a bot's line lands on a QUARANTINED node, it plays the released
 * representative of the same template family instead.
 *
 * The hero and the bots read ONE strategy standard: the served set. The hero
 * on a quarantined line is honestly ungraded — grading against a neighbouring
 * pairing's chart is the exact bug quarantine exists to prevent — but a bot
 * still has to ACT, and without a solution mix every quarantined pairing
 * falls through to a hard percentile cut and the table folds everything to a
 * raise. The family representative is real released data, which beats both
 * the archetype fallback and the imperfect quarantined copy.
 *
 * Every target must be a servable ref that exists on disk; a test walks the
 * quarantine list and asserts both.
 */
export const QUARANTINE_FALLBACKS: Readonly<Record<string, string>> = {
  // vs_4bet: released representatives are BB:vs_4bet_BTN, BB:vs_4bet_CO,
  // SB:vs_4bet_BTN and BTN:vs_4bet_UTG. Same hero seat first; failing that,
  // the same 4-bettor.
  "BB:vs_4bet_UTG": "BB:vs_4bet_CO",
  "BTN:vs_4bet_CO": "BTN:vs_4bet_UTG",
  "CO:vs_4bet_UTG": "BTN:vs_4bet_UTG",
  "SB:vs_4bet_CO": "SB:vs_4bet_BTN",

  // vs_3bet: the released node with the same hero seat.
  "MP:vs_3bet_SB": "MP:vs_3bet_BB",
  "MP:vs_3bet_BTN": "MP:vs_3bet_BB",
  "MP:vs_3bet_CO": "MP:vs_3bet_BB",
  "UTG:vs_3bet_BB": "UTG:vs_3bet_MP",
  "UTG:vs_3bet_SB": "UTG:vs_3bet_MP",
  "UTG:vs_3bet_BTN": "UTG:vs_3bet_MP",
  "UTG:vs_3bet_CO": "UTG:vs_3bet_MP",
};

let cachedBotIndex: SolutionIndex | null = null;

/**
 * The served index plus quarantine aliases, for the BOTS only. The grading
 * paths keep using `gradeIndex()`, so an aliased node can never grade a
 * user — it only stops a bot falling back to pure-archetype play on the
 * biggest preflop pots in the tree.
 */
function botSolutionIndex(): SolutionIndex {
  if (cachedBotIndex !== null) return cachedBotIndex;

  const served = gradeIndex();
  const nodes = new Map(served.nodes);
  for (const { ref } of QUARANTINED_NODES) {
    const representative = QUARANTINE_FALLBACKS[ref];
    if (representative === undefined) continue;
    const node = served.nodes.get(representative);
    if (node !== undefined && !nodes.has(ref)) nodes.set(ref, node);
  }

  cachedBotIndex = { nodes, refs: [...nodes.keys()].sort(), provenance: served.provenance };
  return cachedBotIndex;
}

/* ── Session lifecycle ───────────────────────────────────────────────────── */

export function createLiveSession(input: {
  presetId: PresetId;
  totalHands: number;
  stackBb: number;
  seed: string;
}): LiveSimState {
  const preset = PRESETS[input.presetId];

  // Hero always at seat 0; villains fill the rest in preset order.
  const botBySeat: (BotId | null)[] = [null, ...preset.villains];

  // Seeded once and stored: the same session id always seats the same names,
  // so a refresh mid-session does not rename the table.
  const botNames = botDisplayNames(input.seed, botBySeat);

  const base: LiveSimState = {
    presetId: input.presetId,
    totalHands: input.totalHands,
    stackBb: input.stackBb,
    heroSeat: 0,
    botBySeat,
    handNumber: 0,
    // Advanced before each deal, so hand 1 puts the button at seat 1 and it
    // rotates a full orbit every `seatCount` hands.
    button: 0,
    game: null,
    version: 0,
    records: [],
    netBbTotal: 0,
    ended: false,
    pendingGrade: null,
    pendingDecisions: [],
    botNames,
  };

  return dealNextHand(base, input.seed);
}

/**
 * Deals the next hand and runs bots up to the hero's first decision.
 *
 * Stacks reset to the configured depth every hand — a cash-game auto-rebuy.
 * That is what keeps bb/100 comparable across the session and prevents the
 * simulator turning into a bust-out tournament nobody asked for.
 */
export function dealNextHand(live: LiveSimState, sessionSeed: string): LiveSimState {
  if (live.records.length >= live.totalHands) {
    return { ...live, game: null, ended: true, version: live.version + 1 };
  }

  const handNumber = live.handNumber + 1;
  const seats = live.botBySeat.length;

  const game = advanceUntilAction(
    createGame({
      seats,
      button: (live.button + 1) % seats,
      smallBlind: 1,
      bigBlind: CHIPS_PER_BB,
      startingStacks: live.stackBb * CHIPS_PER_BB,
      // Deterministic per hand: a refresh mid-hand rebuilds NOTHING — the state
      // is stored — but a lost write can be reproduced in a postmortem.
      seed: `${sessionSeed}:hand:${handNumber}`,
    }),
  );

  let next: LiveSimState = {
    ...live,
    handNumber,
    button: (live.button + 1) % seats,
    game,
    version: live.version + 1,
    pendingGrade: null,
    pendingDecisions: [],
  };

  // The hero might not be first to act.
  const { live: afterBots } = runBots(next, `${sessionSeed}:bots:${handNumber}`);
  next = afterBots;

  // A walkover: every bot folded before the hero ever had a decision. The hand
  // is already complete, so settle and record it here — waiting for a hero
  // action that will never come is how a 50-hand session ends with 47 records.
  if (next.game !== null && next.game.complete) {
    const record = settleHand(next, null);
    next = {
      ...next,
      records: [...next.records, record],
      netBbTotal: Math.round((next.netBbTotal + record.netBb) * 1000) / 1000,
      version: next.version + 1,
    };
    return dealNextHand(next, sessionSeed);
  }

  return next;
}

/* ── The bot loop ────────────────────────────────────────────────────────── */

/**
 * Advances bots until the action is on the hero or the hand is complete.
 *
 * Runs to completion synchronously — the "thinking" delays are a client
 * animation over the returned moves, never a server sleep. A server that
 * sleeps between bot actions holds the request open and blocks the hero's
 * next input, which is precisely what the flow of this mode cannot afford.
 */
export function runBots(
  live: LiveSimState,
  seed: string,
): { live: LiveSimState; moves: BotMove[] } {
  let game = live.game;
  const moves: BotMove[] = [];
  if (game === null) return { live, moves };

  const rng = createRng(seed);
  const data = { solutions: botSolutionIndex(), templates: servedTemplates() };

  let guard = 0;
  while (!game.complete && game.actionOn !== null && game.actionOn !== live.heroSeat) {
    if (++guard > 200) throw new Error("bot loop did not terminate");

    const seat = game.actionOn;
    const botId = live.botBySeat[seat];
    if (botId == null) throw new Error(`no bot at seat ${seat}`);

    const action = getBot(botId).decide(game, seat, data, rng);
    const before = game;
    game = advanceUntilAction(applyAction(game, action));

    const event = [...game.history]
      .reverse()
      .find(
        (e): e is Extract<HandEvent, { kind: "action" }> =>
          e.kind === "action" && e.seat === seat && e.street === before.street,
      );
    if (event !== undefined) {
      // Sessions stored before names existed have no botNames; the archetype
      // name is a fallback for their remaining hands, never the normal path.
      const name = live.botNames?.[seat] ?? PROFILES[botId].name;
      moves.push({
        seat,
        botName: name,
        label: describeBotAction(name, event),
        action: event.action,
        toChips: event.amount > 0 ? event.amount : null,
        boardLen: before.board.length,
      });
    }
  }

  // The engine leaves settlement explicit: a complete hand has a pot but no
  // payouts until awardPot runs. Settle here so every caller sees paid state.
  if (game.complete && game.payouts.every((p) => p === 0) && game.pot > 0) {
    game = awardPot(game);
  }

  return { live: { ...live, game }, moves };
}

/* ── Hero actions ────────────────────────────────────────────────────────── */

export type ApplyResult =
  | { ok: true; live: LiveSimState; moves: BotMove[]; record: SimHandRecord | null }
  | { ok: false; error: "not_your_turn" | "illegal_action" | "hand_complete" };

export function applyHeroAction(
  live: LiveSimState,
  action: Action,
  sessionSeed: string,
): ApplyResult {
  const game = live.game;
  if (game === null || game.complete) return { ok: false, error: "hand_complete" };
  if (game.actionOn !== live.heroSeat) return { ok: false, error: "not_your_turn" };
  if (!isLegal(game, action)) return { ok: false, error: "illegal_action" };

  // Grade WHILE the node still describes the decision, and HOLD the results on
  // the session — the hand usually ends several actions later. Off-depth
  // sessions (tests only — setup always starts at 100bb) are play-mode: the
  // 100bb solution set does not describe a 40bb or 200bb decision, so nothing
  // is graded and nothing pretends to be.
  const decision = isGradedDepth(live.stackBb) ? heroDecisionFor(live, action) : null;
  const pendingDecisions =
    decision === null
      ? (live.pendingDecisions ?? [])
      : [...(live.pendingDecisions ?? []), decision];

  const gradeInfo =
    live.pendingGrade ??
    (decision !== null &&
    decision.street === "preflop" &&
    decision.graded &&
    decision.evLoss !== null &&
    decision.grade !== null
      ? { evLoss: decision.evLoss, grade: decision.grade }
      : null);

  let advanced = advanceUntilAction(applyAction(game, action));
  if (advanced.complete && advanced.payouts.every((p) => p === 0) && advanced.pot > 0) {
    advanced = awardPot(advanced);
  }

  let next: LiveSimState = {
    ...live,
    game: advanced,
    version: live.version + 1,
    pendingGrade: gradeInfo,
    pendingDecisions,
  };

  const { live: afterBots, moves } = runBots(
    next,
    `${sessionSeed}:bots:${live.handNumber}:${live.version}`,
  );
  next = afterBots;

  let record: SimHandRecord | null = null;
  if (next.game !== null && next.game.complete) {
    record = settleHand(next, gradeInfo);
    next = {
      ...next,
      records: [...next.records, record],
      netBbTotal: Math.round((next.netBbTotal + record.netBb) * 1000) / 1000,
      version: next.version + 1,
      pendingGrade: null,
      pendingDecisions: [],
    };
  }

  return { ok: true, live: next, moves, record };
}

interface GradeInfo {
  evLoss: number;
  grade: string;
}

/** Index of this action among the hero's action events, BEFORE it is applied. */
function heroActionIndexOf(game: GameState, heroSeat: number): number {
  return game.history.filter((e) => e.kind === "action" && e.seat === heroSeat).length;
}

function ungraded(
  street: SimDecision["street"],
  heroActionIndex: number,
  chosen: string,
  reason: string,
): SimDecision {
  return {
    street,
    heroActionIndex,
    chosen,
    graded: false,
    evLoss: null,
    grade: null,
    best: null,
    nodeRef: null,
    reason,
  };
}

/**
 * The decision record for a hero action, graded where the served set covers
 * it and honestly marked where it does not.
 *
 * Preflop grades the FIRST hero decision only, as the sim always has; postflop
 * grades every first-in-on-the-street decision a served template matches.
 * Returns null only for decisions the design does not look at (later preflop
 * actions), never as a silent skip of a modelled one.
 */
function heroDecisionFor(live: LiveSimState, action: Action): SimDecision | null {
  const game = live.game;
  if (game === null) return null;

  if (game.street === "preflop") {
    const alreadyActed = game.history.some((e) => e.kind === "action" && e.seat === live.heroSeat);
    if (alreadyActed) return null;
    return heroPreflopDecision(live, game, action);
  }

  if (game.street === "flop" || game.street === "turn" || game.street === "river") {
    return heroPostflopDecision(live, game, action);
  }

  return null;
}

/** Hero's first preflop decision, graded where a served node covers the line. */
function heroPreflopDecision(
  live: LiveSimState,
  game: GameState,
  action: Action,
): SimDecision | null {
  const index = heroActionIndexOf(game, live.heroSeat);

  // The BB checking their option is a real decision the preflop set has no
  // node for — there is no "unopened big blind" node. It used to be graded AS
  // A CALL, which scored a forced non-decision against a chart describing a
  // different spot. Honest marker instead.
  if (action.type === "check") {
    return ungraded(
      "preflop",
      index,
      "check",
      "The solution set has no node for checking your option in the big blind.",
    );
  }

  const hero = game.players[live.heroSeat];
  if (hero?.holeCards == null) return null;

  const node = preflopNodeFor(game, live.heroSeat, gradeIndex());
  if (node === null) {
    return ungraded(
      "preflop",
      index,
      action.type,
      "No served solution node covers this preflop line.",
    );
  }

  const key = handToKey(hero.holeCards[0], hero.holeCards[1]);

  // The engine speaks fold/check/call/bet/raise; the preflop set speaks
  // fold/call/raise/allin. Map conservatively and mark what does not map.
  const name: PreflopActionName | null =
    action.type === "fold"
      ? "fold"
      : action.type === "call"
        ? "call"
        : action.type === "raise" || action.type === "bet"
          ? "raise"
          : null;
  if (name === null || !node.actions.includes(name)) {
    return ungraded("preflop", index, action.type, "The node does not price this action.");
  }

  try {
    const result = gradePreflop(node, key, name);
    return {
      street: "preflop",
      heroActionIndex: index,
      chosen: name,
      graded: true,
      evLoss: result.evLoss,
      grade: result.grade,
      best: result.bestAction,
      nodeRef: node.ref,
      reason: null,
    };
  } catch {
    return ungraded("preflop", index, action.type, "The node could not grade this hand.");
  }
}

/* ── Postflop grading ────────────────────────────────────────────────────── */

/**
 * The served template that describes this postflop decision, or null.
 *
 * Matched on street + hero position + board tags + a heads-up pot of roughly
 * the template's size, plus whether the hero is facing a bet. Every gate errs
 * toward NOT matching: a graded decision claims the chart describes the spot,
 * and a template for a different pot geometry does not.
 */
export function matchPostflopTemplate(
  templates: readonly PostflopTemplate[],
  street: "flop" | "turn" | "river",
  heroPos: string,
  boardTags: readonly BoardTag[],
  facingBet: boolean,
  potBb: number,
): PostflopTemplate | null {
  const tags = new Set<string>(boardTags);

  const candidates = templates.filter(
    (t) =>
      t.street === street &&
      t.heroPos === heroPos &&
      t.boardTags.every((tag) => tags.has(tag)) &&
      // Action-shape compatibility: a facing-a-bet decision needs a template
      // that prices fold/call; a checked-to decision needs one that prices
      // check. The wrong shape is a different decision, not a near miss.
      (facingBet ? t.actions.includes("fold") : t.actions.includes("check")) &&
      // Pot geometry: a 3-bet-pot template on a single-raised pot (or vice
      // versa) prices every EV in the wrong currency. Half-to-double is loose
      // enough for the bots' sizing variety and tight enough to keep a 22bb
      // template off a 5.5bb pot.
      potBb >= t.potBb * 0.5 &&
      potBb <= t.potBb * 2,
  );

  if (candidates.length === 0) return null;

  // Deterministic choice: the most specific board match, then the fullest
  // hand-class coverage, then id order so the answer never depends on file
  // enumeration order.
  return [...candidates].sort(
    (a, b) =>
      b.boardTags.length - a.boardTags.length ||
      b.strategies.length - a.strategies.length ||
      a.id.localeCompare(b.id),
  )[0]!;
}

/**
 * Maps an engine action onto the template's action vocabulary, or null when no
 * modelled action honestly describes it (an overbet, a min-bet, a shove no
 * template prices). Null means UNGRADED, never nearest-neighbour guessing
 * beyond the tolerances written here.
 */
export function mapPostflopAction(
  action: Action,
  template: PostflopTemplate,
  potChips: number,
  facedBetChips: number,
  heroStackChips: number,
): PostflopActionName | null {
  const has = (name: PostflopActionName) => template.actions.includes(name);

  if (action.type === "fold") return has("fold") ? "fold" : null;
  if (action.type === "check") return has("check") ? "check" : null;
  if (action.type === "call") return has("call") ? "call" : null;

  if (action.type === "bet") {
    if (potChips <= 0 || action.amount === undefined) return null;
    const fraction = action.amount / potChips;
    const buckets: ReadonlyArray<[PostflopActionName, number]> = [
      ["bet_33", 0.33],
      ["bet_66", 0.66],
      ["bet_100", 1.0],
    ];
    const available = buckets.filter(([name]) => has(name));
    if (available.length === 0) return null;

    let bestName: PostflopActionName | null = null;
    let bestDistance = Infinity;
    for (const [name, target] of available) {
      const distance = Math.abs(Math.log(fraction / target));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestName = name;
      }
    }
    // A size more than ~1.6x off every modelled bucket is not that bucket.
    return bestDistance <= Math.log(1.6) ? bestName : null;
  }

  if (action.type === "raise") {
    if (action.amount === undefined) return null;
    const isAllIn = action.amount >= heroStackChips;
    if (isAllIn && has("allin")) return "allin";

    const raiseSizes: PostflopActionName[] = ["raise_small", "raise_pot"];
    const available = raiseSizes.filter(has);
    if (available.length === 0) return null;
    if (available.length === 1) return available[0]!;
    // Both sizes modelled: split on the raise multiple. A raise to under
    // ~3.2x the bet is the small one; bigger is the pot-sized one.
    return facedBetChips > 0 && action.amount < facedBetChips * 3.2 ? "raise_small" : "raise_pot";
  }

  return null;
}

/**
 * Hero's postflop decision, graded wherever a served template matches the
 * situation. Not matched → explicitly ungraded with the reason written down.
 */
function heroPostflopDecision(
  live: LiveSimState,
  game: GameState,
  action: Action,
): SimDecision | null {
  const street = game.street as "flop" | "turn" | "river";
  const index = heroActionIndexOf(game, live.heroSeat);
  const chosen = action.type;

  const hero = game.players[live.heroSeat];
  if (hero?.holeCards == null || game.board.length < 3) return null;

  // Templates model a heads-up pot. Grading a multiway decision against one
  // would price every bluff and value bet against a single range that is not
  // the field the hero faces.
  const unfolded = game.players.filter((p) => p.status !== "folded").length;
  if (unfolded > 2) {
    return ungraded(street, index, chosen, "Multiway pots are not in the strategy set.");
  }

  // Templates model the hero's first commitment of the street. Facing a
  // check-raise after betting is a different node the set does not have.
  if (hero.committedThisStreet > 0) {
    return ungraded(
      street,
      index,
      chosen,
      "Facing a raise after betting this street is not in the strategy set.",
    );
  }

  const facingBet = game.currentBet > 0;
  const boardTags = boardTexture(game.board as readonly Card[]);
  const template = matchPostflopTemplate(
    servedTemplates(),
    street,
    hero.position,
    boardTags,
    facingBet,
    chipsToBb(game.pot),
  );
  if (template === null) {
    return ungraded(street, index, chosen, "No served scenario template matches this spot.");
  }

  const handClass = classifyHand(hero.holeCards, game.board as readonly Card[]);
  const mapped = mapPostflopAction(action, template, game.pot, game.currentBet, hero.stack);
  if (mapped === null) {
    return ungraded(street, index, chosen, "The template does not price this action or size.");
  }

  try {
    const result = gradePostflop(template, handClass, mapped);
    return {
      street,
      heroActionIndex: index,
      chosen: mapped,
      graded: true,
      evLoss: result.evLoss,
      grade: result.grade,
      best: result.bestAction,
      nodeRef: template.id,
      reason: null,
    };
  } catch {
    // gradePostflop throws when the template has no row for this hand class.
    return ungraded(
      street,
      index,
      chosen,
      `The matched template has no strategy for ${handClass.replace(/_/g, " ")}.`,
    );
  }
}

function settleHand(live: LiveSimState, gradeInfo: GradeInfo | null): SimHandRecord {
  const game = live.game;
  if (game === null) throw new Error("settle called with no game");

  const hero = game.players[live.heroSeat];
  const payout = game.payouts[live.heroSeat] ?? 0;
  const committed = hero?.totalCommitted ?? 0;
  const netBb = chipsToBb(payout - committed);

  const foldedPreflop =
    hero?.status === "folded" &&
    !game.history.some(
      (e) => e.kind === "action" && e.seat === live.heroSeat && e.street !== "preflop",
    ) &&
    game.history.some(
      (e) => e.kind === "action" && e.seat === live.heroSeat && e.action === "fold",
    );

  const wonAtShowdown =
    payout > 0 && game.history.some((e) => e.kind === "showdown" && e.seat === live.heroSeat);

  // Showdown storytelling: name the hand the pot was won with. The label comes
  // from the same evaluator that settled the pot, never a re-derivation.
  const winningHandLabel =
    wonAtShowdown && hero?.holeCards != null
      ? handStrength(hero.holeCards, game.board as readonly Card[]).label
      : null;

  return {
    handNumber: live.handNumber,
    netBb,
    resultLine: resultLineFor(netBb, wonAtShowdown, foldedPreflop, winningHandLabel),
    heroEvLoss: gradeInfo?.evLoss ?? null,
    grade: gradeInfo?.grade ?? null,
    decisions: live.pendingDecisions ?? [],
  };
}

/* ── Support ─────────────────────────────────────────────────────────────── */

export function heroLegalActions(live: LiveSimState) {
  const game = live.game;
  if (game === null || game.complete || game.actionOn !== live.heroSeat) return [];
  return legalActions(game);
}

export function currentHandHistory(live: LiveSimState): HandHistory | null {
  return live.game === null ? null : toHandHistory(live.game);
}

/** Parses a client action body into an engine Action, or null. */
export function parseAction(body: unknown): Action | null {
  if (typeof body !== "object" || body === null) return null;
  const { type, amount } = body as { type?: unknown; amount?: unknown };
  if (type === "fold" || type === "check") return { type };
  if (type === "call") {
    return typeof amount === "number" && Number.isFinite(amount)
      ? { type, amount }
      : { type: "call" };
  }
  if (type === "bet" || type === "raise") {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
    return { type, amount };
  }
  return null;
}

export { describeAction, type GameState };
