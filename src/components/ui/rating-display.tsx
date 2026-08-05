"use client";

import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "@/components/motion";
import { DURATION, SPRING } from "@/lib/motion";
import { tierFor } from "@/lib/rating";
import { cn } from "@/lib/utils";

export interface RatingDisplayProps {
  rating: number;
  /** The change from the last attempt. Floats up and fades. */
  delta?: number;
  /** True when this update crossed a tier boundary — a celebratory moment. */
  tieredUp?: boolean;
  className?: string;
}

/**
 * The number that goes up. This is the retention engine, so it gets the
 * treatment: a large tabular numeral, and a delta that floats rather than
 * simply appearing.
 */
export function RatingDisplay({
  rating,
  delta = 0,
  tieredUp = false,
  className,
}: RatingDisplayProps) {
  const reduced = useReducedMotion() ?? false;
  const tier = tierFor(rating);

  return (
    <div className={cn("relative flex flex-col items-start", className)}>
      <span className="text-overline text-text-tertiary uppercase">Rating</span>

      <span className="flex items-baseline gap-2">
        <span className="text-display-lg font-mono tabular-nums">
          <AnimatedNumber value={rating} />
        </span>

        {delta !== 0 && (
          <motion.span
            className="text-body-md font-mono font-semibold tabular-nums"
            style={{
              color: delta > 0 ? "var(--color-grade-best)" : "var(--color-grade-mistake)",
            }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduced ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: [10, 0, -6, -16] }}
            transition={{ duration: DURATION.slow, times: [0, 0.2, 0.7, 1] }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </motion.span>
        )}
      </span>

      <motion.span
        className="text-body-sm mt-1 rounded-full border px-2.5 py-0.5"
        style={{
          borderColor: tieredUp ? "var(--color-grade-best)" : "var(--color-border)",
          color: tieredUp ? "var(--color-grade-best)" : "var(--color-text-secondary)",
        }}
        // A tier-up has to feel earned, so it gets the bouncy spring rather
        // than fading in like a status change.
        animate={reduced || !tieredUp ? {} : { scale: [1, 1.15, 1] }}
        transition={SPRING.bouncy}
      >
        {tier.name}
        {tieredUp && <span className="ml-1">↑</span>}
      </motion.span>
    </div>
  );
}
