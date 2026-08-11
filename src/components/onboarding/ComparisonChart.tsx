"use client";

import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  CHART_ANNOTATIONS,
  CHART_CAPTION,
  CHART_CARD_META,
  CHART_CARD_TITLE,
  CHART_FOOTNOTE,
  CHART_HEADING,
  CHART_PAD,
  CHART_SERIES,
  CHART_SUB,
  CHART_X_LABELS,
  chartAreaPath,
  chartPath,
  chartPoints,
  yAtValue,
  Y_MAX,
  Y_MIN,
} from "@/lib/onboarding-chart";

/**
 * The value interstitial: two curves, trained against untrained.
 *
 * Craft target: a narrative chart card (title, annotated bad path, area fill,
 * endpoints, session axis) — not two bare strokes in a bordered box.
 *
 * WHAT THIS IS ALLOWED TO SAY, AND WHY IT MATTERS.
 *
 * The y-axis is bb/100 and there is no dollar figure anywhere on it. That is
 * non-negotiable rule 5, and it is an ad-account boundary rather than a copy
 * preference: a dollar figure attached to a poker RESULT is the thing that
 * loses the Meta account, and losing it ends paid acquisition for the domain.
 * Prices in dollars are fine; outcomes in dollars are not.
 *
 * The curves are ILLUSTRATIVE and the screen says so, in the card meta and
 * again in the footnote, because we have no cohort data and inventing one
 * would be the same overclaim `/methodology` deliberately refuses to make. A
 * numerate poker audience checks exactly this kind of number, and being caught
 * once costs more than the screen earns.
 *
 * The drawing is SVG stroke-dashoffset rather than a chart library: two paths
 * do not justify a dependency in the highest-traffic pre-purchase route, and a
 * library would arrive after hydration and shift the layout.
 */

const VIEW_W = 320;
const VIEW_H = 196;

const TRAINED = CHART_SERIES.find((s) => s.id === "trained")!;
const UNTRAINED = CHART_SERIES.find((s) => s.id === "untrained")!;

