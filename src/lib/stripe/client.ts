import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env.server";
import type { PlanId } from "./plans";

/**
 * The Stripe client and the price lookup.
 *
 * Both are server-only. The price ids never reach the browser: the client sends
 * `plan: "monthly" | "annual"` and the server decides what that costs. A client
 * that could pass a price id could pass a cheaper one.
 *
 * The client is lazy so the app still boots with no Stripe keys — the same
 * shape as every other integration here, because a missing key must degrade a
 * feature rather than break the process.
 */

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  const env = serverEnv();
  return (
    env.STRIPE_SECRET_KEY !== "" &&
    env.STRIPE_SECRET_KEY !== undefined &&
    env.STRIPE_PRICE_MONTHLY !== "" &&
    env.STRIPE_PRICE_MONTHLY !== undefined &&
    env.STRIPE_PRICE_ANNUAL !== "" &&
    env.STRIPE_PRICE_ANNUAL !== undefined
  );
}

export function getStripe(): Stripe {
  if (cached !== null) return cached;

  const key = serverEnv().STRIPE_SECRET_KEY;
  if (key === undefined || key === "") {
    throw new Error("STRIPE_SECRET_KEY is not set. Call isStripeConfigured() first.");
  }

  cached = new Stripe(key, {
    // Pinned to the version this SDK was built against. Stripe changes response
    // shapes between versions, and a silent upgrade at 3am is how a webhook
    // starts writing nulls. Bump this and the `stripe` package together.
    apiVersion: "2026-07-29.dahlia",
    typescript: true,
    // Two retries on a network blip. Stripe's SDK makes these idempotent for
    // us on POSTs, so a retry cannot double-charge.
    maxNetworkRetries: 2,
  });

  return cached;
}

export function priceIdFor(plan: PlanId): string {
  const env = serverEnv();
  const id = plan === "annual" ? env.STRIPE_PRICE_ANNUAL : env.STRIPE_PRICE_MONTHLY;
  if (id === undefined || id === "") {
    throw new Error(`No Stripe price id configured for the ${plan} plan.`);
  }
  return id;
}

/** The reverse lookup, for webhooks and for rejecting a same-plan switch. */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (priceId == null || priceId === "") return null;
  const env = serverEnv();
  if (priceId === env.STRIPE_PRICE_ANNUAL) return "annual";
  if (priceId === env.STRIPE_PRICE_MONTHLY) return "monthly";
  return null;
}

/** Test mode is detectable from the key, and the paywall says so out loud. */
export function isTestMode(): boolean {
  return serverEnv().STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? false;
}
