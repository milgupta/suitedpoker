"use client";

import { motion, useReducedMotion } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { GRADE_MARKS, type Grade } from "@/lib/grade";
import { SPRING } from "@/lib/motion";

const badge = cva(
  "inline-flex items-center gap-2 border font-semibold whitespace-nowrap rounded-full",
  {
    variants: {
      size: {
        sm: "text-caption px-2.5 py-1",
        default: "text-body-md px-3 py-1.5",
        lg: "text-heading-md px-4 py-2",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface GradeBadgeProps extends VariantProps<typeof badge> {
  grade: Grade;
  className?: string;
  /** Skip the entrance animation — for lists and history, where it would be noise. */
  static?: boolean;
}

/**
 * The result of a decision, in the grade's own colour on its 12% fill.
 *
 * Colour is never the only signal (DESIGN.md rule 4): the icon and the word
 * both ship, so this stays readable in greyscale and to the ~8% of men with
 * red-green colour deficiency — which matters more here than almost anywhere,
 * because this audience is overwhelmingly male.
 *
 * It springs in on `bouncy`. That is deliberate and worth more than it looks:
 * this badge is the emotional payoff of every hand in the product.
 */
export function GradeBadge({ grade, size, className, static: isStatic = false }: GradeBadgeProps) {
  const reduced = useReducedMotion() ?? false;
  const mark = GRADE_MARKS[grade];

  const style = {
    color: `var(--color-grade-${grade})`,
    background: `var(--color-grade-${grade}-fill)`,
    borderColor: `var(--color-grade-${grade}-border)`,
    // Sharp is `best` plus a glow — the only grade that gets one.
    ...(grade === "sharp" ? { boxShadow: "0 0 20px var(--color-grade-sharp-glow)" } : {}),
  };

  if (isStatic || reduced) {
    return (
      <span className={cn(badge({ size }), className)} style={style}>
        <span aria-hidden="true">{mark.icon}</span>
        {mark.label}
      </span>
    );
  }

  return (
    <motion.span
      className={cn(badge({ size }), className)}
      style={style}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING.bouncy}
    >
      <span aria-hidden="true">{mark.icon}</span>
      {mark.label}
    </motion.span>
  );
}
