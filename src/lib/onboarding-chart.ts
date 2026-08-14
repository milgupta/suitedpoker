/**
 * The data and copy behind the onboarding comparison chart.
 *
 * Pure, and separate from the component, for one reason: the compliance scans
 * assert on strings. A results claim buried in JSX is a string a regex has to
 * find by rendering; a string in a module is one a unit test can enumerate.
 *
 * THE RULES THIS FILE EXISTS TO KEEP.
 *
 *   1. bb/100 ONLY. No dollar figure anywhere near a poker result. That is
 *      non-negotiable rule 5 and an ad-account boundary — the Meta account does
 *      not survive an earnings claim in this category.
 *   2. ILLUSTRATIVE, AND SAID SO. There is no cohort behind these curves and
 *      there will not be until real users have played real hands. Presenting a
 *      modelled shape as measured data would be the same overclaim that
 *      `/methodology` deliberately refuses to make, on a screen with far more
 *      traffic.
 *   3. NO TIME-TO-RESULT PROMISE. The x-axis is labelled in sessions, not in
 *      weeks-to-profit, because "profitable in 8 weeks" is a guarantee.
 */

export interface ChartSeries {
  readonly id: "trained" | "untrained";
  readonly label: string;
  /** Short end-of-curve label drawn next to the last point. */
  readonly endLabel: string;
  /** bb/100 at each x. Index is the x position; values are the y. */
  readonly points: readonly number[];
}

/**
 * Plot padding inside the SVG viewBox.
 *
 * `top` clears the "Win rate" axis label, which sits above the plot rather
 * than rotated beside it — a rotated label costs 20px of width on a 390px
 * screen and is the first thing to become unreadable.
 *
 * `right` is sized to the LONGEST end label. It was 78 against "same as day
 * one", which did not fit: the word "one" was clipped by the card edge on a
 * shipped screen. The labels are short now and the padding still leads them.
 */
export const CHART_PAD = {
  top: 30,
  right: 62,
  bottom: 26,
  left: 4,
} as const;

/** The y-axis window, in bb/100. Symmetric-ish so break-even sits mid-chart. */
export const Y_MIN = -8;
export const Y_MAX = 4;

/**
 * The two shapes.
 *
 * Both start in the same place, because everybody does. The untrained line
 * drifts down slowly rather than falling off a cliff: a player who never
 * studies does not get dramatically worse, they stay beaten by the rake and
 * the better regulars, and drawing a collapse would be the cartoon version
 * that makes the whole screen less believable.
 */
export const CHART_SERIES: readonly ChartSeries[] = [
  {
    id: "trained",
    label: "Studying your leaks",
    endLabel: "Studying",
    points: [-6.0, -4.8, -3.5, -2.2, -1.0, 0.1, 0.9, 1.6],
  },
  {
    id: "untrained",
    label: "Playing the same way",
    endLabel: "No change",
    points: [-6.0, -5.7, -6.3, -5.9, -6.5, -6.1, -6.6, -6.8],
  },
];

/** Three x-axis ticks. Sessions, never weeks-to-profit. */
export const CHART_X_LABELS: readonly { readonly atIndex: number; readonly label: string }[] = [
  { atIndex: 0, label: "Session 1" },
  { atIndex: 3, label: "Session 4" },
  { atIndex: 7, label: "Session 8" },
];

export const CHART_HEADING = "Two players, same starting point.";

export const CHART_SUB =
  "One works on the spots they get wrong. The other keeps playing. This is the gap that opens up.";

/**
 * The y-axis label, above the plot.
 *
 * It replaced a card header of four stacked pieces — title, "bb / 100 hands ·
 * illustrative", a red legend row and a blue one — which put more chrome above
 * the chart than there was chart. The unit and the caveat both moved into the
 * footnote, which is the line the e2e actually asserts is visible; saying
 * "illustrative" twice on one screen was belt and braces, and the braces were
 * costing the whole header.
 */
export const CHART_Y_LABEL = "Win rate";

/** The accessible name for the SVG. Must carry the caveat too. */
export const CHART_CAPTION =
  "An illustrative comparison of win rate in big blinds per 100 hands, for a player who studies their leaks against one who does not.";

/**
 * The caveat, on screen, not buried in a tooltip.
 *
 * It is here because it is true, and because a numerate poker audience will
 * ask where the numbers came from. Saying it first is cheaper than being
 * caught, and it is the same posture the methodology page takes.
 */
