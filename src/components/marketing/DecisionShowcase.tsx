"use client";

import { FrequencyBar } from "@/components/poker/FrequencyBar";
import { GradeBadge } from "@/components/ui/grade-badge";
import type { Showcase } from "@/lib/landing-showcase";

/**
 * The hero panel: one real hand, the real mix, and what the minority line costs.
 *
 * This is the actual `FrequencyBar` the product grades with, fed the actual
 * numbers out of the solution file — not a picture of it and not a pair of
 * divs with hand-written widths, which is what the previous page had (and its
 * widths did not match any node in the set).
 *
 * The colour of each segment therefore comes from `evColor()` via the bar
 * itself: width is how often, colour is what it costs. Nothing here re-derives
 * either.
 *
 * The grade arrives pre-resolved on `showcase`. Calling `bandFor` here would be
 * one import and roughly the whole poker engine — the grader reaches the hand
 * evaluator — on the page every ad click pays for.
 */
export function DecisionShowcase({ showcase }: { showcase: Showcase }) {
  const [top, ...rest] = showcase.segments;
  const alternative = rest[0];

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

      <FrequencyBar segments={showcase.segments} />

      {top !== undefined && alternative !== undefined && showcase.alternativeGrade !== null ? (
        <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
          <GradeBadge grade={showcase.alternativeGrade} size="sm" static />
          <p className="text-text-secondary text-body-md">
            {/* Every figure here is read off the same segments the bar drew. */}A solver{" "}
            {top.action}s this {Math.round(top.freq * 100)}% of the time and {alternative.action}s
            it {Math.round(alternative.freq * 100)}%. Taking the second one gives up{" "}
            <span className="text-text-primary font-mono tabular-nums">
              {alternative.evLoss.toFixed(2)}bb
            </span>{" "}
            — a different line, not a mistake.
          </p>
        </div>
      ) : null}
    </div>
  );
}
