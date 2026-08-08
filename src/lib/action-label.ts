/**
 * How an action is written on a button a person presses.
 *
 * The solution files store `raise_small`, `bet_33`, `allin` — identifiers, and
 * correct ones. They were being rendered straight onto the decision buttons, so
 * the product asked a beginner to choose between "raise_small" and "allin"
 * while claiming to explain poker in plain English. A snake_case token on the
 * one control the whole product runs through is the clearest possible signal
 * that nobody looked at the screen.
 *
 * The identifier stays on `data-action` and in everything sent to the server —
 * only what is printed changes.
 */

const LABELS: Record<string, string> = {
  fold: "Fold",
  call: "Call",
  check: "Check",
  raise: "Raise",
  allin: "All in",
  bet_33: "Bet 33%",
  bet_66: "Bet 66%",
  bet_100: "Bet pot",
  raise_small: "Raise small",
  raise_pot: "Raise pot",
};

/**
 * Falls back to a de-snaked, sentence-cased version rather than to the raw
 * token. A new sizing added to the solution data should read as "Bet 75" on the
 * day it lands, not as "bet_75" until somebody notices.
 */
export function actionLabel(action: string): string {
  const known = LABELS[action];
  if (known !== undefined) return known;

  const words = action.replace(/_/g, " ").trim();
  return words === "" ? action : words.charAt(0).toUpperCase() + words.slice(1);
}
