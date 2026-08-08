/**
 * The number to put on a chip, pulled out of an action line.
 *
 * The seat chips say "3bets to 11bb", which is the whole sentence. On a table
 * the amount belongs on a CHIP sitting in front of the player, because that is
 * where a poker player's eye goes to read what a pot costs — the words are
 * context, the number is the decision.
 *
 * Pure, because "opens 2.5bb" must produce 2.5 and "checks" must produce
 * nothing, and a chip showing a stray number from a hand history is worse than
 * no chip at all.
 */

/**
 * The last big-blind figure in an action, as it should be printed.
 *
 * The LAST one, not the first: "3bets to 11bb" contains a 3, and a chip reading
 * "3bb" in front of a player who just made it eleven is a lie about the size of
 * the pot.
 */
export function betAmountOf(action: string | null): string | null {
  if (action === null) return null;

  const matches = [...action.matchAll(/(\d+(?:\.\d+)?)\s*bb\b/gi)];
  const last = matches.at(-1);
  if (last === undefined) return null;

  const amount = last[1];
  return amount === undefined ? null : `${amount}bb`;
}

/**
 * True when an action put chips in the middle at all.
 *
 * A check and a fold are actions with no chip. "calls" has no figure of its own
 * — it matches whatever was bet — so it gets no chip either rather than an
 * invented one.
 */
export function committedChips(action: string | null): boolean {
  return betAmountOf(action) !== null;
}

/**
 * The action with its figure removed, for the badge under a seat.
 *
 * "3bets to 11bb" becomes "3bets". The amount is already on the chip in front
 * of that player, and printing it twice is the wall of text this table was
 * rebuilt to get rid of — the badge says WHAT they did, the chip says how much.
 *
 * Actions with no figure ("checks", "to act") come back unchanged, because for
 * those the words are all there is.
 */
export function actionVerb(action: string): string {
  const stripped = action
    .replace(/\s*(?:to\s+)?\d+(?:\.\d+)?\s*bb\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped === "" ? action : stripped;
}
