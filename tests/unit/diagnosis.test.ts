/**
 * The diagnosis: computed, honest, and never an earnings claim.
 *
 * Three properties are enforced rather than eyeballed:
 *
 *   1. COMPUTED, NOT STATIC — changing any single onboarding answer changes
 *      the rendered diagnosis. A question that moves nothing is dead weight in
 *      the quiz or a bug here; either way this test names it.
 *   2. THE MATH IS REPRODUCIBLE — the tooltip's formula contains the same
 *      numbers the headline was computed from. If a poker player taps "how we
 *      estimate this" and the arithmetic does not reproduce the figure, every
 *      other number on the page is discounted with it.
 *   3. NEVER A WINNING — an estimated COST of a leak is not a promised PROFIT,
 *      and no rendering of any answer combination may cross that line. A
 *      play-money user gets big blinds, never dollars.
 */

import { describe, expect, it } from "vitest";
import {
  BB_VALUE_USD,
  buildDiagnosis,
  CURRICULUM_CEILING_RATING,
  estimateCost,
  HANDS_PER_YEAR,
  LEAK_BB100,
  roundClean,
} from "../../src/lib/diagnosis";
import { optionsFor, type Answers } from "../../src/lib/onboarding";

const BASE: Answers = {
  venue: "live_1_2",
  pain: "call_too_much",
  frequency: "weekly",
  goal: "stop_losing",
  study: "charts",
  leaks: ["facing_aggression"],
  minutes: "10",
};

/** Everything the screen prints, flattened so a change anywhere is visible. */
function rendered(answers: Answers): string {
  const d = buildDiagnosis(answers);
  return JSON.stringify(d);
}

describe("the 25 Q1 x Q2 combinations", () => {
  const venues = optionsFor("venue").map((o) => o.value);
  const pains = optionsFor("pain").map((o) => o.value);

  it("prints every headline and figure", () => {
    const rows: string[] = [];
    for (const venue of venues) {
      for (const pain of pains) {
        const d = buildDiagnosis({ ...BASE, venue, pain });
        const figure =
          d.cost.annualUsd !== null
            ? `$${d.cost.annualUsd.toLocaleString()}/yr`
            : `${d.cost.annualBb.toLocaleString()} bb/yr`;
        rows.push(`${venue.padEnd(14)} × ${pain.padEnd(16)} → ${figure.padEnd(14)} ${d.headline}`);
      }
    }
    console.log(
      `\n${"=".repeat(72)}\n25 DIAGNOSES (Q1 × Q2)\n${"=".repeat(72)}\n${rows.join("\n")}\n`,
    );
    expect(rows).toHaveLength(25);
  });

  it("gives every combination a real headline and a positive figure", () => {
    for (const venue of venues) {
      for (const pain of pains) {
        const d = buildDiagnosis({ ...BASE, venue, pain });
        expect(d.headline.length, `${venue}×${pain}`).toBeGreaterThan(10);
        expect(d.cost.annualBb, `${venue}×${pain}`).toBeGreaterThan(0);
      }
    }
  });

  it("NEVER shows dollars to a user who does not play for money", () => {
    // Telling a play-money user they are losing $340/year is a fabricated
    // number, and one fabricated number discounts every real one.
    for (const venue of ["play_money", "starting"]) {
      for (const pain of pains) {
        const d = buildDiagnosis({ ...BASE, venue, pain });
        expect(d.cost.annualUsd, `${venue}×${pain} got a dollar figure`).toBeNull();
        expect(d.cost.formula).not.toContain("$");
        expect(d.cost.formula).toContain("big blinds");
      }
    }
  });

  it("shows dollars to everyone who does", () => {
    for (const venue of ["home", "online_micro", "live_1_2"]) {
      const d = buildDiagnosis({ ...BASE, venue });
      expect(d.cost.annualUsd, venue).not.toBeNull();
      expect(d.cost.annualUsd!, venue).toBeGreaterThan(0);
    }
  });
});

describe("computed, not static", () => {
  const MUTATIONS: Record<keyof Answers, Answers[keyof Answers]> = {
    venue: "play_money",
    pain: "tilt",
    frequency: "daily",
    goal: "move_up",
    study: "never",
    leaks: ["bet_sizing"],
    minutes: "2",
  };

  for (const [question, mutated] of Object.entries(MUTATIONS)) {
    it(`changing ${question} changes the diagnosis`, () => {
      const before = rendered(BASE);
      const after = rendered({ ...BASE, [question]: mutated });
      expect(after, `${question} does not move the diagnosis — dead weight or a bug`).not.toBe(
        before,
      );
    });
  }
});

