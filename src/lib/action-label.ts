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

/**
 * The same name mid-sentence, where a capital would read as the start of one.
 *
 * "— but Bet 66% is close" and "splits between Fold, Call" both looked like a
 * bug rather than emphasis.
 */
export function actionPhrase(action: string): string {
  return actionLabel(action).toLowerCase();
}

/**
 * Past tense, for "You ___".
 *
 * Only the four base actions had a verb, so every postflop sizing fell through
 * to its raw identifier and the result line read "You bet_33". A sizing is the
 * majority of postflop actions, so the fallthrough was the common case rather
 * than the edge one.
 */
const VERBS: Record<string, string> = {
  fold: "folded",
  call: "called",
  check: "checked",
  raise: "raised",
  bet: "bet",
  allin: "shoved",
  bet_33: "bet 33%",
  bet_66: "bet 66%",
  bet_100: "bet pot",
  raise_small: "raised small",
  raise_pot: "raised pot",
};

export function actionVerb(action: string): string {
  return VERBS[action] ?? actionPhrase(action);
}
