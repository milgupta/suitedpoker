/**
 * The column shape shared by the action buttons and the frequency capsules that
 * sit above them.
 *
 * A capsule states the frequency of the button directly beneath it, so the two
 * grids have to agree at every breakpoint. They were declared independently and
 * drifted: four actions wrapped the buttons to 2x2 below `sm` while the capsules
 * stayed in one row of four, so the third capsule sat above the first button of
 * the second row.
 *
 * Four across 358px gives each label 80px and "Raise small" runs out of its
 * button, which is why four wraps rather than shrinking.
 */
export function actionGridClass(count: number): string {
  if (count >= 4) return "grid-cols-2 sm:grid-cols-4";
  if (count === 3) return "grid-cols-3";
  return "grid-cols-2";
}

export interface CapsuleSegment {
  readonly action: string;
  readonly freq: number;
  readonly evLoss: number;
}

/** Just the parts of a graded result a capsule row needs. */
export interface CapsuleSource {
  readonly frequencies: Readonly<Record<string, number>>;
  readonly alternativeActions: readonly { readonly action: string; readonly evLoss: number }[];
}

/**
 * The capsule row, in button order.
 *
 * Pure and exported so "the percentages sit above the right buttons" is an
 * assertion rather than a thing somebody notices in a screenshot. The row used
 * to be sorted descending by frequency while the buttons rendered in
 * `legalActions` order, so a hand the solver called 60% of the time printed
 * "60%" above Fold — the screen stating the exact opposite of the strategy it
 * had just graded the user against.
 *
 * Every legal action gets a capsule, including the ones played 0% of the time:
 * a gap in the row would break the correspondence just as badly as a reorder.
 */
export function capsuleSegments(
  legalActions: readonly string[],
  result: CapsuleSource,
): CapsuleSegment[] {
  return legalActions.map((action) => ({
    action,
    freq: result.frequencies[action] ?? 0,
    evLoss: result.alternativeActions.find((a) => a.action === action)?.evLoss ?? 0,
  }));
}
