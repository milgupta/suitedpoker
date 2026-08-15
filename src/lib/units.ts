/**
 * THE ONE PLACE AN INTERNAL AMOUNT BECOMES A NUMBER ON SCREEN.
 *
 * The product used to state every amount in big blinds — "Pot 13.0bb", "opens
 * 2.5bb", "you lose 4.2 bb/100". It states plain numbers now. A beginner
 * arriving from an ad does not know what a big blind is, and a unit nobody
 * understands is a unit nobody reads; "Pot 26" needs no glossary entry.
 *
 * THE UNIT IS THE ENGINE'S OWN CHIP. `src/poker` already deals in integer
 * chips at 2 per big blind (SB 1, BB 2), so every sizing in the tree — a 2.5bb
 * open, an 11bb 3bet, a 0.5bb small blind — is a whole number of chips with
 * nothing rounded and no poker changed. That is the whole reason chips were
 * chosen over "big blinds with the decimals knocked off": rounding 2.5 to 3
 * would show a sizing nobody actually bet.
 *
 * EV IS THE ONE EXCEPTION AND IT KEEPS A DECIMAL. The grader's bands are 0.05,
 * 0.5, 2 and 5 big blinds — 0.1, 1, 4 and 10 chips. Rounded to whole chips the
 * entire `best` band and most of `solid` print as "0", so the number the whole
 * product is built on would read as "you gave up nothing" on every mistake
 * small enough to be interesting. One decimal is the minimum that keeps a
 * `solid` distinguishable from a `best`.
 *
 * Nothing outside this module may write a unit suffix onto an amount, the same
 * way nothing outside globals.css may write a colour literal.
 */

/** The engine's chips per big blind. SB posts 1, BB posts 2. */
export const CHIPS_PER_BB = 2;

/** Rate denominator, kept as one constant so the label and the maths agree. */
export const HANDS_PER_RATE = 100;

/**
 * What the win-rate metric is called now that "bb/100" is gone.
 *
 * "Chips" survives the 9.6 compliance audit deliberately — the string scan
 * forbids anything implying money MOVES, and chips, pot, bet, stack and blind
 * were all explicitly kept. A bare number with no unit at all was the other
 * option and it is worse: an unlabelled figure next to a poker result is the
 * one a reader fills in with dollars, which is the exact reading rule 5 exists
 * to prevent.
 */
export const RATE_LABEL = "chips/100";
export const RATE_LABEL_LONG = "chips per 100 hands";
export const AMOUNT_LABEL = "chips";

function whole(value: number): string {
  // `Math.round(-0.4)` is `-0`, which stringifies to "-0" and reads as a bug.
  const rounded = Math.round(value);
  return String(rounded === 0 ? 0 : rounded);
}

/** An amount the engine gave us in chips, as a whole number. */
export function amountFromChips(chips: number): string {
  return whole(chips);
}

/** An amount held internally in big blinds, as a whole number of chips. */
export function amountFromBb(bb: number): string {
  return whole(bb * CHIPS_PER_BB);
}

/** The raw chip count, for callers that need the number rather than the text. */
export function chipsFromBb(bb: number): number {
  return Math.round(bb * CHIPS_PER_BB);
}

/**
 * An EV figure, in chips, to one decimal.
 *
 * Signed callers add their own "−"; this returns the magnitude they asked for
 * so "gives up 0.2" and "−0.2" are built from the same number.
 */
export function evFromBb(bb: number): string {
  return (bb * CHIPS_PER_BB).toFixed(1);
}

/** A per-100-hands rate, in chips, as a whole number. */
export function rateFromBb100(bb100: number): string {
  return whole(bb100 * CHIPS_PER_BB);
}

/** The same rate as a number, for tiles that animate or compare it. */
export function rateValueFromBb100(bb100: number): number {
  return Math.round(bb100 * CHIPS_PER_BB);
}
