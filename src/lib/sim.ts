import type { BotId } from "@/poker/bots";
import { botNamesFor } from "@/poker/bot-names";
import type { GameState, HandEvent, LegalAction, SidePot, Street } from "@/poker/gamestate";

/**
 * The table simulator's shared vocabulary: presets, the serialisable session,
 * and — most importantly — the CLIENT VIEW.
 *
 * The view is the security boundary of this mode. The authoritative GameState
 * holds every villain's hole cards and the entire remaining DECK; a client
 * that ever receives either can read the runout before it happens. This is the
 * same leak class as the drill answers and matters just as much, so the view
 * is built by explicit construction — never by spreading the state and
 * deleting fields, which silently re-leaks the next field someone adds.
 */

/* ── Presets ─────────────────────────────────────────────────────────────── */

/**
 * "cardroom", not "casino".
 *
 * Same table to a player, and it is what a poker room is actually called — but
 * "casino" is a word Meta's ad review and Stripe's risk team both score, and
 * this id reaches the UI as a label. Renamed in 9.6; any stored `casino` value
 * falls back to the default preset rather than erroring.
 */
export type PresetId = "home_game" | "cardroom" | "online" | "boss";

export interface TablePreset {
  readonly id: PresetId;
  readonly name: string;
  /** Villains, seated clockwise from the hero. */
  readonly villains: readonly BotId[];
  /** What playing this table teaches — shown on the setup screen. */
  readonly teaches: string;
}

export const PRESETS: Record<PresetId, TablePreset> = {
  home_game: {
    id: "home_game",
    name: "The Home Game",
    villains: ["station", "station", "nit", "maniac", "tag"],
    teaches:
      "Value betting big against players who cannot fold, and staying out of the maniac's way.",
  },
  cardroom: {
    id: "cardroom",
    name: "The Cardroom",
    villains: ["station", "station", "station", "nit", "tag"],
    teaches:
      "Live $1/$2 in miniature: bet your good hands bigger, and stop bluffing the unbluffable.",
  },
  online: {
    id: "online",
    name: "The Online Table",
    villains: ["tag", "tag", "tag", "tag"],
    teaches: "Tighter, more aggressive opponents. Position and hand selection start mattering.",
  },
  boss: {
    id: "boss",
    name: "The Boss",
    villains: ["gto", "gto", "gto", "gto", "gto"],
    teaches: "Five unexploitable opponents. The only edge left is not making mistakes.",
  },
};

export const PRESET_IDS: readonly PresetId[] = ["home_game", "cardroom", "online", "boss"];

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

export const SESSION_LENGTHS = [25, 50, 100] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export function isSessionLength(value: unknown): value is SessionLength {
  return typeof value === "number" && (SESSION_LENGTHS as readonly number[]).includes(value);
}

/* ── Stack depth ─────────────────────────────────────────────────────────── */

/**
 * The solution set is solved (well, authored) at exactly 100bb. Other depths
 * are PLAY modes: the engine deals and settles them fine, but grading a 40bb
 * decision against a 100bb chart would be confidently wrong, so off-depth
 * sessions carry no grades at all and the UI says so in plain words.
 */
export const STACK_DEPTHS = [40, 100, 200] as const;
export type StackDepth = (typeof STACK_DEPTHS)[number];

export const GRADED_STACK_BB = 100;

export function isStackDepth(value: unknown): value is StackDepth {
  return typeof value === "number" && (STACK_DEPTHS as readonly number[]).includes(value);
}

export function isGradedDepth(stackBb: number): boolean {
  return stackBb === GRADED_STACK_BB;
}

/** The sentence every off-depth surface shows. One copy, imported everywhere. */
export const UNGRADED_DEPTH_NOTICE = "Ungraded — the strategy set is calibrated at 100bb.";

/* ── The live session ────────────────────────────────────────────────────── */

