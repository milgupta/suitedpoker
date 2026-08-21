/**
 * The price arithmetic.
 *
 * Every number the paywall prints is computed here, so this is where a headline
 * price that disagrees with the billed price gets caught. A paywall whose
 * numbers do not add up is not a rounding bug — it is the reason a numerate
 * audience stops believing the rest of the page.
 */

import { describe, expect, it } from "vitest";
import {
  annualisedCents,
  formatUsd,
  isPlanId,
  perWeekCents,
  PLAN_IDS,
  PLANS,
  savingPercent,
} from "../../src/lib/stripe/plans";

describe("the prices", () => {
  it("matches the Stripe products exactly", () => {
    // If these ever disagree with the dashboard, the paywall lies about what it
    // is about to charge.
    expect(PLANS.monthly.amountCents).toBe(1999);
    expect(PLANS.monthly.interval).toBe("month");
    expect(PLANS.annual.amountCents).toBe(7399);
    expect(PLANS.annual.interval).toBe("year");
  });

  it("is stated in cents, never in floats", () => {
    for (const id of PLAN_IDS) {
      expect(Number.isInteger(PLANS[id].amountCents)).toBe(true);
    }
  });
});

describe("the headline arithmetic", () => {
  it("annualises the monthly plan over twelve months", () => {
    expect(annualisedCents("monthly")).toBe(23_988);
    expect(annualisedCents("annual")).toBe(7_399);
  });

  it("computes the per-week price the paywall prints", () => {
    // $239.88 / 52 = $4.6131 -> $4.61; $73.99 / 52 = $1.4229 -> $1.42
    expect(formatUsd(perWeekCents("monthly"))).toBe("$4.61");
    expect(formatUsd(perWeekCents("annual"))).toBe("$1.42");
  });

  it("rounds the headline to the nearest cent, not down", () => {
    // Rounding down in the customer's favour on the headline and then billing
    // the real figure is a small dishonesty, and this audience checks.
    expect(perWeekCents("monthly")).toBe(461);
    expect(perWeekCents("annual")).toBe(142);
  });

  it("states the saving as the number the page shows", () => {
    // 1 - 73.99/239.88 = 69.16% -> "Save 69%"
    expect(savingPercent()).toBe(69);
  });

  it("keeps the struck-through figure honest", () => {
    // The struck price must be what twelve monthly payments actually cost, not
    // a bigger invented number.
    expect(formatUsd(annualisedCents("monthly"))).toBe("$239.88");
    expect(annualisedCents("monthly")).toBe(PLANS.monthly.amountCents * 12);
  });

  it("never claims a saving the prices do not support", () => {
    const claimed = savingPercent() / 100;
    const actual = 1 - annualisedCents("annual") / annualisedCents("monthly");
    expect(Math.abs(actual - claimed)).toBeLessThan(0.01);
  });
});

describe("formatUsd", () => {
  it("always shows two decimal places", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(500)).toBe("$5.00");
    expect(formatUsd(1999)).toBe("$19.99");
    expect(formatUsd(7399)).toBe("$73.99");
  });
});

describe("isPlanId", () => {
  it("accepts the two real plans", () => {
    expect(isPlanId("monthly")).toBe(true);
    expect(isPlanId("annual")).toBe(true);
  });

  it("rejects anything else, including a price id", () => {
    // The checkout route validates with this. A client that could smuggle a
    // price id through would be a client that could pick its own price.
    for (const value of ["yearly", "price_123", "", null, undefined, 1, {}]) {
      expect(isPlanId(value), String(value)).toBe(false);
    }
  });
});

describe("price ids", () => {
  it("are never bundled into the client", async () => {
    // A NEXT_PUBLIC_ price id is a price id the browser can read and swap.
    const { clientEnv } = await import("../../src/lib/env");
    for (const key of Object.keys(clientEnv)) {
      expect(key, `${key} exposes a price id to the browser`).not.toMatch(/PRICE/);
    }
  });

  it("live in the plan module without any id in it", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/stripe/plans.ts", "utf8"),
    );
    expect(source).not.toMatch(/price_[A-Za-z0-9]/);
  });
});