describe("the math is reproducible", () => {
  it("recomputes the headline figure from its own inputs", () => {
    const cost = estimateCost(BASE);
    const recomputed = roundClean(cost.handsPerYear * (cost.bb100 / 100) * cost.bbValueUsd);
    expect(cost.annualUsd).toBe(recomputed);
  });

  it("puts the same numbers in the tooltip that produced the figure", () => {
    const cost = estimateCost(BASE);
    expect(cost.formula).toContain(cost.handsPerYear.toLocaleString());
    expect(cost.formula).toContain(String(cost.bb100));
    expect(cost.formula).toContain(`$${cost.bbValueUsd.toFixed(2)}`);
    expect(cost.formula).toContain(`$${(cost.annualUsd ?? 0).toLocaleString()}`);
  });

  it("matches the worked example: live $1/$2, weekly, overcalling", () => {
    // 10,000 hands × 3.5bb/100 × $2/bb = $700.
    const cost = estimateCost({ venue: "live_1_2", frequency: "weekly", pain: "call_too_much" });
    expect(cost.annualUsd).toBe(700);
    expect(cost.annualBb).toBe(350);
  });

  it("labels the figure estimated in the copy path", () => {
    // The rendered component prints "estimated"; here we pin the model's side:
    // rounding is coarse enough that the number reads as an estimate.
    expect(roundClean(347)).toBe(350);
    expect(roundClean(703)).toBe(700);
    expect(roundClean(1284)).toBe(1300);
    expect(roundClean(43)).toBe(40);
    expect(roundClean(7)).toBe(10);
  });

  it("uses a model where every input is a named constant", () => {
    // The tooltip promises these numbers; they must exist for every option.
    for (const option of optionsFor("venue")) {
      expect(BB_VALUE_USD[option.value], option.value).toBeDefined();
    }
    for (const option of optionsFor("frequency")) {
      expect(HANDS_PER_YEAR[option.value], option.value).toBeDefined();
    }
    for (const option of optionsFor("pain")) {
      const d = buildDiagnosis({ ...BASE, pain: option.value });
      expect(LEAK_BB100[d.leakKey], option.value).toBeDefined();
    }
  });
});

describe("never a winning", () => {
  const WINNINGS =
    /\bwin\b|\bwinnings\b|\bprofit\b|\bearn\b|\bmake \$|\bwon \$|\+\s*\$|\+\d+%|guarantee/i;

  it("frames every figure as a cost, in every combination", () => {
    for (const venue of optionsFor("venue").map((o) => o.value)) {
      for (const pain of optionsFor("pain").map((o) => o.value)) {
        for (const goal of [...optionsFor("goal").map((o) => o.value), undefined]) {
          const d = buildDiagnosis({ ...BASE, venue, pain, goal });
          const text = [d.headline, d.cost.formula, d.goalLine ?? "", ...d.fixFirst].join(" ");
          expect(text, `${venue}×${pain}×${goal} reads as an earnings claim`).not.toMatch(WINNINGS);
        }
      }
    }
  });

  it("projects a rating from the material covered, not from magic", () => {
    const d = buildDiagnosis(BASE);
    expect(d.projectedRating).toBe(Math.max(d.rating + 100, CURRICULUM_CEILING_RATING));
    expect(d.projectedRating).toBeLessThan(1800);
  });
});

describe("the path", () => {
  it("scales the timeline with the daily minutes", () => {
    const two = buildDiagnosis({ ...BASE, minutes: "2" });
    const fifteen = buildDiagnosis({ ...BASE, minutes: "15" });
    expect(two.weeks).toBeGreaterThan(fifteen.weeks);
    expect(two.minutesPerDay).toBe(2);
    expect(fifteen.minutesPerDay).toBe(15);
  });

  it("keeps the standing copy at ladder precision", () => {
    const d = buildDiagnosis(BASE);
    expect(d.standing).toMatch(/^bottom \d+%$/);
    expect(Number(/\d+/.exec(d.standing)![0]) % 5).toBe(0);
  });
});
