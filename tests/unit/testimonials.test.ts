/**
 * NOTHING ON THE PAYMENT SCREEN IS ATTRIBUTED TO SOMEONE WHO DID NOT SAY IT.
 *
 * The FTC's rule on consumer reviews and testimonials (16 CFR Part 465) makes
 * a fabricated testimonial a per-instance civil penalty, and a checkout page is
 * where it is least defensible. This is the build-time half of that guarantee;
 * `tests/e2e/paywall.spec.ts` checks the rendered page.
 *
 * The rule is enforced through `source`: every quote has to say where it came
 * from, specifically enough to find the person again. It is impossible to fill
 * that field honestly for someone who does not exist, which is the point — the
 * check is not a regex looking for suspicious prose, it is a field that only a
 * real quote can populate.
 */

import { describe, expect, it } from "vitest";
import { PROOF_POINTS, TESTIMONIALS } from "../../src/content/testimonials";

describe("testimonials", () => {
  it.each(TESTIMONIALS.map((t, i) => [i, t] as const))(
    "testimonial %i is traceable to a person",
    (_i, testimonial) => {
      expect(testimonial.quote.trim().length, "an empty quote").toBeGreaterThan(0);
      expect(testimonial.name.trim().length, "an unattributed quote").toBeGreaterThan(0);
      expect(
        testimonial.source.trim().length,
        `"${testimonial.quote.slice(0, 40)}…" has no source — where did this come from?`,
      ).toBeGreaterThan(0);
    },
  );

  it("has a source for every quote", () => {
    // Stated separately from the per-entry check so an EMPTY list still asserts
    // something: it.each over [] runs zero tests and reports green.
    const unsourced = TESTIMONIALS.filter((t) => t.source.trim() === "");
    expect(unsourced, "a testimonial with no source is a fabricated one").toEqual([]);
  });

  it("names no name twice", () => {
    // Two quotes from one person read as two people and inflate the count.
    const names = TESTIMONIALS.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the proof band's fallback", () => {
  it("has enough points to fill a track", () => {
    // The marquee repeats to a minimum, but a list of two reads as a list of
    // two however many times it is repeated.
    expect(PROOF_POINTS.length).toBeGreaterThanOrEqual(6);
  });

  it("makes no claim about a person", () => {
    // The fallback exists precisely because there are no quotes yet. A line
    // that reads as one — "students say", "players love" — puts the page right
    // back where it started.
    for (const point of PROOF_POINTS) {
      expect(point, `"${point}" reads as social proof`).not.toMatch(
        /\b(?:users?|players?|students?|customers?|subscribers?)\s+(?:say|love|report|rate|agree)/i,
      );
      expect(point, `"${point}" quotes someone`).not.toMatch(/["“”]/);
    }
  });

  it("states no percentage or count that nothing computes", () => {
    // "92% improved their grades" is the shape this guards against. A number in
    // a proof point has to come from the product, not from a copywriter.
    for (const point of PROOF_POINTS) {
      expect(point, `"${point}" carries an unverifiable statistic`).not.toMatch(
        /\d+\s*%|\b\d[\d,.]*\s*(?:m|k)\+/i,
      );
    }
  });
});
