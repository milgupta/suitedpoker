"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { staggerDelay, DURATION } from "@/lib/motion";

export interface SegmentedMeterProps {
  value: number;
  max?: number;
  segments?: number;
  /** Any CSS colour. Defaults to the interface accent. */
  color?: string;
  className?: string;
  label?: string;
}

/**
 * Discrete blocks rather than a continuous fill.
 *
 * The discreteness is the point: five filled blocks out of eight reads as a
 * precise, countable quantity, where a bar at 62% reads as an approximation.
 * It also makes progress legible at a glance on a phone without a number.
 */
export function SegmentedMeter({
  value,
  max = 100,
  segments = 5,
  color = "var(--color-accent)",
  className,
  label,
}: SegmentedMeterProps) {
  const reduced = useReducedMotion() ?? false;
  const safeMax = max <= 0 ? 1 : max;
  const ratio = Math.min(1, Math.max(0, value / safeMax));
  const filled = Math.round(ratio * segments);
  const step = staggerDelay(segments);

  return (
    <div
      className={cn("flex w-full gap-1", className)}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label ?? "Progress"}
    >
      {Array.from({ length: segments }, (_, i) => {
        const on = i < filled;
        return (
          <motion.span
            key={i}
            className="bg-surface-3 h-1.5 flex-1 rounded-full"
            initial={reduced ? false : { opacity: 0.4 }}
            animate={{
              opacity: 1,
              backgroundColor: on ? color : "var(--color-surface-3)",
            }}
            transition={{
              duration: DURATION.fast,
              delay: reduced || !on ? 0 : i * step,
            }}
          />
        );
      })}
    </div>
  );
}