/**
 * One hero decision, graded or honestly not.
 *
 * `graded: false` is a first-class outcome, never a silent skip: a decision
 * the strategy set does not model (a multiway pot, a big-blind check, an
 * overbet no template prices) carries a written `reason` instead of a guess.
 */
export interface SimDecision {
  readonly street: "preflop" | "flop" | "turn" | "river";
  /**
   * Index among the hero's action events in the hand history, so the review
   * replay can attach this decision to the exact step it happened on.
   */
  readonly heroActionIndex: number;
  /** Solution-vocabulary action (`bet_33`), or the engine verb when unmapped. */
  readonly chosen: string;
  readonly graded: boolean;
  readonly evLoss: number | null;
  readonly grade: string | null;
  /** The best action, stored at grade time — the review never recomputes it. */
  readonly best: string | null;
  /** The node ref or template id that graded it. */
  readonly nodeRef: string | null;
  /** Why the decision is not graded, when `graded` is false. */
  readonly reason: string | null;
}

export interface SimHandRecord {
  readonly handNumber: number;
  /** Hero's chips out minus chips in, in bb. */
  readonly netBb: number;
  /** One compact line: "Won 12.5bb with a flush" / "Folded preflop". */
  readonly resultLine: string;
  /** EV lost on hero's first graded decision, when a solution node covered it. */
  readonly heroEvLoss: number | null;
  readonly grade: string | null;
  /**
   * Every hero decision this hand that grading looked at, preflop and
   * postflop. Absent on rows written before postflop grading existed and on
   * off-depth play-mode sessions — both read as "nothing graded beyond the
   * legacy preflop fields".
   */
  readonly decisions?: readonly SimDecision[];
}

/**
 * Everything the server needs to continue the session. Stored verbatim in
 * `sim_sessions.live_state` (durable) and mirrored to the sessionstore (fast).
 * Plain JSON throughout — a Map or a class instance here breaks the cold-start
 * resume, which is the whole reason the column exists.
 */
export interface LiveSimState {
  readonly presetId: PresetId;
  readonly totalHands: number;
  readonly stackBb: number;
  readonly heroSeat: number;
  /** Bot id by seat; null at the hero's seat. */
  readonly botBySeat: readonly (BotId | null)[];
  readonly handNumber: number;
  readonly button: number;
  /** The engine state of the in-progress hand. Null between hands. */
  readonly game: GameState | null;
  /** Monotonic. The client echoes it back; a mismatch is a stale or duplicate submit. */
  readonly version: number;
  readonly records: readonly SimHandRecord[];
  readonly netBbTotal: number;
  readonly ended: boolean;
  /**
   * The grade of the hero's first preflop decision THIS hand, held until
   * settlement. It has to live here: the hand usually ends several actions
   * after the graded one, and a grade recomputed at settlement time would be
   * grading a decision the node no longer describes.
   */
  readonly pendingGrade: { evLoss: number; grade: string } | null;
  /**
   * Every decision recorded THIS hand, attached to the record at settlement.
   * Optional because live states stored before this field existed resume
   * mid-hand; absent reads as "none recorded yet".
   */
  readonly pendingDecisions?: readonly SimDecision[];
  /**
   * Seat-indexed display names for the bots ("Marcus"), seeded from the
   * session id at creation so a refresh keeps the table's names. Null at the
   * hero's seat. Optional because live states stored before the field existed
   * resume mid-session; readers fall back to `botDisplayNames(sessionId, …)`.
   */
  readonly botNames?: readonly (string | null)[];
}

/* ── Bot display names ───────────────────────────────────────────────────── */

/**
 * Display names by seat, deterministic in the seed. In production the seed is
 * the session id, so the same session always seats the same names — the whole
 * point of seeding rather than randomising per render.
 */
export function botDisplayNames(
  seed: string,
  botBySeat: readonly (BotId | null)[],
): (string | null)[] {
  const villains = botBySeat.filter((b) => b !== null).length;
  const names = botNamesFor(seed, villains);
  let next = 0;
  return botBySeat.map((bot) => (bot === null ? null : (names[next++] ?? null)));
}

