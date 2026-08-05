"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * `reducedMotion="user"` makes Framer Motion honour the OS setting for every
 * animation in the tree, including ones that forget to check it themselves.
 *
 * The primitives in this directory do NOT rely on it — each drops its own
 * transforms explicitly — but a belt-and-braces default is worth having when
 * later substages add one-off animations.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
