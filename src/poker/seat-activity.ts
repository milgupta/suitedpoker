/**
 * Who is still in the hand, who acted, and what they did — derived from the
 * spot's action history so a drill can be drawn as an actual table.
 *
 * Pure TypeScript in `src/poker/**` so `generateSpot` can enrich seats before
 * the payload leaves the server. The client must not re-infer this for display.
 */

import type { HeroPosition } from "./solutions";

/** Six-max preflop order. Nothing in the product deals a different table. */
export const PREFLOP_ORDER: readonly HeroPosition[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

export interface SeatActivity {
  /** Their most recent action, without the position prefix: "opens 2.5bb". */
  readonly action: string | null;
  /** Never acted and cannot any more: everyone who passed before the hero. */
  readonly folded: boolean;
  /** Never acted and still could: everyone behind the hero. */
  readonly toAct: boolean;
}

const EMPTY: SeatActivity = { action: null, folded: false, toAct: false };

/**
 * Split "BTN opens 2.5bb" into the seat and what it did.
 *
 * Lines that name no position — "folded to hero" is the generator's own phrase
 * for an unopened pot — carry no seat and are skipped. They are still shown in
 * the history line beneath the table; they just cannot be pinned to a chair.
 */
function parseLine(line: string): { position: HeroPosition; action: string } | null {
  const trimmed = line.trim();
  const space = trimmed.indexOf(" ");
  if (space <= 0) return null;

  const head = trimmed.slice(0, space).toUpperCase();
  const position = PREFLOP_ORDER.find((p) => p === head);
  if (position === undefined) return null;

  const action = trimmed.slice(space + 1).trim();
  return action === "" ? null : { position, action };
}

/**
 * The last big-blind figure in an action line, as a number.
 *
 * Last, not first: "3bets to 11bb" contains a 3, and a chip of 3bb in front of
 * someone who made it eleven misprices the pot.
 */
export function parseActionBb(action: string | null): number | null {
  if (action === null) return null;
  const matches = [...action.matchAll(/(\d+(?:\.\d+)?)\s*bb\b/gi)];
  const last = matches.at(-1)?.[1];
  if (last === undefined) return null;
  const value = Number(last);
  return Number.isFinite(value) ? value : null;
}

/**
 * Chips sitting in front of a seat right now: sized action, else posted blind.
 */
export function committedBbOf(
  position: HeroPosition,
  activity: SeatActivity,
  boardCount: number,
): number | null {
  if (activity.folded) return null;
  const fromAction = parseActionBb(activity.action);
  if (fromAction !== null) return fromAction;
  if (boardCount > 0) return null;
  if (position === "SB") return 0.5;
  if (position === "BB") return 1;
  return null;
}

/**
 * The state of every seat at the table, keyed by position.
 *
 * A seat that acted shows its LAST action — "BB calls" then "BB checks" is one
 * player who has checked, and a pill listing both is a pill nobody can read.
 * The full ordered sequence stays available to the caller.
 */
export function seatActivity(
  heroPos: HeroPosition,
  actionHistory: readonly string[],
): Record<HeroPosition, SeatActivity> {
  const events = actionHistory
    .map(parseLine)
    .filter((parsed): parsed is { position: HeroPosition; action: string } => parsed !== null);

  const lastAction = new Map<HeroPosition, string>();
  const acted = new Set<HeroPosition>();
  const folded = new Set<HeroPosition>();

  /*
   * Nobody tells us who folded, so it is inferred by WALKING the betting order
   * the way the action actually travelled — never by comparing seat indices
   * against the hero's.
   */
  let pointer = 0;

  function advanceTo(target: HeroPosition): void {
    const targetIndex = PREFLOP_ORDER.indexOf(target);
    for (let step = 0; step < PREFLOP_ORDER.length; step++) {
      if (pointer === targetIndex) return;
      const seat = PREFLOP_ORDER[pointer];
      if (seat !== undefined && seat !== heroPos && !acted.has(seat)) folded.add(seat);
      pointer = (pointer + 1) % PREFLOP_ORDER.length;
    }
  }

  for (const event of events) {
    advanceTo(event.position);
    lastAction.set(event.position, event.action);
    acted.add(event.position);
    pointer = (pointer + 1) % PREFLOP_ORDER.length;
  }

  advanceTo(heroPos);

  const out = {} as Record<HeroPosition, SeatActivity>;
  for (const position of PREFLOP_ORDER) {
    const action = lastAction.get(position) ?? null;

    if (position === heroPos) {
      out[position] = { ...EMPTY, action };
      continue;
    }
    if (action !== null) {
      out[position] = { action, folded: false, toAct: false };
      continue;
    }
    out[position] = {
      action: null,
      folded: folded.has(position),
      toAct: !folded.has(position),
    };
  }

  return out;
}