/* ── The client view ─────────────────────────────────────────────────────── */

export interface ClientSeat {
  readonly seat: number;
  readonly position: string;
  readonly stackBb: number;
  readonly committedBb: number;
  readonly status: string;
  readonly isHero: boolean;
  readonly botName: string | null;
  /** Hero always; villains ONLY at a showdown they reached unfolded. */
  readonly holeCards: readonly number[] | null;
}

export interface ClientAction {
  readonly type: string;
  readonly min?: number;
  readonly max?: number;
  readonly amount?: number;
}

/**
 * One bot move, for the client to replay with a human-feeling delay.
 *
 * The metadata exists so the replay is honest: the server's returned state is
 * FINAL, and a client that renders it while the moves are still "thinking"
 * shows a 3-bet's chips before the 3-bet happens. With the engine's own
 * TO-amount and street on each move, the client can hold the previous
 * picture and advance it move by move instead.
 */
export interface BotMove {
  readonly seat: number;
  readonly botName: string;
  readonly label: string;
  /** Engine verb: fold / check / call / bet / raise. */
  readonly action?: string;
  /** TO-amount in CHIPS for call/bet/raise, null for fold/check. */
  readonly toChips?: number | null;
  /** Board cards already dealt when this move was made. */
  readonly boardLen?: number;
}

export interface ClientSimState {
  readonly sessionId: string;
  readonly presetId: PresetId;
  readonly handNumber: number;
  readonly totalHands: number;
  /** Configured depth in bb — the play screen shows the ungraded notice off it. */
  readonly stackBb: number;
  readonly version: number;
  readonly street: Street | null;
  readonly board: readonly number[];
  readonly potBb: number;
  /** In chips, like the legal-action amounts. Public information. */
  readonly currentBet: number;
  readonly sidePots: readonly SidePot[];
  readonly seats: readonly ClientSeat[];
  readonly actionOn: number | null;
  readonly heroSeat: number;
  /** Which seat wears the dealer button this hand. Null between hands. */
  readonly buttonSeat: number | null;
  readonly legalActions: readonly ClientAction[];
  /**
   * True when the completed hand reached a showdown. Public information — the
   * reveal itself still goes through `mayReveal`, per seat.
   */
  readonly wentToShowdown: boolean;
  /**
   * Chips paid out by seat, in bb, once the hand is complete (empty before).
   * Public at settlement: everyone at a table sees who dragged the pot. The
   * client uses it to name the winner and count the pot across.
   */
  readonly payoutsBb: readonly number[];
  readonly handComplete: boolean;
  readonly sessionComplete: boolean;
  readonly lastResult: SimHandRecord | null;
  readonly netBbTotal: number;
  readonly handsPlayed: number;
  readonly records: readonly SimHandRecord[];
}

/**
 * The keys that must never appear anywhere in a serialised client payload.
 * `deck` is the big one: with the deck, the client knows the runout.
 */
export const FORBIDDEN_IN_CLIENT_PAYLOAD = ["deck", "deckIndex", "holeCards"] as const;

/** Seats whose cards a client may see: hero, plus showdown reachers. */
function mayReveal(state: GameState, seat: number, heroSeat: number): boolean {
  if (seat === heroSeat) return true;
  if (!state.complete) return false;

  const player = state.players[seat];
  if (player === undefined || player.status === "folded") return false;

  // A hand that ended by folds has no showdown; nobody else's cards are shown.
  return state.history.some((e) => e.kind === "showdown" && e.seat === seat);
}

