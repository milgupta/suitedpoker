/**
 * No-limit hold'em betting state machine.
 *
 * Deterministic given a seed, immutable on every transition, and shared by the
 * drill engine and the bot simulator. The rules that are commonly gotten wrong
 * — min-raise sizing, all-ins that do not reopen betting, layered side pots,
 * heads-up blind order, the big blind's option, odd chips — each have a named
 * scenario in the test suite.
 *
 * Chips are integers. That is what makes "the odd chip goes left of the button"
 * a real rule rather than a rounding artefact, and it is what lets the property
 * test assert chip conservation exactly rather than approximately.
 *
 * AMOUNT CONVENTION: every `amount` is the player's TOTAL commitment for the
 * current street after the action — a raise-to, not an increment. One rule for
 * call, bet and raise alike, because two conventions in one engine is how a
 * side pot ends up off by the size of a blind.
 */

import { type Card, cardsToString, cardToString, Deck } from "./cards";
import { describeHand, evaluateHand, type HandValue } from "./evaluator";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export type Position = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

export type PlayerStatus = "active" | "folded" | "allin";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise";

export interface Action {
  readonly type: ActionType;
  readonly amount?: number;
}

export interface LegalAction {
  readonly type: ActionType;
  /** Fixed amount for `call`. */
  readonly amount?: number;
  /** Inclusive bounds for `bet` and `raise`. */
  readonly min?: number;
  readonly max?: number;
}

export interface Player {
  readonly seat: number;
  readonly position: Position;
  readonly stack: number;
  readonly committedThisStreet: number;
  readonly totalCommitted: number;
  readonly holeCards: readonly [Card, Card] | null;
  readonly status: PlayerStatus;
  /** Acted since the last full bet or raise on this street. */
  readonly hasActed: boolean;
  /** Cleared by an all-in too small to reopen the betting. */
  readonly mayRaise: boolean;
}

export interface SidePot {
  readonly amount: number;
  readonly eligibleSeats: readonly number[];
}

export type HandEvent =
  | {
      readonly kind: "post";
      readonly seat: number;
      readonly blind: "ante" | "sb" | "bb";
      readonly amount: number;
    }
  | { readonly kind: "street"; readonly street: Street; readonly board: string }
  | {
      readonly kind: "action";
      readonly seat: number;
      readonly street: Street;
      readonly action: ActionType;
      readonly amount: number;
    }
  | {
      readonly kind: "showdown";
      readonly seat: number;
      readonly hand: string;
      readonly category: string;
    }
  | {
      readonly kind: "award";
      readonly seat: number;
      readonly amount: number;
      readonly potIndex: number;
    };

export interface GameConfig {
  /** 2 to 6. Heads-up changes the blind order, so it is a real case, not an edge. */
  readonly seats: number;
  readonly button: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly ante?: number;
  readonly startingStacks: number | readonly number[];
  readonly seed: number | string;
  /** Pre-set hole cards by seat; null or absent means deal from the deck. */
  readonly holeCards?: ReadonlyArray<readonly [Card, Card] | null | undefined>;
  /** Pre-set runout, dealt flop-turn-river in order before the deck is used. */
  readonly board?: readonly Card[];
}

export interface GameState {
  readonly config: GameConfig;
  readonly players: readonly Player[];
  readonly button: number;
  readonly street: Street;
  readonly board: readonly Card[];
  readonly pot: number;
  readonly sidePots: readonly SidePot[];
  readonly currentBet: number;
  /** The minimum raise INCREMENT. `legalActions` turns it into a raise-to. */
  readonly minRaise: number;
  readonly actionOn: number | null;
  readonly lastAggressor: number | null;
  readonly history: readonly HandEvent[];
  readonly complete: boolean;
  /** Chips paid out by seat. Zero until `awardPot`. */
  readonly payouts: readonly number[];
  readonly deck: readonly Card[];
  readonly deckIndex: number;
}

/** Seat at (button + i) % seats. Heads-up, the button posts the small blind. */
const POSITIONS_BY_SEAT_COUNT: Record<number, readonly Position[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
};

const STREET_ORDER: readonly Street[] = ["preflop", "flop", "turn", "river", "showdown"];

const CARDS_DEALT_ON: Partial<Record<Street, number>> = { flop: 3, turn: 1, river: 1 };

