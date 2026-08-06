import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { stripeEvents } from "@/db/schema";
import { serverEnv } from "@/lib/env.server";
import { getStripe, isStripeConfigured, planForPriceId } from "@/lib/stripe/client";
import { syncFromObject, syncSubscription } from "@/lib/stripe/sync";
import { PLANS, type PlanId } from "@/lib/stripe/plans";
import { captureServer } from "@/lib/analytics-server";
import { sendPurchase, purchaseEventId } from "@/lib/meta-capi";
import { loadAttribution } from "@/lib/attribution-server";
import { sendTransactional } from "@/lib/email";
import { accessEndsAt, formatDate } from "@/lib/dunning";
import { profiles } from "@/db/schema";
import { LEAK_BB100, LEAK_HEADLINE } from "@/lib/diagnosis";
import { link } from "@/emails/theme";

/**
 * The Stripe webhook.
 *
 * This is the only thing standing between "the customer paid" and "the customer
 * has access", so it is written to be boring: verify, claim, sync, record.
 *
 * ON RETURNING 200 IMMEDIATELY. The plan says acknowledge first and work after.
 * On Vercel's serverless runtime work after the response is not reliably
 * executed, and the failure mode it produces — a payment silently never
 * synced — is far worse than the one it avoids. Instead the work runs inline
 * (two API reads and two indexed writes, comfortably inside Stripe's timeout)
 * and a genuine failure returns 500 so Stripe retries it. Idempotency is what
 * makes those retries safe.
 */

/** Events we act on. Anything else is acknowledged and ignored. */
const HANDLED = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
] as const;

type HandledEvent = (typeof HANDLED)[number];

function isHandled(type: string): type is HandledEvent {
  return (HANDLED as readonly string[]).includes(type);
}

/**
 * Claims an event id, atomically.
 *
 * The INSERT is the lock. Two concurrent deliveries of the same event race on
 * the primary key and exactly one of them gets a row back, so exactly one does
 * the work — an application-level "have I seen this?" check loses that race,
 * and Stripe genuinely does deliver the same event twice at once.
 */
async function claim(eventId: string, type: string): Promise<boolean> {
  const inserted = await getDb()
    .insert(stripeEvents)
    .values({ eventId, type, outcome: "processing" })
    .onConflictDoNothing({ target: stripeEvents.eventId })
    .returning({ eventId: stripeEvents.eventId });

  return inserted.length > 0;
}

async function recordOutcome(eventId: string, outcome: string): Promise<void> {
  await getDb()
    .update(stripeEvents)
    .set({ outcome: outcome.slice(0, 200), processedAt: sql`now()` })
    .where(eq(stripeEvents.eventId, eventId));
}

/** Releases a claim so Stripe's retry can try again rather than no-opping. */
async function releaseClaim(eventId: string): Promise<void> {
  try {
    await getDb().delete(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  } catch {
    // If even the delete fails the event is stuck as 'processing', which the
    // log makes visible. Better than throwing inside the catch that produced it.
  }
}

/** The subscription id an invoice belongs to. It moved onto `parent` in 2025. */
function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details?.subscription;
  if (typeof details === "string") return details;
  if (details != null) return details.id;
  return null;
}

function customerIdOf(session: Stripe.Checkout.Session): string {
  return typeof session.customer === "string" ? session.customer : (session.customer?.id ?? "");
}

/**
 * The welcome email — the one that is NOT generic.
 *
 * It restates the diagnosis and links the first lesson, so the first thing a
 * new subscriber reads is about their own game rather than about the product.
 */
async function sendWelcome(userId: string, email: string, plan: PlanId | null): Promise<void> {
  void plan;
  try {
    const [profile] = await getDb()
      .select({ displayName: profiles.displayName, primaryLeak: profiles.primaryLeakKey })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const leakKey = profile?.primaryLeak ?? null;

    await sendTransactional({
      to: email,
      template: "welcome",
      data: {
        displayName: profile?.displayName ?? null,
        leakLabel: leakKey === null ? null : (LEAK_HEADLINE[leakKey] ?? null),
        leakBb100: leakKey === null ? null : (LEAK_BB100[leakKey] ?? null),
        firstLessonHref: "/learn",
      },
      idempotencyKey: `welcome:${userId}`,
    });
  } catch (error) {
    // A failed welcome email must never fail the payment webhook.
    console.error(`[email] welcome failed for ${userId}: ${String(error)}`);
  }
}

async function emailForCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = await getStripe().customers.retrieve(customerId);
    return customer.deleted ? null : (customer.email ?? null);
  } catch {
    return null;
  }
}

/**
 * The purchase, recorded once.
 *
 * Both the PostHog capture and the Meta CAPI event are keyed to the Stripe
 * event id, and the surrounding claim guarantees this runs once per event —
 * which is what stops five retries from reporting five sales.
 */
async function recordPurchase(
  stripeEventId: string,
  userId: string,
  plan: PlanId,
  email: string | null,
  metaEventId: string | null,
): Promise<void> {
  // The EXACT amount Stripe charged. A rounded or hardcoded value here makes
  // every ROAS figure in Ads Manager quietly wrong.
  const revenue = PLANS[plan].amountCents / 100;

  // Attributed to the USER id. An anonymous distinct id here silently breaks
  // every revenue-by-source report in the product.
  await captureServer(userId, "purchase_completed", { plan, revenue });

  await sendPurchase({
    /**
     * The id the BROWSER minted at checkout, carried here through Stripe
     * metadata. Both halves of the Purchase therefore share one id and Meta
     * collapses them into a single conversion.
     *
     * The fallback is derived from the Stripe event id rather than random, so a
     * webhook retry cannot mint a second id and report a second sale — but it
     * will not match a pixel event, which is the correct trade: one conversion
     * attributed server-side beats two attributed to nothing.
     */
    eventId: metaEventId ?? purchaseEventId(stripeEventId),
    userId,
    email: email ?? undefined,
    valueUsd: revenue,
    currency: "USD",
    plan,
    // fbp/fbc, captured on the landing hit. Without them Meta's match quality
    // for a server-side event is poor and attribution degrades badly.
    attribution: await loadAttribution(userId),
  });
}

