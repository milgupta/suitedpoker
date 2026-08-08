/**
 * The price list, and the arithmetic the paywall shows.
 *
 * Pure and free of the Stripe SDK so the paywall, the tests and the server all
 * read the same numbers. Amounts are in CENTS: a per-week price derived from a
 * float dollar amount drifts by a cent depending on the order of operations,
 * and a paywall whose headline number moves is a paywall nobody trusts.
 *
 * PRICE IDS ARE NOT HERE. They are server-only (`src/lib/stripe/prices.ts`), so
 * the client sends a plan id and the server chooses what to charge — a client
 * that could name its own price would be a client that could name a cheap one.
 */

export type PlanId = "monthly" | "annual";

export const PLAN_IDS: readonly PlanId[] = ["monthly", "annual"];

export interface Plan {
  readonly id: PlanId;
  readonly label: string;
  /** What Stripe charges, per interval, in cents. */
  readonly amountCents: number;
  readonly interval: "month" | "year";
  readonly intervalLabel: string;
  /** How the charge reads next to the amount on the plan card. */
  readonly billedLabel: string;
}

export const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: "monthly",
    label: "Monthly",
    amountCents: 3999,
    interval: "month",
    intervalLabel: "per month",
    billedLabel: "billed monthly",
  },
  annual: {
    id: "annual",
    label: "Yearly",
    amountCents: 11999,
    interval: "year",
    intervalLabel: "per year",
    billedLabel: "billed yearly",
  },
};

const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

/** What a plan costs over a year, in cents. */
export function annualisedCents(plan: PlanId): number {
  const { amountCents, interval } = PLANS[plan];
  return interval === "year" ? amountCents : amountCents * 12;
}

/**
 * The headline number.
 *
 * Rounded to the nearest cent rather than down: rounding a price down in the
 * customer's favour on the headline and then billing the real figure is the
 * kind of small dishonesty a numerate audience notices.
 */
export function perWeekCents(plan: PlanId): number {
  return Math.round(annualisedCents(plan) / WEEKS_PER_YEAR);
}

/**
 * The same headline in months, which is what the plan cards show.
 *
 * A monthly figure is the one a subscriber can check against their own bank
 * statement. Per-week reads smaller and is the standard trick, and a price the
 * reader has to convert before they can compare it is a price they distrust.
 */
export function perMonthCents(plan: PlanId): number {
  return Math.round(annualisedCents(plan) / MONTHS_PER_YEAR);
}

/** How much the annual plan saves against paying monthly for a year. */
export function savingPercent(): number {
  const monthly = annualisedCents("monthly");
  const annual = annualisedCents("annual");
  return Math.round((1 - annual / monthly) * 100);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** True for a value that arrived from a client and claims to be a plan. */
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}
