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
   *
   * The index comparison was wrong the moment a hand had two betting rounds.
   * On `MP:vs_3bet_BTN` the hero opens from MP and the button 3bets, so the
   * action has already passed CO, the small blind and the big blind before it
   * returns to the hero — all three folded. Comparing indices drew all three as
   * still to act, telling the player three opponents were live in a pot that
   * was heads-up. A table that lies about who is in the hand is worse than no
   * table.
   */
  let pointer = 0;

  function advanceTo(target: HeroPosition): void {
    const targetIndex = PREFLOP_ORDER.indexOf(target);
    for (let step = 0; step < PREFLOP_ORDER.length; step++) {
      if (pointer === targetIndex) return;
      const seat = PREFLOP_ORDER[pointer];
      // The hero is never folded by inference — they are the one deciding.
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

  // The action is on the hero now, so everyone it passed on the way here is out.
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
