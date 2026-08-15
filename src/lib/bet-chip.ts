/**
 * The number to put on a chip, pulled out of an action line.
 *
 * The seat chips say "3bets to 22", which is the whole sentence. On a table
 * the amount belongs on a CHIP sitting in front of the player, because that is
 * where a poker player's eye goes to read what a pot costs — the words are
 * context, the number is the decision.
 *
 * Pure, because "opens 5" must produce 5 and "checks" must produce nothing,
 * and a chip showing a stray number from a hand history is worse than no chip
 * at all.
 */

/**
 * A figure that is its OWN WORD, never one glued to a verb.
 *
 * The unit used to do this job: `\d+bb` could not match the "3" in "3bets"
 * because no "bb" followed it. With amounts printed as bare chips ("3bets to
 * 22") a naive `\d+` matches that 3, and a seat that made it twenty-two would
 * show a chip reading 3 — the exact misprice the LAST-figure rule was written
 * to prevent, reintroduced by dropping the suffix.
 *
 * So the digits must be bounded by whitespace or the ends of the string.
 * "3bets" fails the lookahead; "to 22" and "opens 5" pass.
 */
const AMOUNT = /(?:^|\s)(?:to\s+)?(\d+(?:\.\d+)?)(?=$|\s)/g;

/**
 * The last figure in an action, as it should be printed.
 *
 * The LAST one, not the first: "3bets to 22" contains a 3, and a chip reading
 * "3" in front of a player who just made it twenty-two is a lie about the size
 * of the pot.
 */
export function betAmountOf(action: string | null): string | null {
  if (action === null) return null;

  const matches = [...action.matchAll(AMOUNT)];
  const last = matches.at(-1);
  if (last === undefined) return null;

  const amount = last[1];
  return amount === undefined ? null : amount;
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
 * "3bets to 22" becomes "3bets". The amount is already on the chip in front of
 * that player, and printing it twice is the wall of text this table was
 * rebuilt to get rid of — the badge says WHAT they did, the chip says how much.
 *
 * Same word-boundary rule as `AMOUNT`, and for the same reason: a strip that
 * matched a bare `\d+` would turn "3bets" into "bets".
 *
 * Actions with no figure ("checks", "to act") come back unchanged, because for
 * those the words are all there is.
 */
export function actionVerb(action: string): string {
  const stripped = action
    .replace(/\s*(?:to\s+)?\d+(?:\.\d+)?(?=$|\s)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped === "" ? action : stripped;
}
