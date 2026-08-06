import { annualisedCents, formatUsd, PLANS, type PlanId } from "@/lib/stripe/plans";

/**
 * The cancellation flow, as data.
 *
 * One honest offer, chosen by what the person actually said, shown once. No
 * interstitials, no "are you sure" loops, no offer that reappears if they say
 * no. The reason this is a pure module rather than conditionals in the
 * component is that "does the right offer follow from the right reason" is then
 * a unit test rather than five manual clickthroughs.
 *
 * The data is worth more than the save. Five buckets, stored verbatim, is what
 * tells you whether churn is a pricing problem or a product one.
 */

export const CANCEL_REASONS = [
  "too_expensive",
  "not_using",
  "not_learning",
  "found_better",
  "taking_break",
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

export function isCancelReason(value: unknown): value is CancelReason {
  return typeof value === "string" && (CANCEL_REASONS as readonly string[]).includes(value);
}

export const REASON_LABELS: Record<CancelReason, string> = {
  too_expensive: "Too expensive",
  not_using: "Not using it enough",
  not_learning: "Not learning anything",
  found_better: "Found something better",
  taking_break: "Just taking a break",
};

export type OfferId = "switch_to_annual" | "try_daily" | "tell_us" | "none";

export interface Offer {
  readonly id: OfferId;
  readonly headline: string;
  readonly body: string;
  /** The label on the accepting button. Null when there is nothing to accept. */
  readonly accept: string | null;
  readonly decline: string;
}

const NO_OFFER: Offer = {
  id: "none",
  headline: "",
  body: "",
  accept: null,
  decline: "Cancel my subscription",
};

/** What the yearly plan works out to per month. */
export function annualPerMonth(): string {
  return formatUsd(Math.round(PLANS.annual.amountCents / 12));
}

/**
 * The one offer, for this reason and this plan.
 *
 * `currentPlan` matters more than it looks. Offering an annual subscriber a
 * switch to annual is the kind of thing that reads as an unread form letter and
 * confirms they were right to leave — so "too expensive" on the yearly plan
 * gets no offer at all rather than a nonsensical one.
 */
export function offerFor(reason: CancelReason, currentPlan: PlanId | null): Offer {
  switch (reason) {
    case "too_expensive": {
      if (currentPlan !== "monthly") return NO_OFFER;
      const saving = annualisedCents("monthly") - annualisedCents("annual");
      return {
        id: "switch_to_annual",
        headline: `Switch to yearly and pay ${annualPerMonth()} a month instead of ${formatUsd(PLANS.monthly.amountCents)}`,
        body: `That is ${formatUsd(saving)} less over a year, billed once. Everything else stays exactly the same.`,
        accept: "Switch to yearly",
        decline: "No thanks, cancel",
      };
    }

    case "not_using":
      return {
        id: "try_daily",
        headline: "Try the daily challenge — it takes three minutes",
        body: "Five spots, once a day. Most people who stick with it end up playing five days a week, which is where the rating actually starts moving.",
        accept: "Show me today's",
        decline: "No thanks, cancel",
      };

    case "not_learning":
      return {
        id: "tell_us",
        headline: "Tell us what isn't landing",
        body: "If the explanations are not clicking, that is a bug in the product and we want to hear exactly where. It goes straight to a person, not a queue.",
        accept: "Email us",
        decline: "No thanks, cancel",
      };

    // Nothing honest to offer someone who found a better tool or wants a break.
    // A discount here would only teach them the price was never real.
    case "found_better":
    case "taking_break":
      return NO_OFFER;
  }
}

export function hasOffer(reason: CancelReason, currentPlan: PlanId | null): boolean {
  return offerFor(reason, currentPlan).id !== "none";
}

/** Where accepting an offer sends them. */
export function offerHref(offer: OfferId): string | null {
  switch (offer) {
    case "try_daily":
      return "/daily";
    case "tell_us":
      return "mailto:help@suitedpoker.com?subject=What%20isn%27t%20landing";
    case "switch_to_annual":
      // Handled by an API call, not a navigation.
      return null;
    case "none":
      return null;
  }
}

/**
 * The sentence stating exactly when access ends.
 *
 * Always a specific date. "At the end of your billing period" makes someone
 * open Stripe to find out what they still have, and the honest version is the
 * one that keeps them calm enough to come back.
 */
export function accessEndsCopy(periodEnd: Date | null): string {
  if (periodEnd === null) return "You will keep access until your current period ends.";
  const formatted = periodEnd.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `You keep full access until ${formatted}. Nothing is charged after that.`;
}

/** What survives a cancellation, said out loud. */
export const KEPT_ON_CANCEL =
  "Your rating, streak and every hand you have played stay exactly where they are. Resubscribing picks up where you left off.";
