/**
 * One honest offer, chosen by what the person actually said.
 *
 * The offer table is small enough to eyeball and exactly the kind of thing that
 * rots: a plan is renamed, a price changes, and suddenly a yearly subscriber is
 * being offered a switch to yearly. Each mapping is asserted here rather than
 * discovered by a customer.
 */

import { describe, expect, it } from "vitest";
import {
  accessEndsCopy,
  annualPerMonth,
  CANCEL_REASONS,
  hasOffer,
  isCancelReason,
  KEPT_ON_CANCEL,
  offerFor,
  offerHref,
  REASON_LABELS,
  type CancelReason,
} from "../../src/lib/cancellation";
import { formatUsd, PLANS } from "../../src/lib/stripe/plans";

describe("the five reasons", () => {
  it("has exactly five, each with a label", () => {
    expect(CANCEL_REASONS).toHaveLength(5);
    for (const reason of CANCEL_REASONS) {
      expect(REASON_LABELS[reason].length).toBeGreaterThan(3);
    }
  });

  it("rejects a reason that did not come from the list", () => {
    expect(isCancelReason("too_expensive")).toBe(true);
    expect(isCancelReason("because")).toBe(false);
    expect(isCancelReason(null)).toBe(false);
    expect(isCancelReason(42)).toBe(false);
  });
});

describe("which offer follows which reason", () => {
  const expected: Record<CancelReason, string> = {
    too_expensive: "switch_to_annual",
    not_using: "try_daily",
    not_learning: "tell_us",
    found_better: "none",
    taking_break: "none",
  };

  it.each(CANCEL_REASONS)("%s on the monthly plan", (reason) => {
    expect(offerFor(reason, "monthly").id).toBe(expected[reason]);
  });

  it("does NOT offer a yearly subscriber a switch to yearly", () => {
    // The one that reads as an unread form letter and confirms they were right
    // to leave. "Too expensive" on the annual plan gets no offer at all.
    expect(offerFor("too_expensive", "annual").id).toBe("none");
    expect(hasOffer("too_expensive", "annual")).toBe(false);
    expect(hasOffer("too_expensive", "monthly")).toBe(true);
  });

  it("offers nothing to someone who found a better tool or wants a break", () => {
    // A discount here only teaches them the list price was never real.
    for (const reason of ["found_better", "taking_break"] as const) {
      expect(offerFor(reason, "monthly").accept).toBeNull();
      expect(offerFor(reason, "annual").accept).toBeNull();
    }
  });

  it("gives every real offer both a way to accept and a way to decline", () => {
    for (const reason of CANCEL_REASONS) {
      const offer = offerFor(reason, "monthly");
      expect(offer.decline.length).toBeGreaterThan(4);
      if (offer.id !== "none") {
        expect(offer.accept).not.toBeNull();
        expect(offer.headline.length).toBeGreaterThan(15);
        expect(offer.body.length).toBeGreaterThan(30);
      }
    }
  });
});

describe("the price in the offer is the real price", () => {
  it("derives the monthly-equivalent from the actual annual amount", () => {
    // Hardcoding "$12.50" here would survive a price change and quietly promise
    // a number Stripe does not charge.
    const expected = formatUsd(Math.round(PLANS.annual.amountCents / 12));
    expect(annualPerMonth()).toBe(expected);
    expect(offerFor("too_expensive", "monthly").headline).toContain(expected);
  });

  it("quotes the current monthly price in the comparison", () => {
    expect(offerFor("too_expensive", "monthly").headline).toContain(
      formatUsd(PLANS.monthly.amountCents),
    );
  });

  it("states a saving that matches the arithmetic", () => {
    const saving = PLANS.monthly.amountCents * 12 - PLANS.annual.amountCents;
    expect(offerFor("too_expensive", "monthly").body).toContain(formatUsd(saving));
  });
});

describe("where accepting sends them", () => {
  it("routes the daily offer to the daily", () => {
    expect(offerHref("try_daily")).toBe("/daily");
  });

  it("routes the feedback offer to a real mailto", () => {
    expect(offerHref("tell_us")).toMatch(/^mailto:/);
  });

  it("handles the plan switch in-app rather than by navigation", () => {
    expect(offerHref("switch_to_annual")).toBeNull();
  });
});

describe("the confirmation copy", () => {
  it("states an exact date", () => {
    const copy = accessEndsCopy(new Date("2026-09-14T00:00:00Z"));
    expect(copy).toContain("September");
    expect(copy).toContain("2026");
  });

  it("does not promise a date it does not have", () => {
    expect(accessEndsCopy(null)).not.toMatch(/\d{4}/);
  });

  it("says what survives the cancellation", () => {
    // A win-back is far cheaper than a new customer, and the rating and streak
    // are the hook. Not saying so leaves people assuming it is all deleted.
    for (const word of ["rating", "streak"]) {
      expect(KEPT_ON_CANCEL.toLowerCase()).toContain(word);
    }
  });

  it("never claims access ends immediately", () => {
    const copy = accessEndsCopy(new Date("2026-09-14T00:00:00Z"));
    expect(copy.toLowerCase()).not.toContain("immediately");
    expect(copy.toLowerCase()).toContain("keep");
  });
});

describe("the offer table, printed", () => {
  it("shows what each reason gets", () => {
    const rows = CANCEL_REASONS.flatMap((reason) =>
      (["monthly", "annual"] as const).map((plan) => {
        const offer = offerFor(reason, plan);
        return `  ${reason.padEnd(15)} ${plan.padEnd(8)} → ${offer.id}`;
      }),
    );
    console.log(
      `\n${"=".repeat(64)}\nCANCELLATION OFFERS\n${"=".repeat(64)}\n${rows.join("\n")}\n`,
    );
  });
});
