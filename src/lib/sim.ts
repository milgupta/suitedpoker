import type { BotId } from "@/poker/bots";
import { PROFILES } from "@/poker/bots";
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

export type PresetId = "home_game" | "casino" | "online" | "boss";

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
  casino: {
    id: "casino",
    name: "The Casino",
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

export const PRESET_IDS: readonly PresetId[] = ["home_game", "casino", "online", "boss"];

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

export const SESSION_LENGTHS = [25, 50, 100] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export function isSessionLength(value: unknown): value is SessionLength {
  return typeof value === "number" && (SESSION_LENGTHS as readonly number[]).includes(value);
}

/* ── The live session ────────────────────────────────────────────────────── */

export interface SimHandRecord {
  readonly handNumber: number;
  /** Hero's chips out minus chips in, in bb. */
  readonly netBb: number;
  /** One compact line: "Won 12.5bb with a flush" / "Folded preflop". */
  readonly resultLine: string;
  /** EV lost on hero's first graded decision, when a solution node covered it. */
  readonly heroEvLoss: number | null;
  readonly grade: string | null;
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

/** One bot move, for the client to replay with a human-feeling delay. */
export interface BotMove {
  readonly seat: number;
  readonly botName: string;
  readonly label: string;
}

export interface ClientSimState {
  readonly sessionId: string;
  readonly presetId: PresetId;
  readonly handNumber: number;
  readonly totalHands: number;
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
  readonly legalActions: readonly ClientAction[];
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
          botName: live.botBySeat[p.seat] == null ? null : PROFILES[live.botBySeat[p.seat]!].name,
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
    version: live.version,
    street: game?.street ?? null,
    board: game === null ? [] : [...game.board],
    potBb: (game?.pot ?? 0) / 2,
    currentBet: game?.currentBet ?? 0,
    sidePots: game === null ? [] : [...game.sidePots],
    seats,
    actionOn: game?.actionOn ?? null,
    heroSeat: live.heroSeat,
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

export function resultLineFor(
  netBb: number,
  wonAtShowdown: boolean,
  foldedPreflop: boolean,
): string {
  if (foldedPreflop) return "Folded preflop";
  if (netBb > 0)
    return wonAtShowdown ? `Won ${netBb.toFixed(1)}bb at showdown` : `Won ${netBb.toFixed(1)}bb`;
  if (netBb < 0) return `Lost ${Math.abs(netBb).toFixed(1)}bb`;
  return "Chopped";
}
