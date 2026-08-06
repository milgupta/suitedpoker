/**
 * Who gets in, and for exactly how long.
 *
 * Every case here is a real customer state, and getting one wrong costs either
 * money (a lapsed user still using the product) or a chargeback (a paying user
 * locked out). The two that matter most are the last two blocks: cancelling
 * must not revoke access early, and a failed card must not revoke it instantly.
 */

import { describe, expect, it } from "vitest";
import {
  isEntitled,
  PAST_DUE_GRACE_DAYS,
  PAST_DUE_GRACE_MS,
  type SubscriptionLike,
} from "../../src/lib/entitlement-rule";

const NOW = new Date("2026-08-06T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function at(offsetDays: number): Date {
  return new Date(NOW.getTime() + offsetDays * DAY);
}

function sub(overrides: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return { status: "active", currentPeriodEnd: at(20), pastDueSince: null, ...overrides };
}

describe("the ordinary cases", () => {
  it("admits an active subscription inside its period", () => {
    expect(isEntitled(sub(), NOW)).toBe(true);
  });

  it("admits a trial", () => {
    expect(isEntitled(sub({ status: "trialing" }), NOW)).toBe(true);
  });

  it("refuses no subscription at all", () => {
    expect(isEntitled(null, NOW)).toBe(false);
  });

  it("refuses an incomplete or unpaid subscription", () => {
    for (const status of ["incomplete", "incomplete_expired", "unpaid", "paused"]) {
      expect(isEntitled(sub({ status }), NOW), status).toBe(false);
    }
  });

  it("refuses an 'active' row whose period has already ended", () => {
    // Stripe can lag on a status change. Trusting the status alone is how a
    // lapsed subscription keeps working for a day.
    expect(isEntitled(sub({ currentPeriodEnd: at(-1) }), NOW)).toBe(false);
  });

  it("refuses a row with no period end rather than guessing", () => {
    expect(isEntitled(sub({ currentPeriodEnd: null }), NOW)).toBe(false);
  });

  it("refuses an unparseable period end", () => {
    expect(isEntitled(sub({ currentPeriodEnd: "not a date" }), NOW)).toBe(false);
  });

  it("reads an ISO string and a Date identically", () => {
    const end = at(5);
    expect(isEntitled(sub({ currentPeriodEnd: end }), NOW)).toBe(
      isEntitled(sub({ currentPeriodEnd: end.toISOString() }), NOW),
    );
  });
});

describe("cancelling keeps access until the period actually ends", () => {
  /**
   * The user cancels on day 2 of a 30-day month. Stripe leaves the status
   * 'active' with cancel_at_period_end set, and only sends
   * customer.subscription.deleted when the period runs out. They paid for the
   * month; taking it away on day 2 is a refund request and a bad review.
   */
  it("admits every day up to the end date", () => {
    const end = at(28);
    for (let day = 0; day < 28; day++) {
      expect(isEntitled(sub({ currentPeriodEnd: end }), at(day)), `day ${day}`).toBe(true);
    }
  });

  it("refuses one second after the end date", () => {
    const end = at(28);
    expect(isEntitled(sub({ currentPeriodEnd: end }), new Date(end.getTime() + 1000))).toBe(false);
  });

  it("refuses once Stripe reports it cancelled", () => {
    expect(isEntitled(sub({ status: "canceled", currentPeriodEnd: at(20) }), NOW)).toBe(false);
  });
});

describe("a failed card gets exactly three days", () => {
  it("uses a three-day grace", () => {
    expect(PAST_DUE_GRACE_DAYS).toBe(3);
    expect(PAST_DUE_GRACE_MS).toBe(3 * DAY);
  });

  it("admits on day 0, 1 and 2 of past_due", () => {
    const failed = NOW;
    for (const days of [0, 0.5, 1, 2, 2.99]) {
      const later = new Date(failed.getTime() + days * DAY);
      expect(
        isEntitled(
          sub({ status: "past_due", currentPeriodEnd: at(-1), pastDueSince: failed }),
          later,
        ),
        `${days} days in`,
      ).toBe(true);
    }
  });

  it("refuses from day 3 onward", () => {
    const failed = NOW;
    for (const days of [3, 3.01, 10]) {
      const later = new Date(failed.getTime() + days * DAY);
      expect(
        isEntitled(
          sub({ status: "past_due", currentPeriodEnd: at(-1), pastDueSince: failed }),
          later,
        ),
        `${days} days in`,
      ).toBe(false);
    }
  });

  it("does NOT require the period end to be in the future", () => {
    // The whole point of the grace period is that the renewal charge failed, so
    // the period end has typically just passed. Requiring a future period end
    // would make the grace period unreachable.
    expect(
      isEntitled(
        { status: "past_due", currentPeriodEnd: at(-1), pastDueSince: NOW },
        new Date(NOW.getTime() + DAY),
      ),
    ).toBe(true);
  });

  it("admits when past_due has no recorded start, rather than evicting", () => {
    // An unset timestamp is our bug, not the customer's. Fail toward the paying
    // customer keeping access.
    expect(isEntitled(sub({ status: "past_due", pastDueSince: null }), NOW)).toBe(true);
    expect(isEntitled({ status: "past_due", currentPeriodEnd: null }, NOW)).toBe(true);
  });

  it("prints the grace timeline", () => {
    const failed = NOW;
    const rows = [0, 1, 2, 3, 4].map((d) => {
      const when = new Date(failed.getTime() + d * DAY);
      const ok = isEntitled(
        { status: "past_due", currentPeriodEnd: at(-1), pastDueSince: failed },
        when,
      );
      return `  day ${d}  ${when.toISOString().slice(0, 10)}  ${ok ? "ACCESS" : "locked out"}`;
    });
    console.log(`\nPAST_DUE GRACE (${PAST_DUE_GRACE_DAYS} days)\n${rows.join("\n")}\n`);
  });
});
