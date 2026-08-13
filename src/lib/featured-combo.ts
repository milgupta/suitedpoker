import { SUITS, suitOf } from "@/poker/cards";
import { combosOf, type Combo, type HandKey } from "@/poker/range";

/**
 * The one concrete combo every marketing surface draws for the featured hand.
 *
 * Hearts, because a red pair reads better against the near-black canvas than
 * the clubs `combosOf` happens to return first. It is a SUITED combo either
 * way: making only the queen red would turn KQs into KQo, a different hand
 * with a different mix, and every number on the panel would then describe
 * cards the reader is not looking at.
 *
 * Shared rather than picked per component, so the hero and "How it works"
 * cannot drift while both claim to be showing the same hand.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────
 * It belongs in `landing-showcase.ts` by subject, and cannot live there.
 * That module imports `bandFor` from the grader and `seatActivity` from the
 * engine, so a CLIENT component importing any VALUE from it pulls
 * `evaluator.ts`, `handclass.ts`, `grader.ts`, `solutions.ts` and
 * `seat-activity.ts` into the marketing bundle — the exact failure
 * `tests/unit/bundle.test.ts` was written for, and the one it caught when
 * this helper started there. A type-only import is erased and safe; a value
 * import is not. This file reaches `range.ts` and `cards.ts` only, which are
 * the two the landing page is allowed to ship.
 */
export function featuredCombo(hand: HandKey): Combo | undefined {
  const combos = combosOf(hand);
  const hearts = SUITS.indexOf("h");
  return combos.find((combo) => combo.every((card) => suitOf(card) === hearts)) ?? combos[0];
}
