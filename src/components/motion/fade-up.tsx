"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, withDelay } from "@/lib/motion";

export interface FadeUpProps {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before starting. */
  delay?: number;
  /** Animate when scrolled into view instead of on mount. */
  whenInView?: boolean;
}

/**
 * Rises 12px into place on a smooth spring. Under `prefers-reduced-motion` the
 * variant carries no `y` at all, so no transform is ever written to the node.
 */
export function FadeUp({ children, className, delay = 0, whenInView = false }: FadeUpProps) {
  const reduced = useReducedMotion() ?? false;
  const variants = withDelay(fadeUp(reduced), delay);

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      {...(whenInView
        ? { whileInView: "visible", viewport: { once: true, amount: 0.2 } }
        : { animate: "visible" })}
    >
      {children}
    </motion.div>
  );
}
