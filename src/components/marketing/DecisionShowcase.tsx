"use client";

import { FrequencyBar, type FrequencySegment } from "@/components/poker/FrequencyBar";
import { GradeBadge } from "@/components/ui/grade-badge";
import { actionVerb } from "@/lib/action-label";
import type { Showcase } from "@/lib/landing-showcase";

/**
 * The hero panel: one real hand, the real mix, and what the minority line costs.
 *
 * Frequencies always come from the solution file. Colour on this panel is a
 * deliberate exception: a true mix has ~0 EV gap on every played line, so
 * `evColor` paints the whole bar one green and the 80/20 split vanishes. The
 * arena keeps honest EV colouring; the landing page exaggerates the minority
 * to blunder-red so a first-time visitor can SEE the mix. The copy below says
 * that out loud.
 */
export function DecisionShowcase({ showcase }: { showcase: Showcase }) {
  const [top, ...rest] = showcase.segments;
  const alternative = rest[0];
  const barSegments = marketingContrast(showcase.segments);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="border-border-strong bg-surface-1 text-heading-md rounded-md border px-3 py-1.5 font-mono tabular-nums">
            {showcase.hand}
          </span>
          <span className="text-text-secondary text-body-md">{showcase.situation}</span>
        </div>
        <span className="text-text-tertiary text-caption font-mono tabular-nums">
          {showcase.potBb}bb pot · {showcase.effStackBb}bb deep
        </span>
      </div>

      <FrequencyBar segments={barSegments} />

      {top !== undefined && alternative !== undefined && showcase.alternativeGrade !== null ? (
        <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
          <GradeBadge grade={showcase.alternativeGrade} size="sm" static />
          <p className="text-text-secondary text-body-md">
            The chart {actionVerb(top.action)} this {Math.round(top.freq * 100)}% of the time and{" "}
            {actionVerb(alternative.action)} it {Math.round(alternative.freq * 100)}%.{" "}
            {alternative.evLoss < 0.005 ? (
              <>
                Both lines are correct — the red is only so you can see the split, not a grade on
                the minority play.
              </>
            ) : (
              <>
                Taking the second one gives up{" "}
                <span className="text-text-primary font-mono tabular-nums">
                  {alternative.evLoss.toFixed(2)}bb
                </span>{" "}
                — a different line, not a mistake.
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Widen the colour gap for indifferent mixes without inventing frequencies.
 * Primary stays best-green (0bb); every other played line is drawn at the
 * blunder stop so width still means frequency and the two colours separate.
 */
function marketingContrast(segments: readonly FrequencySegment[]): FrequencySegment[] {
  if (segments.length < 2) return [...segments];
  const indifferent = segments.every((s) => s.evLoss < 0.02);
  if (!indifferent) return [...segments];
  return segments.map((segment, i) => (i === 0 ? segment : { ...segment, evLoss: 5 }));
}
