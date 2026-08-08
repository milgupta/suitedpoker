"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { evColor } from "@/lib/ev-color";
import { DURATION, staggerDelay } from "@/lib/motion";
import { actionLabel } from "@/lib/action-label";
import { actionGridClass } from "@/lib/action-grid";
import { cn } from "@/lib/utils";

export interface FrequencySegment {
  action: string;
  /** 0–1. */
  freq: number;
  /** Big blinds given up by taking this action. */
  evLoss: number;
}

export interface FrequencyBarProps {
  segments: readonly FrequencySegment[];
  /** The action the user picked. Gets a white outline and stays labelled. */
  chosenAction?: string;
  className?: string;
}

/** Below this the percentage is dropped; below HIDE_ALL, both labels go. */
const HIDE_PCT_BELOW = 0.1;
const HIDE_ALL_BELOW = 0.05;

/**
 * Two variables in one bar: WIDTH is how often the solver takes an action,
 * COLOUR is what taking it costs.
 *
 * That pairing is the most important idea in the product. A 16% action that
 * costs 0.55bb renders narrow AND orange — rare and expensive. A 29% action
 * costing 0.18bb renders cool, because it is not a mistake. When every segment
 * is the same cool colour, the user has learned that several actions can be
 * fine without reading a word of copy.
 *
 * Colour comes only from evColor(). There are no colour literals in this file
 * and a test enforces that, because a hardcoded green here would quietly
 * decouple the bar from the grading language.
 */
export function FrequencyBar({ segments, chosenAction, className }: FrequencyBarProps) {
  const reduced = useReducedMotion() ?? false;
  const [revealed, setRevealed] = useState<string | null>(null);

  const total = segments.reduce((sum, s) => sum + s.freq, 0);
  const step = staggerDelay(segments.length);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* `role="group"`, NOT `role="img"`. Every segment is a real button, and
          an img with interactive descendants is an axe `nested-interactive`
          violation at serious severity — invalid markup that also leaves a
          screen-reader user unable to reach the buttons the label describes.
          A group may legitimately contain controls and still carry a name. */}
      <div
        className="border-border flex h-11 w-full overflow-hidden rounded-full border"
        role="group"
        aria-label={segments
          .map((s) => `${actionLabel(s.action)} ${Math.round(s.freq * 100)}%`)
          .join(", ")}
      >
        {segments.map((segment, i) => {
          const share = total > 0 ? segment.freq / total : 0;
          const isChosen = segment.action === chosenAction;
          const showName = share >= HIDE_ALL_BELOW || revealed === segment.action;
          const showPct = share >= HIDE_PCT_BELOW || revealed === segment.action;

          return (
            <motion.button
              key={segment.action}
              type="button"
              // A 3% segment is unreadable but must still be reachable — tapping
              // it reveals its label rather than hiding the data entirely.
              onClick={() =>
                setRevealed((current) => (current === segment.action ? null : segment.action))
              }
              className="relative flex h-full items-center justify-center overflow-hidden"
              style={{
                background: evColor(segment.evLoss),
                outline: isChosen ? "2px solid var(--color-text-primary)" : undefined,
                outlineOffset: "-2px",
                zIndex: isChosen ? 1 : 0,
              }}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: `${share * 100}%` }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: DURATION.base, delay: i * step, ease: "easeOut" }
              }
              aria-label={`${actionLabel(segment.action)}, ${Math.round(segment.freq * 100)} percent`}
            >
              <span className="text-caption text-canvas px-1 font-mono font-semibold whitespace-nowrap">
                {showName && actionLabel(segment.action)}
                {showName && showPct && " "}
                {showPct && `${Math.round(segment.freq * 100)}%`}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* The chosen action is always named in text, so the outline is never the
          only way to know what you picked. */}
      {chosenAction !== undefined && (
        <p className="text-text-tertiary text-caption">
          Outlined: your action — {actionLabel(chosenAction)}
        </p>
      )}
    </div>
  );
}

/**
 * The frequency capsules that sit directly above the action buttons.
 *
 * Hidden before the decision and revealed with the feedback. It demonstrates
 * what "GTO" means in one glance with zero copy, which is why it belongs on the
 * landing page and in ad creative too.
 *
 * The caller MUST pass segments in the same order as the buttons — a capsule
 * means nothing except as a label for the control underneath it. The grid comes
 * from `actionGridClass` for the same reason: an inline `repeat(n, 1fr)` here
 * kept one row while the buttons wrapped to two.
 */
export function FrequencyCapsules({
  segments,
  topAction,
  revealed,
  className,
}: {
  segments: readonly FrequencySegment[];
  topAction?: string;
  revealed: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", actionGridClass(segments.length), className)}>
      {segments.map((segment) => {
        const isTop = segment.action === topAction;
        return (
          <span
            key={segment.action}
            className={cn(
              "text-caption rounded-full border py-1 text-center font-mono font-semibold transition-opacity",
              revealed ? "opacity-100" : "opacity-0",
            )}
            style={{
              borderColor: isTop ? "var(--color-accent)" : "var(--color-border)",
              color: isTop ? "var(--color-accent-bright)" : "var(--color-text-secondary)",
              background: isTop ? "var(--color-accent-950)" : "transparent",
              boxShadow: isTop && revealed ? "0 0 16px var(--color-accent-glow)" : undefined,
            }}
            aria-hidden={!revealed}
          >
            {Math.round(segment.freq * 100)}%
          </span>
        );
      })}
    </div>
  );
}
