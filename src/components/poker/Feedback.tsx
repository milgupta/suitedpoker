"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import type { Grade } from "@/poker/grader";
import { GradeBadge } from "@/components/ui/grade-badge";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { DURATION, SPRING } from "@/lib/motion";
import { FrequencyBar, type FrequencySegment } from "./FrequencyBar";
import { cn } from "@/lib/utils";

export interface FeedbackProps {
  result: Grade;
  ratingDelta?: number;
  onNext: () => void;
  /**
   * The AI explanation slot. Passed in rather than fetched here so this stays a
   * presentational component — the styleguide renders it with nothing, and the
   * arena renders it with a live stream.
   */
  explanation?: ReactNode;
  className?: string;
}

const VERB: Record<string, string> = {
  fold: "folded",
  call: "called",
  check: "checked",
  raise: "raised",
  bet: "bet",
  allin: "shoved",
};

function toSegments(result: Grade): FrequencySegment[] {
  const lossByAction = new Map(result.alternativeActions.map((a) => [a.action, a.evLoss]));
  lossByAction.set(result.bestAction, 0);

  return Object.entries(result.frequencies)
    .map(([action, freq]) => ({ action, freq, evLoss: lossByAction.get(action) ?? 0 }))
    .sort((a, b) => b.freq - a.freq);
}

/** One line of why, generated from the solution data — no AI round trip. */
function whyLine(result: Grade): string {
  const topPct = Math.round(result.topFreq * 100);

  if (result.displayMode === "mixed") {
    return `No single action is right here — a solver splits between ${Object.keys(
      result.frequencies,
    )
      .slice(0, 3)
      .join(", ")}, so both lines are part of a balanced strategy.`;
  }

  if (result.isBalancedAlternative) {
    // The rule that stops grading and display contradicting each other: if the
    // action is genuinely part of the mix, the copy has to say so.
    const chosenPct = Math.round((result.frequencies[result.chosenAction] ?? 0) * 100);
    return `A solver ${VERB[result.chosenAction] ?? result.chosenAction} here ${chosenPct}% of the time, so this is a real part of the strategy — just not the most common one.`;
  }

  if (result.evLoss === 0) {
    return `${result.bestAction} is the highest-EV action here, taken ${topPct}% of the time.`;
  }

  return `${result.bestAction} is the highest-EV action here (${topPct}% of the time); ${result.chosenAction} gives up ${result.evLoss.toFixed(2)}bb.`;
}

function RatingDelta({ delta }: { delta: number }) {
  const reduced = useReducedMotion() ?? false;
  if (delta === 0) return null;

  return (
    <motion.span
      className="text-body-md font-mono font-semibold tabular-nums"
      style={{
        color: delta > 0 ? "var(--color-grade-best)" : "var(--color-grade-mistake)",
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: [8, 0, -4, -12] }}
      // Fires AFTER the badge, not with it — two things popping at once reads
      // as noise rather than as a result.
      transition={{ duration: DURATION.slow, delay: DURATION.base, times: [0, 0.2, 0.7, 1] }}
    >
      {delta > 0 ? `+${delta}` : delta}
    </motion.span>
  );
}

export function Feedback({
  result,
  ratingDelta = 0,
  onNext,
  explanation,
  className,
}: FeedbackProps) {
  const reduced = useReducedMotion() ?? false;
  const segments = toSegments(result);
  const [mixOpen, setMixOpen] = useState(result.displayMode === "mixed");

  // Space and Enter advance. Not while a control has focus, or pressing Space
  // on the disclosure would also skip the hand.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "button") return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext]);

  const splitLabel = segments
    .slice(0, 2)
    .map((s) => Math.round(s.freq * 100))
    .join(" / ");

  return (
    <motion.section
      className={cn(
        "border-border bg-surface-1 flex flex-col gap-5 rounded-lg border p-5",
        className,
      )}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.smooth}
      aria-live="polite"
    >
      {/* 1. Result line */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-overline text-text-tertiary font-mono uppercase">
          You {VERB[result.chosenAction] ?? result.chosenAction}
        </span>
        <GradeBadge grade={result.grade} />
        <span className="text-body-md font-mono tabular-nums">
          {result.evLoss === 0 ? "0.00bb" : `−${result.evLoss.toFixed(2)}bb`}
        </span>
        <RatingDelta delta={ratingDelta} />
      </div>

      {/* 2. The verdict — branches on displayMode */}
      {result.displayMode === "mixed" ? (
        <div>
          <h2 className="text-display-md">This one&apos;s a genuine mix.</h2>
          <p className="text-text-secondary text-body-md mt-2">
            The frequencies are the lesson here, not a single right answer.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-display-md" style={{ color: "var(--color-grade-best)" }}>
            {result.bestAction.charAt(0).toUpperCase() + result.bestAction.slice(1)}.
          </span>
          {result.displayMode === "preferred" && (
            <span className="text-text-secondary text-body-lg">
              — but {segments[1]?.action ?? "the alternative"} is close
            </span>
          )}
        </div>
      )}

      {/* 3. The frequency bar. Expanded for a mix; behind a disclosure otherwise. */}
      {result.displayMode === "mixed" ? (
        <FrequencyBar segments={segments} chosenAction={result.chosenAction} />
      ) : (
        <div>
          <Button
            variant="bare"
            size="sm"
            onClick={() => setMixOpen((v) => !v)}
            aria-expanded={mixOpen}
            aria-controls="solver-mix"
          >
            {result.displayMode === "preferred" ? `Full mix · ${splitLabel}` : "Full solver mix"}
            <span aria-hidden="true">{mixOpen ? "▴" : "▾"}</span>
          </Button>
          {mixOpen && (
            <div id="solver-mix" className="mt-3">
              <FrequencyBar segments={segments} chosenAction={result.chosenAction} />
            </div>
          )}
        </div>
      )}

      {/* 4. One line of why, always present */}
      <p className="text-text-secondary text-body-md">{whyLine(result)}</p>

      {/* 5. AI explanation slot */}
      {explanation ?? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-4/5" />
        </div>
      )}

      {/* 7. Next */}
      <Button variant="primary" size="lg" className="w-full" onClick={onNext}>
        Next hand
        <span className="text-caption opacity-60">Space</span>
      </Button>
    </motion.section>
  );
}