export function toClientSimState(
  sessionId: string,
  live: LiveSimState,
  legal: readonly LegalAction[],
  lastResult: SimHandRecord | null,
): ClientSimState {
  const game = live.game;

  // Seeded display names: stored on the live state at creation, derived from
  // the session id for states stored before the field existed. Both are the
  // same arithmetic over the same seed, so a resume never renames the table.
  const names = live.botNames ?? botDisplayNames(sessionId, live.botBySeat);

  // The engine speaks integer chips (2 per bb); the client speaks bb.
  const seats: ClientSeat[] =
    game === null
      ? []
      : game.players.map((p) => ({
          seat: p.seat,
          position: p.position,
          stackBb: p.stack / 2,
          committedBb: p.committedThisStreet / 2,
          status: p.status,
          isHero: p.seat === live.heroSeat,
          botName: live.botBySeat[p.seat] == null ? null : (names[p.seat] ?? null),
          holeCards:
            p.holeCards !== null && mayReveal(game, p.seat, live.heroSeat)
              ? [...p.holeCards]
              : null,
        }));

  return {
    sessionId,
    presetId: live.presetId,
    handNumber: live.handNumber,
    totalHands: live.totalHands,
    stackBb: live.stackBb,
    version: live.version,
    street: game?.street ?? null,
    board: game === null ? [] : [...game.board],
    potBb: (game?.pot ?? 0) / 2,
    currentBet: game?.currentBet ?? 0,
    sidePots: game === null ? [] : [...game.sidePots],
    seats,
    actionOn: game?.actionOn ?? null,
    heroSeat: live.heroSeat,
    buttonSeat: game?.button ?? null,
    wentToShowdown:
      game !== null && game.complete && game.history.some((e) => e.kind === "showdown"),
    payoutsBb: game !== null && game.complete ? game.payouts.map((p) => p / 2) : [],
    // Amounts stay in CHIPS on the wire: the client sends actions back in the
    // same unit it received, so nothing on either side multiplies by two in
    // just one direction. Display formatting divides at the last moment.
    legalActions: legal.map((a) => ({
      type: a.type,
      ...(a.min !== undefined ? { min: a.min } : {}),
      ...(a.max !== undefined ? { max: a.max } : {}),
      ...(a.amount !== undefined ? { amount: a.amount } : {}),
    })),
    handComplete: game?.complete ?? true,
    sessionComplete: live.ended,
    lastResult,
    netBbTotal: live.netBbTotal,
    handsPlayed: live.records.length,
    records: live.records,
  };
}

/* ── Result lines ────────────────────────────────────────────────────────── */

export function describeBotAction(botName: string, event: HandEvent): string {
  if (event.kind !== "action") return "";
  switch (event.action) {
    case "fold":
      return `${botName} folds`;
    case "check":
      return `${botName} checks`;
    case "call":
      return `${botName} calls`;
    case "bet":
      return `${botName} bets ${event.amount / 2}bb`;
    case "raise":
      return `${botName} raises to ${event.amount / 2}bb`;
  }
}

/**
 * "a flush" / "two pair" — the hand-strength label as it reads mid-sentence.
 * "High card" is omitted rather than forced into a phrase; "won at showdown
 * with high card" reads as the app mocking the player.
 */
const HAND_PHRASES: Record<string, string> = {
  Pair: "a pair",
  "Two pair": "two pair",
  "Three of a kind": "three of a kind",
  Straight: "a straight",
  Flush: "a flush",
  "Full house": "a full house",
  "Four of a kind": "four of a kind",
  "Straight flush": "a straight flush",
  "Royal flush": "a royal flush",
};

export function resultLineFor(
  netBb: number,
  wonAtShowdown: boolean,
  foldedPreflop: boolean,
  winningHandLabel: string | null = null,
): string {
  if (foldedPreflop) return "Folded preflop";
  if (netBb > 0) {
    if (!wonAtShowdown) return `Won ${netBb.toFixed(1)}bb`;
    const phrase = winningHandLabel === null ? undefined : HAND_PHRASES[winningHandLabel];
    return phrase === undefined
      ? `Won ${netBb.toFixed(1)}bb at showdown`
      : `Won ${netBb.toFixed(1)}bb with ${phrase}`;
  }
  if (netBb < 0) return `Lost ${Math.abs(netBb).toFixed(1)}bb`;
  return "Chopped";
}
