import "server-only";

import { createRng } from "@/poker/cards";
import { getBot, preflopNodeFor, type BotData, type BotId } from "@/poker/bots";
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
  type HandHistory,
} from "@/poker/gamestate";
import { grade as gradePreflop } from "@/poker/grader";
import { handToKey } from "@/poker/range";
import { buildSolutionIndex, type PreflopActionName, type SolutionIndex } from "@/poker/solutions";
import { loadAllSolutionData, loadSolutionData } from "@/lib/solution-data";
import {
  describeBotAction,
  PRESETS,
  resultLineFor,
  type BotMove,
  type LiveSimState,
  type PresetId,
  type SimHandRecord,
} from "@/lib/sim";

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

/**
 * Bots get the FULL preflop set (quarantine included) plus postflop templates.
 *
 * Quarantined vs_3bet files are imperfect copies, but they are still a real
 * mix — without them every missing pairing falls through to a hard percentile
 * cut and the table folds everything to a raise. Templates are what make
 * postflop continue rates look like poker instead of a strength coin-flip.
 */
let cachedBotData: BotData | null = null;

function botData(): BotData {
  if (cachedBotData === null) {
    const all = loadAllSolutionData();
    cachedBotData = {
      solutions: buildSolutionIndex(all.preflop),
      templates: all.postflop,
    };
  }
  return cachedBotData;
}

/* ── Session lifecycle ───────────────────────────────────────────────────── */

export function createLiveSession(input: {
  presetId: PresetId;
  totalHands: number;
  stackBb: number;
  seed: string;
}): LiveSimState {
  const preset = PRESETS[input.presetId];
  const seatCount = preset.villains.length + 1;

  // Hero always at seat 0; villains fill the rest in preset order.
  const botBySeat: (BotId | null)[] = [null, ...preset.villains];

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
  };

  void seatCount;
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
  const button = (live.button % seats) + 1 === seats ? 0 : live.button % seats;

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

  void button;

  let next: LiveSimState = {
    ...live,
    handNumber,
    button: (live.button + 1) % seats,
    game,
    version: live.version + 1,
    pendingGrade: null,
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
  const data = botData();

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
      .find((e) => e.kind === "action" && e.seat === seat && e.street === before.street);
    if (event !== undefined) {
      moves.push({
        seat,
        botName: PROFILES[botId].name,
        label: describeBotAction(PROFILES[botId].name, event),
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

  // Grade the hero's FIRST preflop decision while the node still describes it,
  // and HOLD it on the session — the hand usually ends several actions later.
  const gradeInfo = live.pendingGrade ?? heroPreflopGrade(live, action);

  let advanced = advanceUntilAction(applyAction(game, action));
  if (advanced.complete && advanced.payouts.every((p) => p === 0) && advanced.pot > 0) {
    advanced = awardPot(advanced);
  }

  let next: LiveSimState = {
    ...live,
    game: advanced,
    version: live.version + 1,
    pendingGrade: gradeInfo,
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
    };
  }

  return { ok: true, live: next, moves, record };
}

interface GradeInfo {
  evLoss: number;
  grade: string;
}

/**
 * Hero's preflop decision, graded against the solution set where a node covers
 * the line. Only the FIRST hero decision of the hand is graded — the flow-mode
 * indicator is a nudge, not a full review, and 6.3 does the real analysis.
 */
function heroPreflopGrade(live: LiveSimState, action: Action): GradeInfo | null {
  const game = live.game;
  if (game === null || game.street !== "preflop") return null;

  const alreadyActed = game.history.some((e) => e.kind === "action" && e.seat === live.heroSeat);
  if (alreadyActed) return null;

  const node = preflopNodeFor(game, live.heroSeat, gradeIndex());
  if (node === null) return null;

  const hero = game.players[live.heroSeat];
  if (hero?.holeCards == null) return null;

  const key = handToKey(hero.holeCards[0], hero.holeCards[1]);

  // The engine speaks fold/check/call/bet/raise; the preflop set speaks
  // fold/call/raise/allin. Map conservatively and skip what does not map.
  const name: PreflopActionName | null =
    action.type === "fold"
      ? "fold"
      : action.type === "call" || action.type === "check"
        ? "call"
        : action.type === "raise" || action.type === "bet"
          ? "raise"
          : null;
  if (name === null || !node.actions.includes(name)) return null;

  try {
    const result = gradePreflop(node, key, name);
    return { evLoss: result.evLoss, grade: result.grade };
  } catch {
    return null;
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

  return {
    handNumber: live.handNumber,
    netBb,
    resultLine: resultLineFor(netBb, wonAtShowdown, foldedPreflop),
    heroEvLoss: gradeInfo?.evLoss ?? null,
    grade: gradeInfo?.grade ?? null,
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
