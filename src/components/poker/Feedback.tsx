"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import type { Grade } from "@/poker/grader";
import { GradeBadge } from "@/components/ui/grade-badge";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { DURATION, SPRING } from "@/lib/motion";
import { actionLabel, actionPhrase, actionVerb } from "@/lib/action-label";
import { FrequencyBar, type FrequencySegment } from "./FrequencyBar";
import { cn } from "@/lib/utils";

export interface FeedbackProps {
  result: Grade;
  ratingDelta?: number;
  onNext: () => void;
  /**
   * 4.4's chat trigger and panel. Rendered BELOW the explanation and above
   * "next hand", so it never sits between the user and the next hand — a coach
   * that interrupts the loop stops being used by the people who need it.
   */
  chat?: ReactNode;
  /** Overrides "Next hand" — the demo hand's one CTA leads to the diagnosis. */
  nextLabel?: string;
  /**
   * True while the next hand is still in flight. With prefetch this is rare —
   * but when it happens the button must say so rather than swallow clicks.
   */
  nextPending?: boolean;
  /**
   * Where the numbers behind this grade came from. /methodology promises the
   * label is "visible in the product rather than buried here" — and the panel
   * that grades you against the numbers is where it belongs.
   */
  source?: { provenance: string; evConfidence: string } | null;
  /**
   * The AI explanation slot. Passed in rather than fetched here so this stays a
   * presentational component — the styleguide renders it with nothing, and the
   * arena renders it with a live stream.
   */
  explanation?: ReactNode;
  /**
   * When false, the frequency bar / mix disclosure is omitted — for surfaces
   * that already show the mix above the action buttons (Arena capsules).
   */
  showMix?: boolean;
  className?: string;
}

function toSegments(result: Grade): FrequencySegment[] {
  const lossByAction = new Map(result.alternativeActions.map((a) => [a.action, a.evLoss]));
  lossByAction.set(result.bestAction, 0);

  return Object.entries(result.frequencies)
    .map(([action, freq]) => ({ action, freq, evLoss: lossByAction.get(action) ?? 0 }))
    .sort((a, b) => b.freq - a.freq);
}

/**
 * The actions the strategy actually takes here, most-played first.
 *
 * The mixed-spot copy used to list the first three keys of `frequencies`
 * unfiltered, so a spot that never folds still read "splits between fold,
 * call, raise" — naming an action at 0% as part of the mix, on the one screen
 * whose entire job is to teach what the mix is.
 */
function playedActions(result: Grade): string[] {
  return Object.entries(result.frequencies)
    .filter(([, freq]) => freq > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([action]) => action);
}

/** One line of why, generated from the solution data — no AI round trip. */
function whyLine(result: Grade): string {
  const topPct = Math.round(result.topFreq * 100);
  const best = actionPhrase(result.bestAction);

  if (result.displayMode === "mixed") {
    const played = playedActions(result).slice(0, 3).map(actionPhrase);
    const list =
      played.length > 1
        ? `${played.slice(0, -1).join(", ")} and ${played[played.length - 1]}`
        : (played[0] ?? best);
    return `No single action is right here — the strategy splits between ${list}, so more than one line is part of a balanced approach.`;
  }

  if (result.isBalancedAlternative) {
    // The rule that stops grading and display contradicting each other: if the
    // action is genuinely part of the mix, the copy has to say so.
    const chosenPct = Math.round((result.frequencies[result.chosenAction] ?? 0) * 100);
    return `The chart ${actionVerb(result.chosenAction)} here ${chosenPct}% of the time, so this is a real part of the strategy — just not the most common one.`;
  }

  if (result.evLoss === 0) {
    return `${actionLabel(result.bestAction)} wins the most in the long run here, taken ${topPct}% of the time.`;
  }

  return `${actionLabel(result.bestAction)} wins the most in the long run here (${topPct}% of the time); ${actionPhrase(result.chosenAction)} gives up ${result.evLoss.toFixed(2)}bb.`;
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
  chat,
  nextLabel,
  nextPending = false,
  source,
  explanation,
  showMix = true,
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
          You {actionVerb(result.chosenAction)}
        </span>
        <GradeBadge grade={result.grade} />
        {/*
          Only print EV given up when there is some. "0.00bb" next to Best is
          true and empty — the badge already said they found the top line, and
          a zero loss reads as a missing figure rather than a clean result.
        */}
        {result.evLoss > 0 && (
          <span className="text-body-md font-mono tabular-nums">−{result.evLoss.toFixed(2)}bb</span>
        )}
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
            {actionLabel(result.bestAction)}.
          </span>
          {result.displayMode === "preferred" && (
            <span className="text-text-secondary text-body-lg">
              — but{" "}
              {segments[1]?.action === undefined
                ? "the alternative"
                : actionPhrase(segments[1].action)}{" "}
              is close
            </span>
          )}
        </div>
      )}

      {/* 3. The frequency bar. Expanded for a mix; behind a disclosure otherwise.
          Skipped when the parent already draws the mix (Arena capsules). */}
      {showMix &&
        (result.displayMode === "mixed" ? (
          <FrequencyBar segments={segments} chosenAction={result.chosenAction} />
        ) : (
          <div>
            <Button
              variant="bare"
              size="sm"
              onClick={() => setMixOpen((v) => !v)}
              aria-expanded={mixOpen}
              aria-controls="strategy-mix"
            >
              {result.displayMode === "preferred"
                ? `Full mix · ${splitLabel}`
                : "Full strategy mix"}
              <span aria-hidden="true">{mixOpen ? "▴" : "▾"}</span>
            </Button>
            {mixOpen && (
              <div id="strategy-mix" className="mt-3">
                <FrequencyBar segments={segments} chosenAction={result.chosenAction} />
              </div>
            )}
          </div>
        ))}

      {/* 4. One line of why, always present */}
      <p className="text-text-secondary text-body-md">{whyLine(result)}</p>

      {/* 5. AI explanation slot.
          `undefined` = still loading (shimmer). `null` = no explanation for this
          surface (Daily). A node = the streamed / template text. */}
      {explanation === undefined ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-4/5" />
        </div>
      ) : (
        explanation
      )}

      {/* 6. Ask about this hand (4.4). Never between the user and "next". */}
      {chat}

      {/* 6b. Data provenance — the honest label on the numbers above. */}
      {source != null && (
        <p className="text-text-tertiary text-caption text-center" data-source-quality>
          {source.provenance === "solver-verified"
            ? "Solver-verified strategy"
            : "Authored chart, not solver-verified"}
          {" · EV confidence: "}
          {source.evConfidence}
        </p>
      )}

      {/* 7. Next */}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onNext}
        disabled={nextPending}
      >
        {nextPending ? "Dealing…" : (nextLabel ?? "Next hand")}
        {nextLabel === undefined && !nextPending && (
          <span className="text-caption opacity-60">Space</span>
        )}
      </Button>
    </motion.section>
  );
}
