/**
 * The EV-loss colour ramp — DESIGN.md §1.
 *
 * A function, not a palette. The frequency bar colours every segment through
 * this, so the entire app's grading colour language derives from one place.
 *
 * The six stop colours live ONLY in src/app/globals.css. Neither function here
 * contains a colour value:
 *
 *   evColor()    returns a `color-mix(in oklab, ...)` string for the DOM, so
 *                the browser resolves the custom properties itself.
 *   evColorRgb() reads those same custom properties at runtime and interpolates
 *                numerically, for canvas, SVG and screenshot rendering where a
 *                real channel value is needed.
 *
 * Both walk the same stop table and interpolate in the same space, and a unit
 * test pins them to each other at every stop so they cannot drift.
 */

import { formatRgb, mixOklab, parseCssColor } from "./color";

export interface EvStop {
  /** Big blinds of EV surrendered at which this colour is reached. */
  readonly bb: number;
  /** The custom property in globals.css holding the colour. */
  readonly token: string;
}

/**
 * best (0bb) -> solid (0.5) -> inaccuracy (2) -> mistake (5) -> blunder.
 *
 * DESIGN.md ends the ramp at "blunder beyond 5" without fixing where the colour
 * saturates. 10bb is the chosen saturation point: a pot-sized error at 100bb
 * depth, past which redder conveys nothing extra.
 */
export const EV_STOPS: readonly EvStop[] = [
  { bb: 0, token: "--color-grade-best" },
  { bb: 0.5, token: "--color-grade-solid" },
  { bb: 2, token: "--color-grade-inaccuracy" },
  { bb: 5, token: "--color-grade-mistake" },
  { bb: 10, token: "--color-grade-blunder" },
] as const;

export const BLUNDER_SATURATION_BB = 10;

interface Position {
  readonly from: EvStop;
  readonly to: EvStop;
  /** 0 at `from`, 1 at `to`. */
  readonly t: number;
}

/**
 * Locates a loss on the ramp. Negative losses (a play that beats the solver's
 * baseline through rounding) clamp to `best`; anything past the last stop
 * clamps to `blunder`.
 */
export function evStopPosition(bbLoss: number): Position {
  const first = EV_STOPS[0];
  const last = EV_STOPS[EV_STOPS.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error("EV_STOPS is empty");
  }

  // NaN is treated as "no loss recorded" rather than as an error, so a missing
  // EV never paints a hand red. Infinity legitimately clamps to blunder below.
  if (Number.isNaN(bbLoss) || bbLoss <= first.bb) {
    return { from: first, to: first, t: 0 };
  }
  if (bbLoss >= last.bb) {
    return { from: last, to: last, t: 0 };
  }

  for (let i = 0; i < EV_STOPS.length - 1; i++) {
    const from = EV_STOPS[i];
    const to = EV_STOPS[i + 1];
    if (from === undefined || to === undefined) continue;
    if (bbLoss >= from.bb && bbLoss <= to.bb) {
      return { from, to, t: (bbLoss - from.bb) / (to.bb - from.bb) };
    }
  }

  return { from: last, to: last, t: 0 };
}

/** Trims float noise so the emitted string is stable across renders. */
const pct = (v: number): string => String(Math.round(v * 1000) / 1000);

/**
 * A CSS colour for a given EV loss, in big blinds.
 *
 * Returns `var(--color-grade-best)` at a stop and a `color-mix(in oklab, ...)`
 * between two, which keeps every literal colour in globals.css.
 */
export function evColor(bbLoss: number): string {
  const { from, to, t } = evStopPosition(bbLoss);
  if (from === to || t === 0) return `var(${from.token})`;
  if (t === 1) return `var(${to.token})`;
  return `color-mix(in oklab, var(${from.token}) ${pct((1 - t) * 100)}%, var(${to.token}))`;
}

/**
 * The same colour as {@link evColor}, resolved to concrete channels for canvas,
 * SVG and image rendering.
 *
 * Reads the stop colours from `scope`'s computed style, so it requires a DOM
 * with globals.css applied (or the custom properties set directly on `scope`).
 */
export function evColorRgb(bbLoss: number, scope?: Element): string {
  const el = scope ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (el === undefined) {
    throw new Error("evColorRgb requires a DOM; pass an element or use evColor() instead.");
  }

  const styles = getComputedStyle(el);
  const read = (token: string) => {
    const raw = styles.getPropertyValue(token);
    const parsed = parseCssColor(raw);
    if (parsed === null) {
      throw new Error(`Grade token ${token} is not set on this element (got "${raw}").`);
    }
    return parsed;
  };

  const { from, to, t } = evStopPosition(bbLoss);
  if (from === to || t === 0) return formatRgb(read(from.token));
  return formatRgb(mixOklab(read(from.token), read(to.token), t));
}
