"use client";

import { motion, useReducedMotion } from "motion/react";
import { FlameIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion";
import { SPRING } from "@/lib/motion";

export interface StreakProps {
  days: number;
  className?: string;
}

/**
 * Days in a row. The flame pops on `bouncy` when the count changes — keyed on
 * the value so it re-fires on increment rather than only on mount.
 *
 * Zero is shown flat and grey rather than hidden: a broken streak the user can
 * see is what makes restarting it feel worth doing.
 */
export function Streak({ days, className }: StreakProps) {
  const reduced = useReducedMotion() ?? false;
  const alight = days > 0;

  return (
    <span
      className={cn(
        "border-border bg-surface-1 inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        className,
      )}
    >
      <motion.span
        key={days}
        initial={reduced || !alight ? false : { scale: 0.6, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={SPRING.bouncy}
        style={{ color: alight ? "var(--color-grade-inaccuracy)" : "var(--color-text-tertiary)" }}
        aria-hidden="true"
      >
        <FlameIcon className="size-4" />
      </motion.span>
      <span className="text-body-md font-mono font-semibold tabular-nums">
        <AnimatedNumber value={days} />
      </span>
      <span className="text-text-tertiary text-body-sm">
        {days === 1 ? "day" : "days"}
        <span className="sr-only"> streak</span>
      </span>
    </span>
  );
}