async function handleCheckoutCompleted(event: Stripe.Event): Promise<string> {
  const session = event.data.object as Stripe.Checkout.Session;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  if (subscriptionId === null) {
    // A one-off payment, not a subscription. Nothing to grant.
    return "no_subscription";
  }

  const synced = await syncSubscription(subscriptionId);
  if (synced === null) return "no_user";

  // Only a paid session is a purchase. `payment_status` can be 'unpaid' on a
  // session completed with a delayed payment method.
  if (session.payment_status === "paid" && synced.plan !== null) {
    const email =
      session.customer_details?.email ?? (await emailForCustomer(customerIdOf(session)));
    if (email !== null) await sendWelcome(synced.userId, email, synced.plan);

    const metaEventId = session.metadata?.metaEventId;
    await recordPurchase(
      event.id,
      synced.userId,
      synced.plan,
      session.customer_details?.email ?? null,
      typeof metaEventId === "string" && metaEventId !== "" ? metaEventId : null,
    );
  }

  return `active:${synced.status}`;
}

async function handleSubscriptionEvent(event: Stripe.Event): Promise<string> {
  const subscription = event.data.object as Stripe.Subscription;
  // Re-fetched rather than applied from the payload: see the note in sync.ts on
  // out-of-order delivery.
  const synced = await syncSubscription(subscription.id);
  if (synced === null) return "no_user";
  return `${synced.status}${synced.cancelAtPeriodEnd ? ":cancelling" : ""}`;
}

async function handleInvoicePaid(event: Stripe.Event): Promise<string> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = subscriptionIdOfInvoice(invoice);
  if (subscriptionId === null) return "no_subscription";

  const synced = await syncSubscription(subscriptionId);
  if (synced === null) return "no_user";

  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
  const email = customerId === null ? null : await emailForCustomer(customerId);

  if (email !== null && synced.plan !== null) {
    await sendTransactional({
      to: email,
      template: "receipt",
      data: {
        amount: `$${(invoice.amount_paid / 100).toFixed(2)}`,
        planLabel: PLANS[synced.plan].label,
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        nextBillingDate:
          synced.currentPeriodEnd === null ? null : formatDate(synced.currentPeriodEnd),
      },
      // Stripe retries this event; a customer receiving two receipts for one
      // charge reads it as having been billed twice.
      idempotencyKey: `receipt:${invoice.id}`,
    });
  }

  // A renewal is not a new purchase. Counting it as one would make month two of
  // every subscriber look like a fresh acquisition.
  return `renewed:${synced.currentPeriodEnd?.toISOString() ?? "unknown"}`;
}

async function handleInvoiceFailed(event: Stripe.Event): Promise<string> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = subscriptionIdOfInvoice(invoice);
  if (subscriptionId === null) return "no_subscription";

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const synced = await syncFromObject(subscription);
  if (synced === null) return "no_user";

  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
  const email = customerId === null ? null : await emailForCustomer(customerId);

  if (email !== null) {
    // Dunning #1, immediate. #2 and #3 come from the daily cron, scheduled
    // off past_due_since rather than off a log of what was already sent.
    await sendTransactional({
      to: email,
      template: "payment_failed",
      data: {
        amount: `$${(invoice.amount_due / 100).toFixed(2)}`,
        updateUrl: link("/account"),
        accessEndsOn:
          synced.pastDueSince === null ? null : formatDate(accessEndsAt(synced.pastDueSince)),
      },
    });
  }

  return `past_due:${synced.pastDueSince?.toISOString() ?? "unset"}`;
}

async function dispatch(event: Stripe.Event): Promise<string> {
  switch (event.type as HandledEvent) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscriptionEvent(event);
    case "invoice.payment_succeeded":
      return handleInvoicePaid(event);
    case "invoice.payment_failed":
      return handleInvoiceFailed(event);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  if (secret === undefined || secret === "") {
    return NextResponse.json({ error: "no_webhook_secret" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (signature === null) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // text(), never json(). The signature is computed over the exact bytes Stripe
  // sent, and re-serialising a parsed object will not reproduce them.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.warn(`[stripe] rejected webhook: ${message}`);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (!isHandled(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  let claimed: boolean;
  try {
    claimed = await claim(event.id, event.type);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[stripe] could not claim ${event.id}: ${message}`);
    // 500 so Stripe retries. Acknowledging an event we failed to record would
    // drop it forever.
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  if (!claimed) {
    console.info(`[stripe] ${event.id} ${event.type} — duplicate, ignored`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const outcome = await dispatch(event);
    await recordOutcome(event.id, outcome);
    console.info(`[stripe] ${event.id} ${event.type} → ${outcome}`);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[stripe] ${event.id} ${event.type} FAILED: ${message}`);
    await releaseClaim(event.id);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}

/** Exported for the unit tests, which assert the handled set does not shrink. */
export const HANDLED_EVENTS = HANDLED;
