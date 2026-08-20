"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  CHART_CAPTION,
  CHART_FOOTNOTE,
  CHART_HEADING,
  CHART_PAD,
  CHART_SERIES,
  CHART_SUB,
  CHART_X_LABELS,
  CHART_Y_LABEL,
  chartBandPath,
  chartPath,
  chartPoints,
  Y_MAX,
  Y_MIN,
} from "@/lib/onboarding-chart";

/**
 * The value interstitial: two curves, trained against untrained.
 *
 * THE GAP IS THE SUBJECT. The subhead promises "the gap that opens up", which
 * is one object, and the first version drew two — a fill under each line,
 * leaving the reader to subtract them. A single band between the curves is the
 * thing the sentence describes.
 *
 * BOTH LINES DRAW AT ONCE. They used to be staggered 0.12s and 0.55s, which
 * showed one story and then a second one; the point of the screen is that two
 * people start together and separate, and that only reads if they move
 * together. Same duration, same delay, and the band opens with them.
 *
 * WHAT THIS IS ALLOWED TO SAY, AND WHY IT MATTERS.
 *
 * The y-axis is bb/100 and there is no dollar figure anywhere on it. That is
 * non-negotiable rule 5, and it is an ad-account boundary rather than a copy
 * preference: a dollar figure attached to a poker RESULT is the thing that
 * loses the Meta account, and losing it ends paid acquisition for the domain.
 * Prices in dollars are fine; outcomes in dollars are not.
 *
 * The curves are ILLUSTRATIVE and the footnote says so, because we have no
 * cohort data and inventing one would be the same overclaim `/methodology`
 * deliberately refuses to make. That footnote is load-bearing: an e2e asserts
 * it is VISIBLE, because a caveat below the fold is not a caveat. Ending the
 * lines in a bb figure was considered and dropped for the same reason — a
 * number invites "where did that come from" on a screen that cannot answer it.
 *
 * The drawing is SVG stroke-dashoffset rather than a chart library: two paths
 * do not justify a dependency in the highest-traffic pre-purchase route, and a
 * library would arrive after hydration and shift the layout.
 *
 * THE PLAYERS RIDE THE TIPS. For the whole draw — the only part of the
 * animation a fast tapper ever sees — a bare line tip reads as "just a line".
 * The two dots ARE the two players the heading promises: they sit together on
 * the shared start, ride the tips of their curves as the gap opens, and freeze
 * as the endpoints the labels attach to. One shared progress value drives the
 * dashoffset AND both dots (`animate` + `getPointAtLength`), because two clocks
 * for one gesture is how a dot arrives before its line.
 *
 * `pathLength={1}` on both strokes is what makes the hidden initial state
 * server-renderable: dasharray/dashoffset of 1 needs no measured length, so
 * there is no first-frame flash of fully-drawn lines before the effect runs.
 *
 * THE ROOT IS NOT `justify-center`, DELIBERATELY. Every question step stacks
 * from the top of the same flex column, so centring this one dropped its
 * heading ~190px below the heading the user was reading a tap earlier. Eight
 * steps are supposed to read as one screen changing; a heading that jumps down
 * the page mid-run reads as a different page, and the back button stops feeling
 * like it goes back. The CTA pins to the bottom with `mt-auto`, matching
 * MultiSelect's Continue, so the two steps that have a button put it in the
 * same place.
 */

const VIEW_W = 320;
const VIEW_H = 180;

const TRAINED = CHART_SERIES.find((s) => s.id === "trained")!;
const UNTRAINED = CHART_SERIES.find((s) => s.id === "untrained")!;

// One timing object, shared by the strokes and the riding dots, so the two
// halves of the same gesture cannot drift apart.
const DRAW = { duration: 1.15, delay: 0.15, ease: [0.22, 1, 0.36, 1] as const };
const DRAW_END = DRAW.delay + DRAW.duration;

