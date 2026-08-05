"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { pageTransition } from "@/lib/motion";

/**
 * Route-level fade. Opacity only in both branches by design — a transform on a
 * whole page is the thing that makes an app feel slow rather than smooth.
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      className={className}
      variants={pageTransition(reduced)}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
