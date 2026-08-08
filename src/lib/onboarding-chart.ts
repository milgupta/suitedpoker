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
  /** bb/100 at each x. Index is the x position; values are the y. */
  readonly points: readonly number[];
}

/** The y-axis window, in bb/100. Symmetric so break-even sits mid-chart. */
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
    points: [-6.0, -4.6, -3.1, -1.7, -0.6, 0.3, 0.9, 1.4],
  },
  {
    id: "untrained",
    label: "Playing the same way",
    points: [-6.0, -6.2, -6.0, -6.4, -6.2, -6.5, -6.3, -6.6],
  },
];

export const CHART_HEADING = "Two players, same starting point.";

export const CHART_SUB =
  "One works on the spots they get wrong. The other keeps playing. This is the gap that opens up.";

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
  "Illustrative only. Not a prediction, a guarantee, or measured results. Win rate is shown in big blinds per 100 hands.";

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
): string {
  if (points.length === 0) return "";

  const xy = points.map((value, i) => ({
    x: (i / Math.max(1, points.length - 1)) * width,
    y: height - ((value - yMin) / (yMax - yMin)) * height,
  }));

  const first = xy[0]!;
  if (xy.length === 1) return `M ${first.x} ${first.y}`;

  let d = `M ${round(first.x)} ${round(first.y)}`;
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
