"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { SPRING, type SpringName } from "@/lib/motion";

export interface AnimatedNumberProps {
  value: number;
  /** Decimal places. bb/100 wants 1, accuracy wants 0. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  spring?: SpringName;
  /** Prefix a `+` on positive values, as EV figures conventionally do. */
  signed?: boolean;
}

function format(value: number, decimals: number, signed: boolean): string {
  const text = value.toFixed(decimals);
  // toFixed can produce "-0.0"; a signed zero reads as a bug in a stat.
  const normalised = Number(text) === 0 ? (0).toFixed(decimals) : text;
  return signed && Number(normalised) > 0 ? `+${normalised}` : normalised;
}

/**
 * Springs between values with tabular numerals, so a changing figure does not
 * jitter its own layout mid-animation.
 *
 * Under `prefers-reduced-motion` the value is written straight to the DOM with
 * no spring and no transform.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  spring = "smooth",
  signed = false,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion() ?? false;

  const source = useMotionValue(value);
  const springed = useSpring(source, SPRING[spring]);
  const text = useTransform(springed, (v) => format(v, decimals, signed));

  useEffect(() => {
    if (reduced) {
      // jump() skips the spring entirely rather than animating faster.
      source.jump(value);
      springed.jump(value);
      return;
    }
    source.set(value);
  }, [value, reduced, source, springed]);

  const settled = `${prefix}${format(value, decimals, signed)}${suffix}`;

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }} aria-label={settled}>
      <span aria-hidden="true">
        {prefix}
        {reduced ? format(value, decimals, signed) : <motion.span>{text}</motion.span>}
        {suffix}
      </span>
    </span>
  );
}
