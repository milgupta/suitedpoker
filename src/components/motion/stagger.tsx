"use client";

import { motion, useReducedMotion } from "motion/react";
import { Children, type ReactNode } from "react";
import { staggerChild, staggerContainer } from "@/lib/motion";

export interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** Animate when scrolled into view instead of on mount. */
  whenInView?: boolean;
}

/**
 * Reveals its children in sequence, capped at 300ms total however many there
 * are — 169 range cells at 10ms each is 1.7s and reads as broken.
 *
 * Each direct child is wrapped in a motion element so it can carry the child
 * variant. If that wrapper is a problem for your layout (a grid where the child
 * must be the grid item), compose `StaggerContainer` and `StaggerItem` yourself.
 */
export function Stagger({ children, className, whenInView = false }: StaggerProps) {
  const reduced = useReducedMotion() ?? false;
  const items = Children.toArray(children);

  return (
    <motion.div
      className={className}
      variants={staggerContainer(reduced, items.length)}
      initial="hidden"
      {...(whenInView
        ? { whileInView: "visible", viewport: { once: true, amount: 0.2 } }
        : { animate: "visible" })}
    >
      {items.map((child, i) => (
        <motion.div key={i} variants={staggerChild(reduced)}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

export interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  /** Number of children, so the 300ms cap can be applied. */
  count: number;
  whenInView?: boolean;
}

export function StaggerContainer({
  children,
  className,
  count,
  whenInView = false,
}: StaggerContainerProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      className={className}
      variants={staggerContainer(reduced, count)}
      initial="hidden"
      {...(whenInView
        ? { whileInView: "visible", viewport: { once: true, amount: 0.2 } }
        : { animate: "visible" })}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div className={className} variants={staggerChild(reduced)}>
      {children}
    </motion.div>
  );
}