export const CHART_FOOTNOTE =
  "Illustrative only — win rate in big blinds per 100 hands, not a prediction or measured results.";

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** Map series values into the padded plot rectangle. */
export function chartPoints(
  points: readonly number[],
  width: number,
  height: number,
  yMin: number,
  yMax: number,
  pad: typeof CHART_PAD = CHART_PAD,
): ChartPoint[] {
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  return points.map((value, i) => ({
    x: pad.left + (i / Math.max(1, points.length - 1)) * plotW,
    y: pad.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH,
  }));
}

export function yAtValue(
  value: number,
  height: number,
  yMin: number,
  yMax: number,
  pad: typeof CHART_PAD = CHART_PAD,
): number {
  const plotH = height - pad.top - pad.bottom;
  return pad.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;
}

/**
 * An SVG path through the points, as a smooth curve.
 *
 * Catmull-Rom converted to cubic beziers: a polyline through eight points
 * reads as a sales chart, and a real win-rate graph is noisy and smooth rather
 * than jagged. Pure, so the geometry is testable without a DOM.
 */
export function chartPath(
  points: readonly number[],
  width: number,
  height: number,
  yMin: number,
  yMax: number,
  pad: typeof CHART_PAD = CHART_PAD,
): string {
  return smoothPath(chartPoints(points, width, height, yMin, yMax, pad));
}

/**
 * The same curve, over points that are already placed.
 *
 * Split out because the band below has to traverse the lower series RIGHT TO
 * LEFT, and reversing the value array cannot express that — index still maps
 * to x left-to-right, so a reversed array draws a mirrored curve rather than
 * the same curve backwards. Reversing placed points is the only version that
 * means what it says.
 *
 * `continued` omits the leading `M` so the result extends the current subpath
 * instead of starting a new one, which would leave a fill unclosed.
 */
export function smoothPath(xy: readonly ChartPoint[], continued = false): string {
  if (xy.length === 0) return "";

  const first = xy[0]!;
  if (xy.length === 1) return continued ? "" : `M ${round(first.x)} ${round(first.y)}`;

  let d = continued ? "" : `M ${round(first.x)} ${round(first.y)}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[Math.max(0, i - 1)]!;
    const p1 = xy[i]!;
    const p2 = xy[i + 1]!;
    const p3 = xy[Math.min(xy.length - 1, i + 2)]!;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`;
  }
  return d;
}

/**
 * The region BETWEEN the two curves — the thing the subhead actually promises.
 *
 * "This is the gap that opens up" is a single object, and the screen used to
 * draw two: one fill under each line, leaving the reader to subtract them. One
 * closed band starting where both players start makes the divergence the
 * subject rather than a by-product of two shaded areas.
 *
 * Built as the upper curve forward, then the lower curve reversed, so the seam
 * is exactly the shared starting point rather than the plot floor.
 */
export function chartBandPath(
  upper: readonly number[],
  lower: readonly number[],
  width: number,
  height: number,
  yMin: number,
  yMax: number,
  pad: typeof CHART_PAD = CHART_PAD,
): string {
  const upperPts = chartPoints(upper, width, height, yMin, yMax, pad);
  const lowerPts = chartPoints(lower, width, height, yMin, yMax, pad);
  if (upperPts.length === 0 || lowerPts.length === 0) return "";

  const forward = smoothPath(upperPts);
  const backwards = [...lowerPts].reverse();
  const back = smoothPath(backwards, true);
  const seam = backwards[0]!;

  return `${forward} L ${round(seam.x)} ${round(seam.y)}${back} Z`;
}

/**
 * Soft fill under a series: the stroke path, then down to the plot floor and
 * back. Kept for any single-series use; the interstitial draws the band above.
 */
export function chartAreaPath(
  points: readonly number[],
  width: number,
  height: number,
  yMin: number,
  yMax: number,
  pad: typeof CHART_PAD = CHART_PAD,
): string {
  const stroke = chartPath(points, width, height, yMin, yMax, pad);
  if (stroke === "") return "";
  const xy = chartPoints(points, width, height, yMin, yMax, pad);
  const last = xy[xy.length - 1]!;
  const first = xy[0]!;
  const floor = height - pad.bottom;
  return `${stroke} L ${round(last.x)} ${round(floor)} L ${round(first.x)} ${round(floor)} Z`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
