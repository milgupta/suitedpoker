"use client";

import { useReducedMotion } from "motion/react";

export interface ShimmerProps {
  className?: string;
  /** Announced to screen readers while content is pending. */
  label?: string;
}

/**
 * Skeleton placeholder. A light sweep travels across a `--surface-2` block.
 *
 * Under `prefers-reduced-motion` the sweep is not rendered at all — the block
 * stays a static surface rather than animating faster.
 */
export function Shimmer({ className, label = "Loading" }: ShimmerProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <div
      className={`bg-surface-2 relative overflow-hidden rounded-md ${className ?? ""}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {!reduced && (
        <div
          className="animate-shimmer via-border-strong absolute inset-0 bg-gradient-to-r from-transparent to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
