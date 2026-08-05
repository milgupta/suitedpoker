/**
 * The reduced-motion contract, asserted on the variants themselves.
 *
 * This is the strongest place to check it: if a reduced variant contains no
 * transform key, Framer Motion has nothing to write to the element's style, so
 * the guarantee holds regardless of how a component composes the preset.
 */

import { describe, expect, it } from "vitest";
import {
  DURATION,
  DURATION_MS,
  EASE,
  SPRING,
  STAGGER_TOTAL_MS,
  VARIANT_PRESETS,
  fadeUp,
  scaleIn,
  slideInRight,
  staggerContainer,
  staggerDelay,
  withDelay,
} from "../../src/lib/motion";

const TRANSFORM_KEYS = [
  "x",
  "y",
  "z",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "skew",
  "skewX",
  "skewY",
  "translateX",
  "translateY",
];

function targetKeys(variants: Record<string, unknown>): string[] {
  return Object.values(variants).flatMap((v) =>
    typeof v === "object" && v !== null ? Object.keys(v) : [],
  );
}

describe("reduced motion", () => {
  const presets = Object.entries(VARIANT_PRESETS);

  it.each(presets)("%s collapses to opacity-only", (_name, preset) => {
    const keys = targetKeys(preset(true) as Record<string, unknown>);
    expect(keys.filter((k) => TRANSFORM_KEYS.includes(k))).toEqual([]);
    expect(new Set(keys.filter((k) => k !== "transition"))).toEqual(new Set(["opacity"]));
  });

  it("still animates transforms when reduced motion is off", () => {
    expect(targetKeys(fadeUp(false) as Record<string, unknown>)).toContain("y");
    expect(targetKeys(scaleIn(false) as Record<string, unknown>)).toContain("scale");
    expect(targetKeys(slideInRight(false) as Record<string, unknown>)).toContain("x");
  });

  it("keeps the stagger sequence but not the transforms", () => {
    const reduced = staggerContainer(true, 6);
    expect(targetKeys(reduced as Record<string, unknown>)).not.toContain("y");
    const visible = reduced["visible"] as { transition?: { staggerChildren?: number } };
    expect(visible.transition?.staggerChildren).toBeGreaterThan(0);
  });
});

describe("stagger timing", () => {
  it("returns no delay for a single child", () => {
    expect(staggerDelay(1)).toBe(0);
    expect(staggerDelay(0)).toBe(0);
  });

  it.each([2, 6, 13, 50, 169, 1000])(
    "keeps a %i-child stagger inside the 300ms budget",
    (count) => {
      const totalMs = staggerDelay(count) * 1000 * count;
      expect(totalMs).toBeLessThanOrEqual(STAGGER_TOTAL_MS);
    },
  );

  it("uses the full step when there is room for it", () => {
    // 4 children x 40ms = 160ms, comfortably inside the budget.
    expect(staggerDelay(4)).toBeCloseTo(0.04);
  });
});

describe("motion tokens", () => {
  it("matches the durations declared in globals.css", () => {
    expect(DURATION_MS).toEqual({ instant: 100, fast: 180, base: 260, slow: 420 });
    expect(DURATION.base).toBeCloseTo(0.26);
  });

  it("never exceeds the slow duration", () => {
    for (const ms of Object.values(DURATION_MS)) {
      expect(ms).toBeLessThanOrEqual(DURATION_MS.slow);
    }
  });

  it("carries the four springs from DESIGN.md §7", () => {
    expect(SPRING.snappy).toMatchObject({ stiffness: 400, damping: 30 });
    expect(SPRING.smooth).toMatchObject({ stiffness: 260, damping: 26 });
    expect(SPRING.gentle).toMatchObject({ stiffness: 170, damping: 26 });
    expect(SPRING.bouncy).toMatchObject({ stiffness: 500, damping: 22 });
  });

  it("exposes three easings as cubic-bezier control points", () => {
    for (const points of Object.values(EASE)) {
      expect(points).toHaveLength(4);
    }
  });
});

describe("withDelay", () => {
  it("adds a delay without discarding the preset's spring", () => {
    const delayed = withDelay(fadeUp(false), 0.2) as {
      visible: { y: number; transition: Record<string, unknown> };
    };
    expect(delayed.visible.transition["delay"]).toBe(0.2);
    expect(delayed.visible.transition["type"]).toBe("spring");
    expect(delayed.visible.transition["stiffness"]).toBe(260);
    expect(delayed.visible.y).toBe(0);
  });

  it("is a no-op at zero", () => {
    const variants = fadeUp(false);
    expect(withDelay(variants, 0)).toBe(variants);
  });
});