export function positionsFor(seats: number, button: number): Position[] {
  const layout = POSITIONS_BY_SEAT_COUNT[seats];
  if (layout === undefined) throw new RangeError(`unsupported table size: ${seats}`);
  const positions = new Array<Position>(seats);
  for (let offset = 0; offset < seats; offset++) {
    positions[(button + offset) % seats] = layout[offset]!;
  }
  return positions;
}

function startingStackFor(config: GameConfig, seat: number): number {
  const { startingStacks } = config;
  if (typeof startingStacks === "number") return startingStacks;
  const stack = startingStacks[seat];
  if (stack === undefined) throw new RangeError(`no starting stack for seat ${seat}`);
  return stack;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, got ${value}`);
  }
}

// ── Construction ──────────────────────────────────────────────────────────────

export function createGame(config: GameConfig): GameState {
  const { seats, button, smallBlind, bigBlind } = config;
  if (!Number.isInteger(seats) || seats < 2 || seats > 6) {
    throw new RangeError(`seats must be 2 to 6, got ${seats}`);
  }
  if (!Number.isInteger(button) || button < 0 || button >= seats) {
    throw new RangeError(`button must be a seat index, got ${button}`);
  }
  assertInteger(smallBlind, "smallBlind");
  assertInteger(bigBlind, "bigBlind");
  assertInteger(config.ante ?? 0, "ante");
  if (bigBlind < smallBlind) throw new RangeError("bigBlind must be at least smallBlind");

  const positions = positionsFor(seats, button);

  const preset: Card[] = [];
  for (let seat = 0; seat < seats; seat++) {
    const hole = config.holeCards?.[seat];
    if (hole != null) preset.push(hole[0], hole[1]);
  }
  if (config.board !== undefined) preset.push(...config.board);
  if (new Set(preset).size !== preset.length) {
    throw new RangeError("the same card was pre-set twice");
  }

  const deckSource = new Deck();
  deckSource.shuffle(config.seed);
  deckSource.removeCards(preset);
  const shuffled = deckSource.peek();

  let drawn = 0;
  const players: Player[] = [];
  for (let seat = 0; seat < seats; seat++) {
    const stack = startingStackFor(config, seat);
    assertInteger(stack, `starting stack for seat ${seat}`);
    let holeCards = config.holeCards?.[seat] ?? null;
    if (holeCards == null) {
      const first = shuffled[drawn];
      const second = shuffled[drawn + 1];
      if (first === undefined || second === undefined) throw new RangeError("deck exhausted");
      holeCards = [first, second];
      drawn += 2;
    }
    players.push({
      seat,
      position: positions[seat]!,
      stack,
      committedThisStreet: 0,
      totalCommitted: 0,
      holeCards,
      status: stack > 0 ? "active" : "folded",
      hasActed: false,
      mayRaise: true,
    });
  }

  // An authored runout sits at the front of the queue so `advanceStreet` never
  // has to know whether a board was written down or dealt.
  const deck: readonly Card[] = [...(config.board ?? []), ...shuffled.slice(drawn)];

  const history: HandEvent[] = [];

  const ante = config.ante ?? 0;
  if (ante > 0) {
    for (const player of players) {
      if (player.status !== "active") continue;
      const posted = Math.min(ante, player.stack);
      // Antes are dead money: they never count toward calling a bet, so they
      // move totalCommitted without touching committedThisStreet.
      players[player.seat] = {
        ...player,
        stack: player.stack - posted,
        totalCommitted: player.totalCommitted + posted,
        status: player.stack - posted === 0 ? "allin" : player.status,
      };
      history.push({ kind: "post", seat: player.seat, blind: "ante", amount: posted });
    }
  }

  const smallBlindSeat = seats === 2 ? button : (button + 1) % seats;
  const bigBlindSeat = seats === 2 ? (button + 1) % seats : (button + 2) % seats;

  postBlind(players, history, smallBlindSeat, smallBlind, "sb");
  postBlind(players, history, bigBlindSeat, bigBlind, "bb");

  const currentBet = players.reduce((max, p) => Math.max(max, p.committedThisStreet), 0);
  const firstToAct = seats === 2 ? button : (bigBlindSeat + 1) % seats;

  const base: GameState = {
    config,
    players,
    button,
    street: "preflop",
    board: [],
    pot: players.reduce((sum, p) => sum + p.totalCommitted, 0),
    sidePots: [],
    currentBet,
    minRaise: bigBlind,
    actionOn: null,
    lastAggressor: null,
    history,
    complete: false,
    payouts: new Array<number>(seats).fill(0),
    deck,
    deckIndex: 0,
  };

  return settle({ ...base, actionOn: nextActorFrom(base, firstToAct, true) });
}

function postBlind(
  players: Player[],
  history: HandEvent[],
  seat: number,
  amount: number,
  blind: "sb" | "bb",
): void {
  const player = players[seat];
  if (player === undefined || player.status === "folded") return;
  const posted = Math.min(amount, player.stack);
  const stack = player.stack - posted;
  players[seat] = {
    ...player,
    stack,
    committedThisStreet: player.committedThisStreet + posted,
    totalCommitted: player.totalCommitted + posted,
    status: stack === 0 ? "allin" : player.status,
  };
  history.push({ kind: "post", seat, blind, amount: posted });
}

// ── Turn order ────────────────────────────────────────────────────────────────

/**
 * Owing chips always means acting. Having a free option only means acting if
 * there is a second player with chips to act against — otherwise a lone live
 * stack facing three all-ins would be asked to "check" into nothing.
 */
function owesAction(player: Player, currentBet: number, activeCount: number): boolean {
  if (player.status !== "active") return false;
  if (player.committedThisStreet < currentBet) return true;
  return !player.hasActed && activeCount >= 2;
}

function activeCountOf(players: readonly Player[]): number {
  let count = 0;
  for (const player of players) if (player.status === "active") count += 1;
  return count;
}

function nextActorFrom(state: GameState, startSeat: number, inclusive: boolean): number | null {
  const seats = state.players.length;
  const activeCount = activeCountOf(state.players);
  const start = inclusive ? 0 : 1;
  for (let offset = start; offset < seats + start; offset++) {
    const seat = (startSeat + offset) % seats;
    const player = state.players[seat];
    if (player !== undefined && owesAction(player, state.currentBet, activeCount)) return seat;
  }
  return null;
}

export function isStreetComplete(state: GameState): boolean {
  if (state.complete) return true;
  const activeCount = activeCountOf(state.players);
  return state.players.every((p) => !owesAction(p, state.currentBet, activeCount));
}

export function isHandComplete(state: GameState): boolean {
  return state.complete;
}

function liveSeats(state: GameState): number[] {
  return state.players.filter((p) => p.status !== "folded").map((p) => p.seat);
}

/** Recomputes the derived fields every transition has to agree on. */
function settle(state: GameState): GameState {
  const pot = state.players.reduce((sum, p) => sum + p.totalCommitted, 0);
  const sidePots = computePots(state.players);
  const live = liveSeats(state);
  if (live.length <= 1) {
    return { ...state, pot, sidePots, actionOn: null, complete: true };
  }
  const complete = state.street === "showdown";
  return { ...state, pot, sidePots, complete, actionOn: complete ? null : state.actionOn };
}

// ── Legality ──────────────────────────────────────────────────────────────────

export function legalActions(state: GameState): LegalAction[] {
  if (state.complete || state.actionOn === null) return [];
  const player = state.players[state.actionOn];
  if (player === undefined || player.status !== "active") return [];

  const actions: LegalAction[] = [];
  const toCall = state.currentBet - player.committedThisStreet;
  const maxCommitment = player.committedThisStreet + player.stack;

  if (toCall > 0) {
    actions.push({ type: "fold" });
    actions.push({ type: "call", amount: Math.min(state.currentBet, maxCommitment) });
  } else {
    actions.push({ type: "check" });
  }

  if (player.mayRaise && maxCommitment > state.currentBet) {
    if (state.currentBet === 0) {
      const min = Math.min(state.config.bigBlind, maxCommitment);
      actions.push({ type: "bet", min, max: maxCommitment });
    } else {
      const min = Math.min(state.currentBet + state.minRaise, maxCommitment);
      actions.push({ type: "raise", min, max: maxCommitment });
    }
  }

  return actions;
}

export function isLegal(state: GameState, action: Action): boolean {
  return findLegal(state, action) !== undefined;
}

function findLegal(state: GameState, action: Action): LegalAction | undefined {
  for (const legal of legalActions(state)) {
    if (legal.type !== action.type) continue;
    if (legal.type === "fold" || legal.type === "check") return legal;
    if (action.amount === undefined || !Number.isInteger(action.amount)) return undefined;
    if (legal.type === "call") return action.amount === legal.amount ? legal : undefined;
    if (action.amount >= (legal.min ?? 0) && action.amount <= (legal.max ?? 0)) return legal;
    return undefined;
  }
  return undefined;
}

export function describeAction(action: Action): string {
  return action.amount === undefined ? action.type : `${action.type} ${action.amount}`;
}

// ── Transitions ───────────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: Action): GameState {
  if (state.complete) throw new Error("the hand is already complete");
  if (state.actionOn === null) throw new Error("the street is complete — advance it first");
  if (findLegal(state, action) === undefined) {
    throw new Error(
      `illegal action ${describeAction(action)}; legal: ${legalActions(state)
        .map((a) => `${a.type}${a.amount ?? ""}${a.min !== undefined ? `[${a.min}-${a.max}]` : ""}`)
        .join(", ")}`,
    );
  }

  const seat = state.actionOn;
  const actor = state.players[seat]!;
  const players = [...state.players];
  const history: HandEvent[] = [
    ...state.history,
    { kind: "action", seat, street: state.street, action: action.type, amount: action.amount ?? 0 },
  ];

  let currentBet = state.currentBet;
  let minRaise = state.minRaise;
  let lastAggressor = state.lastAggressor;

  if (action.type === "fold") {
    players[seat] = { ...actor, status: "folded", hasActed: true, mayRaise: false };
  } else if (action.type === "check") {
    players[seat] = { ...actor, hasActed: true, mayRaise: false };
  } else {
    const target = action.amount!;
    const chips = target - actor.committedThisStreet;
    const stack = actor.stack - chips;
    players[seat] = {
      ...actor,
      stack,
      committedThisStreet: target,
      totalCommitted: actor.totalCommitted + chips,
      status: stack === 0 ? "allin" : "active",
      hasActed: true,
      mayRaise: false,
    };

    if (action.type !== "call") {
      const increment = target - currentBet;
      const fullRaise = increment >= (currentBet === 0 ? state.config.bigBlind : minRaise);
      currentBet = target;
      lastAggressor = seat;

      for (let other = 0; other < players.length; other++) {
        if (other === seat) continue;
        const player = players[other]!;
        if (player.status !== "active") continue;
        if (fullRaise) {
          players[other] = { ...player, hasActed: false, mayRaise: true };
        } else if (player.hasActed) {
          // An all-in short of a full raise owes everyone a call-or-fold, but
          // reopens the betting for nobody who has already acted.
          players[other] = { ...player, hasActed: false, mayRaise: false };
        }
      }

      if (fullRaise) minRaise = increment;
    }
  }

  const moved: GameState = { ...state, players, history, currentBet, minRaise, lastAggressor };
  return settle({ ...moved, actionOn: nextActorFrom(moved, seat, false) });
}

export function advanceStreet(state: GameState): GameState {
  if (state.complete) throw new Error("the hand is already complete");
  if (!isStreetComplete(state)) throw new Error("the street is not complete");

  const nextIndex = STREET_ORDER.indexOf(state.street) + 1;
  const street = STREET_ORDER[nextIndex];
  if (street === undefined) throw new Error(`no street follows ${state.street}`);

  const deal = CARDS_DEALT_ON[street] ?? 0;
  const board = [...state.board];
  let deckIndex = state.deckIndex;
  for (let i = 0; i < deal; i++) {
    const card = state.deck[deckIndex];
    if (card === undefined) throw new RangeError("deck exhausted dealing the board");
    board.push(card);
    deckIndex += 1;
  }

  const players = state.players.map((player) => ({
    ...player,
    committedThisStreet: 0,
    hasActed: false,
    mayRaise: player.status === "active",
  }));

  const opened: GameState = {
    ...state,
    players,
    street,
    board,
    deckIndex,
    currentBet: 0,
    minRaise: state.config.bigBlind,
    lastAggressor: null,
    history: [...state.history, { kind: "street", street, board: cardsToString(board) }],
    actionOn: null,
  };

  if (street === "showdown") return settle({ ...opened, complete: true });

  // Postflop the action starts left of the button; heads-up that is the big
  // blind, which is the same seat by this arithmetic.
  const first = (state.button + 1) % players.length;
  return settle({ ...opened, actionOn: nextActorFrom(opened, first, true) });
}

/** Runs streets out until someone has to act again or the hand is over. */
export function advanceUntilAction(state: GameState): GameState {
  let next = state;
  while (!next.complete && next.actionOn === null) next = advanceStreet(next);
  return next;
}

// ── Pots ──────────────────────────────────────────────────────────────────────

export function computePots(players: readonly Player[]): SidePot[] {
  const levels = [...new Set(players.map((p) => p.totalCommitted))]
    .filter((level) => level > 0)
    .sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = players.filter((p) => p.totalCommitted >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (amount === 0) continue;

    const eligibleSeats = contributors.filter((p) => p.status !== "folded").map((p) => p.seat);
    const last = pots[pots.length - 1];
    if (eligibleSeats.length === 0) {
      // Only reachable if every contributor at this level folded; their chips
      // belong to the pot below rather than to nobody.
      if (last !== undefined) pots[pots.length - 1] = { ...last, amount: last.amount + amount };
      continue;
    }
    if (last !== undefined && sameSeats(last.eligibleSeats, eligibleSeats)) {
      pots[pots.length - 1] = { ...last, amount: last.amount + amount };
      continue;
    }
    pots.push({ amount, eligibleSeats });
  }
  return pots;
}

function sameSeats(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((seat, index) => seat === b[index]);
}

export function awardPot(state: GameState): GameState {
  if (!state.complete) throw new Error("cannot award a pot before the hand is complete");

  const payouts = new Array<number>(state.players.length).fill(0);
  const history = [...state.history];
  const live = liveSeats(state);

  const values = new Map<number, HandValue>();
  if (live.length > 1) {
    for (const seat of live) {
      const player = state.players[seat]!;
      if (player.holeCards === null) throw new Error(`seat ${seat} reached showdown without cards`);
      const value = evaluateHand([...player.holeCards, ...state.board]);
      values.set(seat, value);
      const { category, ranks } = describeHand(value);
      history.push({
        kind: "showdown",
        seat,
        hand: cardsToString([...player.holeCards, ...state.board]),
        category: `${category} ${ranks.join("")}`,
      });
    }
  }

  state.sidePots.forEach((pot, potIndex) => {
    const contenders = pot.eligibleSeats.filter((seat) => live.includes(seat));
    if (contenders.length === 0) return;

    let winners: number[] = [...contenders];
    if (contenders.length > 1) {
      let best = -1;
      winners = [];
      for (const seat of contenders) {
        const value: number = values.get(seat) ?? -1;
        if (value > best) {
          best = value;
          winners = [seat];
        } else if (value === best) {
          winners.push(seat);
        }
      }
    }

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    const ordered = clockwiseFromButton(winners, state.button, state.players.length);
    for (const seat of ordered) {
      let paid = share;
      if (remainder > 0) {
        paid += 1;
        remainder -= 1;
      }
      payouts[seat] = (payouts[seat] ?? 0) + paid;
      if (paid > 0) history.push({ kind: "award", seat, amount: paid, potIndex });
    }
  });

  const players = state.players.map((player) => ({
    ...player,
    stack: player.stack + (payouts[player.seat] ?? 0),
  }));

  return { ...state, players, payouts, history };
}

/** Odd chips go to the first winner left of the button. */
function clockwiseFromButton(
  seats: readonly number[],
  button: number,
  tableSize: number,
): number[] {
  return [...seats].sort(
    (a, b) =>
      ((a - button - 1 + tableSize) % tableSize) - ((b - button - 1 + tableSize) % tableSize),
  );
}

// ── Serialisation ─────────────────────────────────────────────────────────────

export interface HandHistory {
  readonly seed: number | string;
  readonly seats: number;
  readonly button: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly ante: number;
  readonly positions: readonly Position[];
  readonly startingStacks: readonly number[];
  readonly holeCards: readonly (string | null)[];
  readonly board: string;
  readonly events: readonly HandEvent[];
  readonly pots: readonly SidePot[];
  readonly payouts: readonly number[];
  readonly finalStacks: readonly number[];
}

export function toHandHistory(state: GameState): HandHistory {
  return {
    seed: state.config.seed,
    seats: state.players.length,
    button: state.button,
    smallBlind: state.config.smallBlind,
    bigBlind: state.config.bigBlind,
    ante: state.config.ante ?? 0,
    positions: state.players.map((p) => p.position),
    startingStacks: state.players.map((p) => startingStackFor(state.config, p.seat)),
    holeCards: state.players.map((p) =>
      p.holeCards === null ? null : p.holeCards.map(cardToString).join(""),
    ),
    board: cardsToString(state.board),
    events: state.history,
    pots: state.sidePots,
    payouts: state.payouts,
    finalStacks: state.players.map((p) => p.stack),
  };
}
