"use client";

import { FrequencyBar } from "@/components/poker/FrequencyBar";
import { PlayingCard } from "@/components/poker/PlayingCard";
import { GradeBadge } from "@/components/ui/grade-badge";
import { actionVerb } from "@/lib/action-label";
import type { Showcase } from "@/lib/landing-showcase";
import { marketingContrast } from "@/lib/marketing-contrast";
import { combosOf } from "@/poker/range";

/**
 * The hero panel: one real hand, the real mix, and what the minority line costs.
 *
 * Frequencies always come from the solution file. Colour on this panel is a
 * deliberate exception: a true mix has ~0 EV gap on every played line, so
 * `evColor` paints the whole bar one green and the 70/30 split vanishes. The
 * arena keeps honest EV colouring; the landing page paints the minority at the
 * inaccuracy (yellow) stop so a first-time visitor can SEE the mix — the same
 * yellow the product uses for a small EV gap in-game. The copy below says that
 * out loud.
 */
export function DecisionShowcase({ showcase }: { showcase: Showcase }) {
  const [top, ...rest] = showcase.segments;
  const alternative = rest[0];
  const barSegments = marketingContrast(showcase.segments);
  // One concrete combo of the hand key — same pick ChoiceGrid uses for tiles.
  const combo = combosOf(showcase.hand)[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {combo !== undefined ? (
            <div className="flex items-center gap-1.5" role="img" aria-label={showcase.hand}>
              <PlayingCard card={combo[0]} size="md" />
              <PlayingCard card={combo[1]} size="md" index={1} dealCount={2} />
            </div>
          ) : (
            <span className="border-border-strong bg-surface-1 text-heading-md rounded-md border px-3 py-1.5 font-mono tabular-nums">
              {showcase.hand}
            </span>
          )}
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
                Both are worth exactly the same, which is the only reason to split a hand at all.
                The yellow is only so you can see the split.
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
