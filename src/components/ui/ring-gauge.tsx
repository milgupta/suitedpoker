"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

export interface RingGaugeProps {
  value: number;
  max?: number;
  /** Outer diameter in px. */
  size?: number;
  thickness?: number;
  /** Any CSS colour — pass evColor(loss) to grade the ring. */
  color?: string;
  /** Centre content. Omit for a bare progress ring. */
  children?: ReactNode;
  label: string;
  className?: string;
}

/**
 * Circular progress, with optional centre content.
 *
 * One component rather than the separate ProgressRing and RingGauge the plan
 * lists: they are the same shape and differ only in whether the middle is
 * filled. Two names for one shape is how two subtly different rings end up
 * next to each other on the same screen.
 */
export function RingGauge({
  value,
  max = 100,
  size = 72,
  thickness = 6,
  color = "var(--color-accent)",
  children,
  label,
  className,
}: RingGaugeProps) {
  const reduced = useReducedMotion() ?? false;
  const safeMax = max <= 0 ? 1 : max;
  const ratio = Math.min(1, Math.max(0, value / safeMax));

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          stroke="var(--color-surface-3)"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduced ? circumference * (1 - ratio) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={reduced ? { duration: 0 } : SPRING.smooth}
        />
      </svg>
      {children !== undefined && (
        <span className="absolute inset-0 flex items-center justify-center">{children}</span>
      )}
    </div>
  );
}
