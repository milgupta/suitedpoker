"use client";

import { useSyncExternalStore } from "react";
import { contrastRatio, parseCssColor, type Rgb } from "@/lib/color";

const noopSubscribe = () => () => {};

/**
 * True once hydrated.
 *
 * Every value on this page is resolved by the browser from the real stylesheet,
 * so none of it exists during SSR. Rendering it unguarded produces a hydration
 * mismatch; useSyncExternalStore gives the server and the first client render
 * the same answer and re-renders once after.
 */
export function useResolved(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Resolves any CSS colour expression — `var()`, `color-mix()`, nested chains —
 * to concrete channels by letting the browser do it.
 *
 * `getComputedStyle().getPropertyValue()` substitutes `var()` but leaves
 * `color-mix()` untouched, because a custom property's computed value is a
 * token stream rather than a colour. Assigning to a real `color` property and
 * reading it back forces full resolution.
 */
export function resolveColor(expression: string): Rgb | null {
  if (typeof document === "undefined") return null;

  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = expression;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  return parseCssColor(computed);
}

export function resolveToken(token: string): Rgb | null {
  return resolveColor(`var(${token})`);
}

/** Contrast of one token against another, or null if either is unresolvable. */
export function tokenContrast(fg: string, bg: string, backdrop?: string): number | null {
  const f = resolveToken(fg);
  const b = resolveToken(bg);
  if (f === null || b === null) return null;
  const back = backdrop === undefined ? b : resolveToken(backdrop);
  return contrastRatio(f, b, back ?? b);
}

/** Reads a non-colour custom property, e.g. `--radius-lg` -> `18px`. */
export function readVar(token: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}
