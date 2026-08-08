/**
 * Who is still in the hand, who acted, and what they did — derived from the
 * spot's action history so a drill can be drawn as an actual table.
 *
 * The drill screen used to state the situation as one line of prose: "UTG opens
 * 2.5bb · MP 3bets to 11bb". That is a correct description of a poker hand and
 * a terrible presentation of one — it asks the reader to build the table in
 * their head before they can think about the decision, which is precisely the
 * work a beginner cannot yet do quickly. Every poker interface ever shipped
 * shows a table because the table IS the information.
 *
 * Pure, so "who folded" is arithmetic in a unit test rather than something you
 * confirm by squinting at a screenshot.
 */

import type { HeroPosition } from "@/poker/solutions";

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
  const acted = new Map<HeroPosition, string>();
  for (const line of actionHistory) {
    const parsed = parseLine(line);
    if (parsed !== null) acted.set(parsed.position, parsed.action);
  }

  const heroIndex = PREFLOP_ORDER.indexOf(heroPos);

  const out = {} as Record<HeroPosition, SeatActivity>;
  for (const position of PREFLOP_ORDER) {
    if (position === heroPos) {
      out[position] = { ...EMPTY, action: acted.get(position) ?? null };
      continue;
    }

    const action = acted.get(position) ?? null;
    if (action !== null) {
      out[position] = { action, folded: false, toAct: false };
      continue;
    }

    /*
     * Nobody tells us who folded, so it is inferred from turn order, which is
     * the same inference a player makes looking at a real table: the seats in
     * front of you that said nothing are out, the seats behind you have not
     * spoken yet. Getting this backwards would draw a table that lies about
     * who is still in the hand.
     */
    const index = PREFLOP_ORDER.indexOf(position);
    out[position] = { action: null, folded: index < heroIndex, toAct: index > heroIndex };
  }

  return out;
}
