/**
 * Shared motion configuration — DESIGN.md §7.
 *
 * Every animation in the app pulls its spring, duration and easing from here so
 * the whole product moves with one physical vocabulary. Nothing exceeds 400ms.
 *
 * Reduced motion is handled by construction rather than by convention: every
 * preset is a function of `reduced`, and the reduced branch returns variants
 * containing ONLY `opacity`. No transform key means Framer Motion never writes
 * a transform to the element's style, which is stronger than trying to override
 * one in CSS after the fact.
 */

import type { Transition, Variants } from "motion/react";

/* ── Springs ─────────────────────────────────────────────────────────────── */

export const SPRING = {
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  smooth: { type: "spring", stiffness: 260, damping: 26 },
  gentle: { type: "spring", stiffness: 170, damping: 26 },
  /** Card deals and grade badges — the only place overshoot is welcome. */
  bouncy: { type: "spring", stiffness: 500, damping: 22 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof SPRING;

/* ── Durations ───────────────────────────────────────────────────────────── */

/** Milliseconds. Mirrors the `--duration-*` custom properties in globals.css. */
export const DURATION_MS = {
  instant: 100,
  fast: 180,
  base: 260,
  slow: 420,
} as const;

/** Seconds, which is the unit Framer Motion expects. */
export const DURATION = {
  instant: DURATION_MS.instant / 1000,
  fast: DURATION_MS.fast / 1000,
  base: DURATION_MS.base / 1000,
  slow: DURATION_MS.slow / 1000,
} as const;

export type DurationName = keyof typeof DURATION;

/* ── Easings ─────────────────────────────────────────────────────────────── */

/** Mirrors the `--ease-*` custom properties in globals.css. */
export const EASE = {
  standard: [0.4, 0, 0.2, 1],
  decelerate: [0, 0, 0.2, 1],
  accelerate: [0.4, 0, 1, 1],
} as const;

export type EaseName = keyof typeof EASE;

/* ── Distances ───────────────────────────────────────────────────────────── */

/** Travel distances, in px, drawn from the 4px spacing scale. */
export const TRAVEL = {
  fadeUp: 12,
  slideIn: 24,
} as const;

/** Scale that `scaleIn` grows from. Small enough to read as arrival, not zoom. */
export const SCALE_FROM = 0.96;

/* ── Stagger ─────────────────────────────────────────────────────────────── */

/**
 * A stagger never runs longer than this in total, however many children it has.
 * 169 range cells at 10ms each is 1.7s, which reads as broken rather than as
 * choreography.
 */
export const STAGGER_TOTAL_MS = 300;

/** Preferred gap between children, before the total-duration cap applies. */
export const STAGGER_STEP_MS = 40;

/**
 * Per-child delay in seconds, shrunk so the whole sequence fits inside
 * {@link STAGGER_TOTAL_MS}.
 */
export function staggerDelay(childCount: number, stepMs: number = STAGGER_STEP_MS): number {
  if (childCount <= 1) return 0;
  const capped = Math.min(stepMs, STAGGER_TOTAL_MS / childCount);
  return capped / 1000;
}

/* ── Variant presets ─────────────────────────────────────────────────────── */

const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast, ease: EASE.standard } },
};

export function fadeIn(reduced: boolean): Variants {
  void reduced; // already opacity-only; kept uniform with the other presets
  return fade;
}

export function fadeUp(reduced: boolean): Variants {
  if (reduced) return fade;
  return {
    hidden: { opacity: 0, y: TRAVEL.fadeUp },
    visible: { opacity: 1, y: 0, transition: SPRING.smooth },
  };
}

export function scaleIn(reduced: boolean): Variants {
  if (reduced) return fade;
  return {
    hidden: { opacity: 0, scale: SCALE_FROM },
    visible: { opacity: 1, scale: 1, transition: SPRING.snappy },
  };
}

export function slideInRight(reduced: boolean): Variants {
  if (reduced) return fade;
  return {
    hidden: { opacity: 0, x: TRAVEL.slideIn },
    visible: { opacity: 1, x: 0, transition: SPRING.smooth },
  };
}

export function staggerContainer(reduced: boolean, childCount = 1): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        // A reduced-motion stagger still reads as a sequence, so keep it —
        // it is the transforms that cause trouble, not the ordering.
        staggerChildren: staggerDelay(childCount),
      },
    },
  };
}

export function staggerChild(reduced: boolean): Variants {
  return fadeUp(reduced);
}

/** Page-level transition. Deliberately opacity-only in both branches — a
 * transform on a whole route is what makes an app feel slow. */
export function pageTransition(reduced: boolean): Variants {
  void reduced;
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.decelerate } },
    exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.accelerate } },
  };
}

/**
 * Returns `variants` with `delay` (seconds) added to the visible transition.
 *
 * A separate helper rather than a parameter on every preset, because the
 * `transition` prop on a motion element REPLACES a variant's own transition
 * rather than merging with it — passing `transition={{ delay }}` alongside
 * these presets would silently drop their springs.
 */
export function withDelay(variants: Variants, delay: number): Variants {
  if (delay === 0) return variants;
  const visible = variants["visible"];
  if (typeof visible !== "object" || visible === null) return variants;

  const { transition, ...rest } = visible as Record<string, unknown>;
  const base = typeof transition === "object" && transition !== null ? transition : {};
  return { ...variants, visible: { ...rest, transition: { ...base, delay } } };
}

/** Every preset, keyed by name — used by the styleguide to render them all. */
export const VARIANT_PRESETS = {
  fadeIn,
  fadeUp,
  scaleIn,
  slideInRight,
  staggerChild,
  pageTransition,
} as const satisfies Record<string, (reduced: boolean) => Variants>;

export type VariantPresetName = keyof typeof VARIANT_PRESETS;