export function ComparisonChart({ onContinue }: { onContinue: () => void }) {
  const reduced = useReducedMotion() ?? false;

  const trainedPathRef = useRef<SVGPathElement>(null);
  const untrainedPathRef = useRef<SVGPathElement>(null);
  const trainedDotRef = useRef<SVGCircleElement>(null);
  const untrainedDotRef = useRef<SVGCircleElement>(null);

  const trainedPts = chartPoints(TRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX);
  const untrainedPts = chartPoints(UNTRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX);
  const trainedStart = trainedPts[0]!;
  const trainedEnd = trainedPts[trainedPts.length - 1]!;
  const untrainedEnd = untrainedPts[untrainedPts.length - 1]!;
  const axisY = VIEW_H - CHART_PAD.bottom;

  useEffect(() => {
    const riders = [
      { path: untrainedPathRef.current, dot: untrainedDotRef.current },
      { path: trainedPathRef.current, dot: trainedDotRef.current },
    ].filter(
      (r): r is { path: SVGPathElement; dot: SVGCircleElement } =>
        r.path !== null && r.dot !== null,
    );

    const place = (progress: number): void => {
      for (const { path, dot } of riders) {
        path.style.strokeDashoffset = String(1 - progress);
        const point = path.getPointAtLength(progress * path.getTotalLength());
        dot.setAttribute("cx", String(point.x));
        dot.setAttribute("cy", String(point.y));
      }
    };

    if (reduced) {
      place(1);
      return;
    }
    place(0);
    const controls = animate(0, 1, { ...DRAW, onUpdate: place });
    return () => controls.stop();
  }, [reduced]);

  const settle = reduced
    ? { duration: 0 }
    : { duration: 0.45, delay: 0.95, ease: "easeOut" as const };
  const endpoints = reduced
    ? { duration: 0 }
    : { duration: 0.35, delay: DRAW_END, ease: "easeOut" as const };

  return (
    <div className="flex flex-1 flex-col gap-5" data-chart="comparison">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{CHART_HEADING}</h1>
        <p className="text-text-secondary text-body-lg">{CHART_SUB}</p>
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-lg border px-3 pt-3 pb-2">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full"
          role="img"
          aria-label={CHART_CAPTION}
        >
          <text
            x="2"
            y={CHART_PAD.top - 14}
            fill="var(--color-text-secondary)"
            fontSize="12"
            fontWeight="500"
          >
            {CHART_Y_LABEL}
          </text>

          <line
            x1={CHART_PAD.left}
            x2={VIEW_W - CHART_PAD.right + 6}
            y1={axisY}
            y2={axisY}
            stroke="var(--color-border-strong)"
            strokeWidth="1"
          />

          {CHART_X_LABELS.map((tick) => {
            const pt = untrainedPts[tick.atIndex];
            if (pt === undefined) return null;
            const lastIndex = untrainedPts.length - 1;
            return (
              <text
                key={tick.label}
                x={pt.x}
                y={VIEW_H - 8}
                textAnchor={
                  tick.atIndex === 0 ? "start" : tick.atIndex === lastIndex ? "end" : "middle"
                }
                fill="var(--color-text-tertiary)"
                fontSize="11"
                fontWeight="500"
              >
                {tick.label}
              </text>
            );
          })}

          {/* The gap itself. Fades in as the curves finish separating. */}
          <motion.path
            d={chartBandPath(TRAINED.points, UNTRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
            fill="var(--color-accent-400)"
            fillOpacity="0.14"
            stroke="none"
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={settle}
          />

          <path
            ref={untrainedPathRef}
            d={chartPath(UNTRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
            fill="none"
            stroke="var(--color-danger-bright)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="1"
          />
          <path
            ref={trainedPathRef}
            d={chartPath(TRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
            fill="none"
            stroke="var(--color-accent-400)"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset="1"
          />

          {/* Shared start — both players, same hole. */}
          <circle
            cx={trainedStart.x}
            cy={trainedStart.y}
            r="4"
            fill="var(--color-surface-1)"
            stroke="var(--color-text-secondary)"
            strokeWidth="1.75"
          />

          {/* The two players. They leave the shared start together, ride the
              tips of their curves, and freeze as the endpoints the labels name.
              Positioned by the draw effect; these coordinates are frame one. */}
          <circle
            ref={untrainedDotRef}
            cx={trainedStart.x}
            cy={trainedStart.y}
            r="4"
            fill="var(--color-danger-bright)"
          />
          <circle
            ref={trainedDotRef}
            cx={trainedStart.x}
            cy={trainedStart.y}
            r="4.5"
            fill="var(--color-accent-400)"
          />

          {/* The endpoint labels ARE the legend — there is no separate key. */}
          <motion.g
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={endpoints}
          >
            <text
              x={untrainedEnd.x + 9}
              y={untrainedEnd.y + 4}
              fill="var(--color-danger-bright)"
              fontSize="12"
              fontWeight="500"
            >
              {UNTRAINED.endLabel}
            </text>
            <text
              x={trainedEnd.x + 9}
              y={trainedEnd.y + 4}
              fill="var(--color-accent-bright)"
              fontSize="12"
              fontWeight="600"
            >
              {TRAINED.endLabel}
            </text>
          </motion.g>
        </svg>
      </div>

      <p className="text-text-secondary text-caption font-medium">{CHART_FOOTNOTE}</p>

      <div className="mt-auto pt-4">
        <Button variant="accent" size="lg" className="w-full" onClick={onContinue}>
          Keep going
        </Button>
      </div>
    </div>
  );
}
