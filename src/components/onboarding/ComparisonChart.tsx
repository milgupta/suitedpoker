"use client";

import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  CHART_CAPTION,
  CHART_FOOTNOTE,
  CHART_HEADING,
  CHART_SERIES,
  CHART_SUB,
  chartPath,
  Y_MAX,
  Y_MIN,
} from "@/lib/onboarding-chart";

/**
 * The value interstitial: two curves, trained against untrained.
 *
 * WHAT THIS IS ALLOWED TO SAY, AND WHY IT MATTERS.
 *
 * The y-axis is bb/100 and there is no dollar figure anywhere on it. That is
 * non-negotiable rule 5, and it is an ad-account boundary rather than a copy
 * preference: a dollar figure attached to a poker RESULT is the thing that
 * loses the Meta account, and losing it ends paid acquisition for the domain.
 * Prices in dollars are fine; outcomes in dollars are not.
 *
 * The curves are ILLUSTRATIVE and the screen says so, in the caption and again
 * in the footnote, because we have no cohort data and inventing one would be
 * the same overclaim `/methodology` deliberately refuses to make. A numerate
 * poker audience checks exactly this kind of number, and being caught once
 * costs more than the screen earns.
 *
 * The drawing is SVG stroke-dashoffset rather than a chart library: two paths
 * do not justify a dependency in the highest-traffic pre-purchase route, and a
 * library would arrive after hydration and shift the layout.
 */

const VIEW_W = 320;
const VIEW_H = 180;

export function ComparisonChart({ onContinue }: { onContinue: () => void }) {
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="flex flex-1 flex-col justify-center gap-6" data-chart="comparison">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{CHART_HEADING}</h1>
        <p className="text-text-secondary text-body-lg">{CHART_SUB}</p>
      </div>

      <div className="border-border bg-surface-1 rounded-lg border p-4">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full"
          role="img"
          aria-label={CHART_CAPTION}
        >
          {/* Zero line: the break-even reference the whole chart is read against. */}
          <line
            x1="0"
            x2={VIEW_W}
            y1={yOf(0)}
            y2={yOf(0)}
            stroke="var(--color-border-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <text x="2" y={yOf(0) - 5} className="text-caption" fill="var(--color-text-tertiary)">
            break even
          </text>

          {CHART_SERIES.map((series, i) => (
            <motion.path
              key={series.id}
              d={chartPath(series.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
              fill="none"
              stroke={
                series.id === "trained" ? "var(--color-accent-400)" : "var(--color-text-tertiary)"
              }
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: 1.1, delay: 0.15 + i * 0.25, ease: "easeOut" }
              }
            />
          ))}
        </svg>

        <div className="mt-3 flex flex-col gap-1.5">
          {CHART_SERIES.map((series) => (
            <div key={series.id} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-0.5 w-5 shrink-0 rounded-full ${
                  series.id === "trained" ? "bg-accent-400" : "bg-text-tertiary"
                }`}
              />
              <span className="text-text-secondary text-body-sm">{series.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-text-tertiary text-caption">{CHART_FOOTNOTE}</p>

      <Button variant="accent" size="lg" className="w-full" onClick={onContinue}>
        Keep going
      </Button>
    </div>
  );

  function yOf(value: number): number {
    const t = (value - Y_MIN) / (Y_MAX - Y_MIN);
    return VIEW_H - t * VIEW_H;
  }
}
