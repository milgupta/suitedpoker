/**
 * Plain-English situation copy for drill surfaces.
 *
 * A drill surface without a situation line asks the player to reconstruct the
 * hand from pot size and seat opacity. Beginners cannot do that quickly — and the
 * demo hand is the worst place to discover it. Pure so every phrase is unit-
 * tested and compliance-scannable.
 */

import type { HeroPosition } from "@/poker/solutions";
import { betAmountOf } from "@/lib/bet-chip";
import { amountFromBb } from "@/lib/units";
import type { SeatActivity } from "@/lib/spot-seats";

/** Spelled-out seat names. Abbreviations stay on the pills; prose spells them. */
export const POSITION_NAME: Record<HeroPosition, string> = {
  UTG: "under the gun (UTG)",
  MP: "middle position (MP)",
  CO: "the cutoff (CO)",
  BTN: "the button (BTN)",
  SB: "the small blind (SB)",
  BB: "the big blind (BB)",
};

export function positionName(pos: HeroPosition): string {
  return POSITION_NAME[pos];
}

/** Rewrite generator phrases into something a beginner can read. */
export function formatHistoryLine(line: string, heroPos?: HeroPosition): string {
  const trimmed = line.trim();
  // UTG acts first preflop — nobody has folded yet, and saying they have
  // contradicts the table right above this line.
  if (trimmed === "folded to hero") {
    return heroPos === "UTG" ? "You're first to act" : "Everyone folded to you";
  }
  if (/^everyone checks$/i.test(trimmed)) return "Everyone checked";

  // "UTG opens 2.5bb" → keep structure, normalise spacing.
  return trimmed.replace(/\s+/g, " ");
}

export function formatActionHistory(history: readonly string[], heroPos?: HeroPosition): string {
  if (history.length === 0) return "Blinds are posted. Action is on you.";
  return history.map((line) => formatHistoryLine(line, heroPos)).join(" · ");
}

/**
 * One-line "what is this decision?" — always shown above the table.
 */
export function situationLine(
  heroPos: HeroPosition,
  actionHistory: readonly string[],
  boardCount: number,
): string {
  const where = positionName(heroPos);

  if (boardCount >= 3) {
    const street = boardCount === 3 ? "flop" : boardCount === 4 ? "turn" : "river";
    return `You are in ${where} on the ${street}. Pick an action.`;
  }

  const joined = actionHistory.join(" | ").toLowerCase();

  if (actionHistory.length === 0 || actionHistory.every((l) => l === "folded to hero")) {
    const openerIntro =
      heroPos === "UTG"
        ? `You're first to act from ${where}`
        : `Everyone folded to you in ${where}`;
    return `${openerIntro}. Open-raise, fold, or call (limp) — you can't check (the big blind is already a bet).`;
  }

  if (joined.includes("4bet")) {
    return `You're in a 4-bet pot from ${where}. This is a big decision — fold, call, or shove only as the buttons allow.`;
  }

  if (joined.includes("3bet")) {
    const threeBettor = firstNamedPosition(actionHistory, /3bet/i);
    if (threeBettor !== null && threeBettor !== heroPos) {
      return `${positionName(threeBettor)} 3-bet. Action is back on you in ${where}.`;
    }
    return `You face a 3-bet from ${where}. Choose carefully — stacks matter here.`;
  }

  const opener = firstNamedPosition(actionHistory, /opens?/i);
  if (opener !== null && opener !== heroPos) {
    return `${positionName(opener)} opened. Action on you in ${where}.`;
  }

  return `You are in ${where}. Read the table, then act.`;
}

function firstNamedPosition(history: readonly string[], verb: RegExp): HeroPosition | null {
  for (const line of history) {
    if (!verb.test(line)) continue;
    const head = line.trim().split(/\s+/)[0]?.toUpperCase();
    if (
      head === "UTG" ||
      head === "MP" ||
      head === "CO" ||
      head === "BTN" ||
      head === "SB" ||
      head === "BB"
    ) {
      return head;
    }
  }
  return null;
}

/**
 * Pre-decision coach strip. Null when the table already speaks for itself.
 */
export function spotCoachTip(
  heroPos: HeroPosition,
  actionHistory: readonly string[],
  boardCount: number,
): string | null {
  if (boardCount > 0) return null;

  const isUnopened =
    actionHistory.length === 0 ||
    (actionHistory.length === 1 && actionHistory[0] === "folded to hero");

  if (isUnopened) {
    return `You're first in from ${positionName(heroPos)}. The pot is the blinds — checking isn't legal. Calling here is limping; this chart almost never does that.`;
  }

  if (actionHistory.some((l) => /opens?/i.test(l)) && !actionHistory.some((l) => /3bet/i.test(l))) {
    return "Someone opened. Fold, call, or raise — only the buttons shown are in this chart.";
  }

  return null;
}

/**
 * After the answer: why Call/Check were missing, when they were.
 *
 * Silence after Fold/Raise on an open looks like a broken action bar. One line
 * after the grade is enough.
 */
export function missingActionTip(legalActions: readonly string[]): string | null {
  const set = new Set(legalActions.map((a) => a.toLowerCase()));
  const hasCall = [...set].some((a) => a === "call" || a.startsWith("call_"));
  const hasCheck = set.has("check");
  const hasRaise = [...set].some(
    (a) => a.includes("raise") || a === "allin" || a.startsWith("bet_"),
  );

  if (!hasCheck && !hasCall && hasRaise) {
    return "Limping (just calling the big blind) isn't part of this chart — open-raise or fold.";
  }
  if (!hasCheck && hasCall && hasRaise) {
    // Call is offered (often as a limp on RFI) so the table feels live; the
    // grade will say if it was a mistake. No post-answer tip needed.
    return null;
  }
  if (!hasCheck && hasCall) {
    return "You can't check here — there's already a bet to you.";
  }
  return null;
}

/**
 * Caption above Fold / Call / Raise on every drill.
 *
 * Buttons are chart actions for this node, not a full NLHE action set. Saying
 * so stops missing Check/Call from reading as a broken control bar.
 */
export const TRAINER_ACTIONS_CAPTION =
  "Actions in this spot — the plays this chart allows. On an open, Call means limping the big blind.";

/** Print a server `committedBb` the way BetChip expects — in chips. */
export function formatCommittedBb(committedBb: number): string {
  return amountFromBb(committedBb);
}

/**
 * Blind amounts still sitting in front of SB/BB before they act (or raise).
 *
 * Prefer `SeatView.committedBb` from the generator for display. These helpers
 * remain for unit tests of the same arithmetic.
 */
export function blindChipAmount(
  position: HeroPosition,
  activity: SeatActivity,
  boardCount: number,
): string | null {
  if (boardCount > 0) return null;
  if (activity.folded) return null;
  // A real action with a size replaces the blind chip.
  if (betAmountOf(activity.action) !== null) return null;
  // The posted blinds ARE the chip unit's definition: SB 1, BB 2.
  if (position === "SB") return amountFromBb(0.5);
  if (position === "BB") return amountFromBb(1);
  return null;
}

/** Chip in front of a seat: action size wins, else the posted blind. */
export function seatChipAmount(
  position: HeroPosition,
  activity: SeatActivity,
  boardCount: number,
): string | null {
  return betAmountOf(activity.action) ?? blindChipAmount(position, activity, boardCount);
}