export function ComparisonChart({ onContinue }: { onContinue: () => void }) {
  const reduced = useReducedMotion() ?? false;

  const trainedPts = chartPoints(TRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX);
  const untrainedPts = chartPoints(UNTRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX);
  const trainedStart = trainedPts[0]!;
  const trainedEnd = trainedPts[trainedPts.length - 1]!;
  const untrainedEnd = untrainedPts[untrainedPts.length - 1]!;
  const zeroY = yAtValue(0, VIEW_H, Y_MIN, Y_MAX);
  const axisY = VIEW_H - CHART_PAD.bottom;

  const drawUntrained = reduced
    ? { duration: 0 }
    : { duration: 0.95, delay: 0.12, ease: [0.22, 1, 0.36, 1] as const };
  const drawTrained = reduced
    ? { duration: 0 }
    : { duration: 1.15, delay: 0.55, ease: [0.22, 1, 0.36, 1] as const };
  const fadeAfterUntrained = reduced
    ? { duration: 0 }
    : { duration: 0.45, delay: 0.85, ease: "easeOut" as const };
  const fadeAfterTrained = reduced
    ? { duration: 0 }
    : { duration: 0.4, delay: 1.45, ease: "easeOut" as const };

  return (
    <div className="flex flex-1 flex-col justify-center gap-5" data-chart="comparison">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{CHART_HEADING}</h1>
        <p className="text-text-secondary text-body-lg">{CHART_SUB}</p>
      </div>

      <div className="border-border bg-surface-1 overflow-hidden rounded-lg border">
        <div className="border-border-subtle flex items-start justify-between gap-3 border-b px-4 pt-3.5 pb-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-text-primary text-heading-md">{CHART_CARD_TITLE}</p>
            <p className="text-text-tertiary text-caption">{CHART_CARD_META}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="text-danger-bright text-caption flex h-4 w-4 items-center justify-center font-semibold"
              >
                ✕
              </span>
              <span className="text-text-secondary text-body-sm">{UNTRAINED.label}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-1">
            <span aria-hidden="true" className="bg-accent-400 h-0.5 w-4 rounded-full" />
            <span className="text-accent-bright text-caption">{TRAINED.label}</span>
          </div>
        </div>

        <div className="px-3 pt-2 pb-3">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="h-auto w-full"
            role="img"
            aria-label={CHART_CAPTION}
          >
            <defs>
              <linearGradient id="untrained-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-danger)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-danger)" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="trained-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-400)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-accent-400)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Baseline axis */}
            <line
              x1={CHART_PAD.left}
              x2={VIEW_W - CHART_PAD.right + 8}
              y1={axisY}
              y2={axisY}
              stroke="var(--color-border-strong)"
              strokeWidth="1"
            />

            {/* Break-even reference */}
            <line
              x1={CHART_PAD.left}
              x2={VIEW_W - CHART_PAD.right + 8}
              y1={zeroY}
              y2={zeroY}
              stroke="var(--color-border-strong)"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
            <text
              x={CHART_PAD.left + 2}
              y={zeroY - 6}
              fill="var(--color-text-tertiary)"
              fontSize="10"
              fontWeight="500"
            >
              break even
            </text>

            {CHART_X_LABELS.map((tick) => {
              const pt = untrainedPts[tick.atIndex];
              if (pt === undefined) return null;
              return (
                <text
                  key={tick.label}
                  x={pt.x}
                  y={VIEW_H - 8}
                  textAnchor={tick.atIndex === 0 ? "start" : tick.atIndex === 7 ? "end" : "middle"}
                  fill="var(--color-text-tertiary)"
                  fontSize="10"
                  fontWeight="500"
                >
                  {tick.label}
                </text>
              );
            })}

            {/* Untrained area + stroke first — the problem, then the answer. */}
            <motion.path
              d={chartAreaPath(UNTRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
              fill="url(#untrained-fill)"
              stroke="none"
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fadeAfterUntrained}
            />
            <motion.path
              d={chartPath(UNTRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
              fill="none"
              stroke="var(--color-danger-bright)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={drawUntrained}
            />

            <motion.path
              d={chartAreaPath(TRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
              fill="url(#trained-fill)"
              stroke="none"
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fadeAfterTrained}
            />
            <motion.path
              d={chartPath(TRAINED.points, VIEW_W, VIEW_H, Y_MIN, Y_MAX)}
              fill="none"
              stroke="var(--color-accent-400)"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={drawTrained}
            />

            {/* Shared start — both players, same hole. */}
            <circle
              cx={trainedStart.x}
              cy={trainedStart.y}
              r="4.5"
              fill="var(--color-surface-1)"
              stroke="var(--color-text-secondary)"
              strokeWidth="1.75"
            />

            {/* Annotations on the stuck path */}
            {CHART_ANNOTATIONS.map((note, i) => {
              const pt = untrainedPts[note.atIndex];
              if (pt === undefined) return null;
              return (
                <motion.g
                  key={note.label}
                  initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: 0.35, delay: 0.95 + i * 0.18, ease: "easeOut" }
                  }
                >
                  <text
                    x={pt.x}
                    y={pt.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--color-danger-bright)"
                    fontSize="11"
                    fontWeight="700"
                  >
                    ✕
                  </text>
                  <text
                    x={pt.x + 8}
                    y={pt.y - 12}
                    fill="var(--color-danger-bright)"
                    fontSize="10"
                    fontWeight="500"
                  >
                    {note.label}
                  </text>
                </motion.g>
              );
            })}

            {/* Endpoints + curve labels */}
            <motion.g
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fadeAfterUntrained}
            >
              <circle
                cx={untrainedEnd.x}
                cy={untrainedEnd.y}
                r="4"
                fill="var(--color-danger-bright)"
              />
              <text
                x={untrainedEnd.x + 8}
                y={untrainedEnd.y + 3}
                fill="var(--color-danger-bright)"
                fontSize="10"
                fontWeight="500"
              >
                {UNTRAINED.endLabel}
              </text>
            </motion.g>

            <motion.g
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fadeAfterTrained}
            >
              <circle cx={trainedEnd.x} cy={trainedEnd.y} r="5" fill="var(--color-accent-400)" />
              <text
                x={trainedEnd.x + 9}
                y={trainedEnd.y + 3}
                fill="var(--color-accent-bright)"
                fontSize="10"
                fontWeight="600"
              >
                {TRAINED.endLabel}
              </text>
            </motion.g>
          </svg>
        </div>
      </div>

      <p className="text-text-tertiary text-caption">{CHART_FOOTNOTE}</p>

      <Button variant="accent" size="lg" className="w-full" onClick={onContinue}>
        Keep going
      </Button>
    </div>
  );
}
