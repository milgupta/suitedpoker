/**
 * evColor() and evColorRgb() must never disagree.
 *
 * They exist because the DOM and a canvas need different representations of the
 * same ramp — one a `color-mix()` string the browser resolves, one concrete
 * channels. Two implementations of one ramp is exactly the shape that drifts,
 * so this pins them to each other at every stop AND between stops.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { formatRgb, mixOklab, parseCssColor } from "../../src/lib/color";
import { BLUNDER_SATURATION_BB, EV_STOPS, evColor, evColorRgb } from "../../src/lib/ev-color";
import { readColorTokens, requireColor } from "../support/tokens";

const colors = readColorTokens();

beforeAll(() => {
  // jsdom does not load globals.css, so put the real token values — read from
  // that same file — onto the root element the functions will query.
  for (const stop of EV_STOPS) {
    document.documentElement.style.setProperty(
      stop.token,
      formatRgb(requireColor(stop.token, colors)),
    );
  }
});

describe("evColor / evColorRgb", () => {
  it.each(EV_STOPS)("returns the bare token at the $token stop ($bb bb)", (stop) => {
    expect(evColor(stop.bb)).toBe(`var(${stop.token})`);
  });

  it.each(EV_STOPS)("resolves $token to its exact value at $bb bb", (stop) => {
    expect(evColorRgb(stop.bb)).toBe(formatRgb(requireColor(stop.token, colors)));
  });

  it("agrees between the two functions at every point on the ramp", () => {
    // Walk the whole range, not just the stops — a percentage-formatting bug in
    // evColor() would only show up between them.
    for (let bb = -1; bb <= BLUNDER_SATURATION_BB + 2; bb += 0.05) {
      const css = evColor(bb);
      const rgb = evColorRgb(bb);

      const mix = /^color-mix\(in oklab, var\((.+?)\) ([\d.]+)%, var\((.+?)\)\)$/.exec(css);
      if (mix === null) {
        // At or beyond a stop both must name the same single colour.
        const bare = /^var\((.+)\)$/.exec(css);
        expect(bare, `evColor(${bb}) returned an unrecognised form: ${css}`).not.toBeNull();
        const token = bare?.[1];
        expect(token).toBeDefined();
        expect(rgb).toBe(formatRgb(requireColor(token as string, colors)));
        continue;
      }

      const [, fromToken, percent, toToken] = mix;
      expect(fromToken).toBeDefined();
      expect(toToken).toBeDefined();
      expect(percent).toBeDefined();

      const t = 1 - parseFloat(percent as string) / 100;
      const expected = formatRgb(
        mixOklab(
          requireColor(fromToken as string, colors),
          requireColor(toToken as string, colors),
          t,
        ),
      );
      expect(rgb, `disagreement at ${bb.toFixed(2)}bb`).toBe(expected);
    }
  });

  it("clamps a negative loss to best and an extreme loss to blunder", () => {
    expect(evColor(-5)).toBe("var(--color-grade-best)");
    expect(evColor(0)).toBe("var(--color-grade-best)");
    expect(evColor(999)).toBe("var(--color-grade-blunder)");
    expect(evColorRgb(999)).toBe(formatRgb(requireColor("--color-grade-blunder", colors)));
  });

  it("handles a non-finite loss without throwing", () => {
    expect(evColor(Number.NaN)).toBe("var(--color-grade-best)");
    expect(evColor(Number.POSITIVE_INFINITY)).toBe("var(--color-grade-blunder)");
  });

  it("moves monotonically away from green as the loss grows", () => {
    const greenness = (bb: number): number => {
      const parsed = parseCssColor(evColorRgb(bb));
      if (parsed === null) throw new Error(`unparseable at ${bb}`);
      return parsed.g - parsed.r;
    };

    const samples = [0, 0.5, 1, 2, 3, 5, 7, 10].map(greenness);
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      expect(curr as number).toBeLessThanOrEqual(prev as number);
    }
  });

  it("throws a useful error when the tokens are not on the element", () => {
    const bare = document.createElement("div");
    expect(() => evColorRgb(1, bare)).toThrow(/is not set on this element/);
  });
});
