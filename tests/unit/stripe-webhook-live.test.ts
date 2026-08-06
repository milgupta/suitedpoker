/**
 * THE PAYMENT BOUNDARY, VERIFIED AGAINST REAL STRIPE.
 *
 * Access has to match payment exactly, and every way of getting that wrong
 * costs real money: a user who paid and cannot get in asks for a refund, a user
 * who stopped paying and can get in is stealing the product, and a webhook
 * processed twice reports two sales that never happened.
 *
 * So this does not mock Stripe. It creates a real test-mode customer and
 * subscription, takes the events Stripe ACTUALLY emitted for them, signs them
 * with the real webhook secret, and pushes them through the real route handler
 * into the real database. A mocked Stripe object would have happily agreed with
 * every wrong assumption about where `current_period_end` lives.
 *
 *   npm run test:stripe
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../support/load-local-env";

loadLocalEnv();

const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const CONFIGURED =
  SECRET_KEY !== "" &&
  WEBHOOK_SECRET !== "" &&
  PRICE_MONTHLY !== "" &&
  SUPABASE_URL !== "" &&
  SERVICE_KEY !== "" &&
  DATABASE_URL !== "";

/**
 * A live key would create real customers and charge real cards from a test run.
 * This is a hard stop, not a warning.
 */
if (SECRET_KEY !== "" && !SECRET_KEY.startsWith("sk_test_")) {
  throw new Error("REFUSING TO RUN: STRIPE_SECRET_KEY is not a test key. This suite creates data.");
}

if (!CONFIGURED) {
  console.warn(
    "\n  ⚠  STRIPE WEBHOOK SUITE SKIPPED — missing credentials.\n" +
      "     The payment boundary is UNVERIFIED until this runs.\n",
  );
}

const describeLive = CONFIGURED ? describe : describe.skip;

describeLive("the Stripe webhook, end to end", () => {
  let stripe: Stripe;
  let admin: SupabaseClient;
  let POST: (request: Request) => Promise<Response>;
  let db: Awaited<typeof import("../../src/db")>;

  let userId = "";
  let email = "";
  let customerId = "";
  let subscriptionId = "";
  const created: { customers: string[]; users: string[] } = { customers: [], users: [] };
  const log: string[] = [];

  /** Signs a payload the way Stripe does, so constructEvent accepts it. */
  function sign(payload: string): string {
    return stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  }

  function post(payload: string, signature: string | null): Promise<Response> {
    const headers = new Headers({ "content-type": "application/json" });
    if (signature !== null) headers.set("stripe-signature", signature);
    return POST(
      new Request("https://suitedpoker.com/api/stripe/webhook", {
        method: "POST",
        headers,
        body: payload,
      }),
    );
  }

  /** Delivers a real Stripe event object through the handler. */
  function deliver(event: object): Promise<Response> {
    const payload = JSON.stringify(event);
    return post(payload, sign(payload));
  }

  /** The most recent real event Stripe emitted of a given type for our objects. */
  async function latestEvent(
    type: string,
    matches: (e: Stripe.Event) => boolean,
  ): Promise<Stripe.Event> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const events = await stripe.events.list({ type, limit: 25 });
      const found = events.data.find(matches);
      if (found !== undefined) return found;
      // Events are not always queryable the instant the API call returns.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`no ${type} event appeared for our objects`);
  }

  async function subscriptionRow() {
    const { subscriptions } = await import("../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    return db
      .getDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  }

  async function eventRows(eventId: string) {
    const { stripeEvents } = await import("../../src/db/schema");
    const { eq } = await import("drizzle-orm");
    return db.getDb().select().from(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  }

  beforeAll(async () => {
    stripe = new Stripe(SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });
    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // The route imports server-only modules; the live config aliases that away.
    const route = await import("../../src/app/api/stripe/webhook/route");
    POST = route.POST as unknown as (request: Request) => Promise<Response>;
    db = await import("../../src/db");

    // A real auth user, because subscriptions.user_id is a FK to auth.users.
    email = `stripe-webhook-${Date.now()}@suitedpoker.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `pw-${Math.random().toString(36).slice(2)}!A1`,
      email_confirm: true,
    });
    if (error !== null || data.user === null)
      throw new Error(`could not create user: ${error?.message}`);
    userId = data.user.id;
    created.users.push(userId);

    const customer = await stripe.customers.create({ email, metadata: { userId } });
    customerId = customer.id;
    created.customers.push(customerId);

    // A card that succeeds, attached and made default, so the subscription
    // starts 'active' rather than 'incomplete'.
    const pm = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });
    await stripe.paymentMethods.attach(pm.id, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: PRICE_MONTHLY }],
      metadata: { userId, plan: "monthly" },
    });
    subscriptionId = subscription.id;
  }, 180_000);

  afterAll(async () => {
    const { subscriptions, stripeEvents } = await import("../../src/db/schema");
    const { eq, inArray } = await import("drizzle-orm");

    try {
      if (subscriptionId !== "") {
        await db.getDb().delete(subscriptions).where(eq(subscriptions.userId, userId));
      }
      const ids = log.filter((line) => line.startsWith("evt_"));
      if (ids.length > 0) {
        await db.getDb().delete(stripeEvents).where(inArray(stripeEvents.eventId, ids));
      }
    } catch {
      // Cleanup failure must not mask a real result.
    }

    for (const id of created.customers) {
      await stripe.customers.del(id).catch(() => undefined);
    }
    for (const id of created.users) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await db.closeDb().catch(() => undefined);

    if (log.length > 0) {
      console.log(
        `\n${"=".repeat(74)}\nWEBHOOK EVENTS DELIVERED\n${"=".repeat(74)}\n${log.join("\n")}\n`,
      );
    }
  }, 120_000);

  describe("signature verification", () => {
    it("rejects a request with no signature at all", async () => {
      const response = await post(JSON.stringify({ id: "evt_none", type: "ping" }), null);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "missing_signature" });
    });

    it("rejects a wrongly-signed request", async () => {
      const payload = JSON.stringify({ id: "evt_bad", type: "ping" });
      const response = await post(payload, "t=1,v1=deadbeef");
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_signature" });
    });

    it("rejects a body tampered with after signing", async () => {
      // The exact attack the signature exists to stop: a valid signature for a
      // DIFFERENT payload, reused on an event that grants access.
      const original = JSON.stringify({ id: "evt_orig", type: "ping", data: { amount: 1 } });
      const signature = sign(original);
      const tampered = JSON.stringify({ id: "evt_orig", type: "ping", data: { amount: 999_999 } });

      const response = await post(tampered, signature);
      expect(response.status).toBe(400);
    });

    it("writes nothing to the database for a rejected request", async () => {
      const rows = await eventRows("evt_bad");
      expect(rows).toHaveLength(0);
    });
  });

  describe("customer.subscription.created", () => {
    let event: Stripe.Event;

    it("syncs the subscription into our table", async () => {
      event = await latestEvent(
        "customer.subscription.created",
        (e) => (e.data.object as Stripe.Subscription).id === subscriptionId,
      );

      const response = await deliver(event);
      expect(response.status).toBe(200);
      log.push(`${event.id}  ${event.type.padEnd(32)} → ${JSON.stringify(await response.json())}`);

      const [row] = await subscriptionRow();
      expect(row).toBeDefined();
      expect(row!.userId).toBe(userId);
      expect(row!.status).toBe("active");
      expect(row!.stripeCustomerId).toBe(customerId);
      expect(row!.priceId).toBe(PRICE_MONTHLY);
      expect(row!.cancelAtPeriodEnd).toBe(false);
      expect(row!.pastDueSince).toBeNull();
    });

    it("writes a REAL period end, read from the subscription item", async () => {
      // The field moved off the subscription object in API 2025-03-31. Reading
      // the old location returns undefined rather than throwing, which would
      // write a null period end — and a null period end reads as "not
      // entitled". A paying customer locked out, with green logs everywhere.
      const [row] = await subscriptionRow();
      expect(row!.currentPeriodEnd).not.toBeNull();

      const live = await stripe.subscriptions.retrieve(subscriptionId);
      const expected = new Date((live.items.data[0]?.current_period_end ?? 0) * 1000);
      expect(row!.currentPeriodEnd!.getTime()).toBe(expected.getTime());
      expect(row!.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
    });

    it("entitles the user", async () => {
      const { hasActiveSubscription } = await import("../../src/lib/entitlement");
      expect(await hasActiveSubscription(userId)).toBe(true);
    });
  });

  describe("idempotency", () => {
    it("processes five identical deliveries exactly once", async () => {
      const event = await latestEvent(
        "customer.subscription.created",
        (e) => (e.data.object as Stripe.Subscription).id === subscriptionId,
      );

      const outcomes: unknown[] = [];
      for (let i = 0; i < 5; i++) {
        const response = await deliver(event);
        expect(response.status).toBe(200);
        outcomes.push(await response.json());
      }

      // Four of the five must be recognised as duplicates. (The first delivery
      // happened in the previous block, so all five here are duplicates.)
      const duplicates = outcomes.filter((o) => (o as { duplicate?: boolean }).duplicate === true);
      expect(duplicates).toHaveLength(5);

      expect(await subscriptionRow()).toHaveLength(1);
      expect(await eventRows(event.id)).toHaveLength(1);
      log.push(`${event.id}  ×5 replay${" ".repeat(24)}→ 1 subscription row, 1 event row`);
    });

    it("survives five CONCURRENT deliveries of a new event", async () => {
      // The real race: Stripe retries in parallel. An application-level "have I
      // seen this?" check passes the sequential test above and loses this one.
      const event = await latestEvent(
        "customer.subscription.created",
        (e) => (e.data.object as Stripe.Subscription).id === subscriptionId,
      );
      const fresh = { ...event, id: `evt_concurrent_${Date.now()}` };
      log.push(fresh.id);

      const responses = await Promise.all(Array.from({ length: 5 }, () => deliver(fresh)));
      const bodies = await Promise.all(responses.map((r) => r.json()));

      const processed = bodies.filter((b) => (b as { duplicate?: boolean }).duplicate !== true);
      expect(processed, "exactly one delivery may do the work").toHaveLength(1);
      expect(await eventRows(fresh.id)).toHaveLength(1);
      expect(await subscriptionRow()).toHaveLength(1);
    });
  });

  describe("checkout.session.completed", () => {
    it("grants access and records exactly one purchase across five deliveries", async () => {
      const eventId = `evt_checkout_${Date.now()}`;
      log.push(eventId);

      // Built by hand: a real one requires completing Stripe's hosted page. It
      // references the REAL subscription, which is what the handler actually
      // reads and re-fetches.
      const event = {
        id: eventId,
        object: "event",
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_test_${Date.now()}`,
            object: "checkout.session",
            subscription: subscriptionId,
            customer: customerId,
            client_reference_id: userId,
            payment_status: "paid",
            mode: "subscription",
            customer_details: { email },
            metadata: { userId, plan: "monthly" },
          },
        },
      };

      const first = await deliver(event);
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ received: true });

      for (let i = 0; i < 4; i++) {
        const again = await deliver(event);
        expect(again.status).toBe(200);
        expect(await again.json()).toMatchObject({ duplicate: true });
      }

      expect(await eventRows(eventId)).toHaveLength(1);
      expect(await subscriptionRow()).toHaveLength(1);

      const { hasActiveSubscription } = await import("../../src/lib/entitlement");
      expect(await hasActiveSubscription(userId)).toBe(true);
    });
  });

  describe("cancelling keeps access until the period ends", () => {
    it("records cancel_at_period_end WITHOUT revoking access", async () => {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

      const event = await latestEvent(
        "customer.subscription.updated",
        (e) =>
          (e.data.object as Stripe.Subscription).id === subscriptionId &&
          (e.data.object as Stripe.Subscription).cancel_at_period_end,
      );

      const response = await deliver(event);
      expect(response.status).toBe(200);
      log.push(`${event.id}  ${event.type.padEnd(32)} → ${JSON.stringify(await response.json())}`);

      const [row] = await subscriptionRow();
      expect(row!.cancelAtPeriodEnd).toBe(true);
      expect(row!.status).toBe("active");

      // The whole point: they paid for this period and they keep it.
      const { hasActiveSubscription } = await import("../../src/lib/entitlement");
      expect(await hasActiveSubscription(userId)).toBe(true);
    });

    it("revokes access only once Stripe reports the subscription deleted", async () => {
      await stripe.subscriptions.cancel(subscriptionId);

      const event = await latestEvent(
        "customer.subscription.deleted",
        (e) => (e.data.object as Stripe.Subscription).id === subscriptionId,
      );

      const response = await deliver(event);
      expect(response.status).toBe(200);
      log.push(`${event.id}  ${event.type.padEnd(32)} → ${JSON.stringify(await response.json())}`);

      const [row] = await subscriptionRow();
      expect(row!.status).toBe("canceled");

      const { hasActiveSubscription } = await import("../../src/lib/entitlement");
      expect(await hasActiveSubscription(userId)).toBe(false);
    });
  });

  /**
   * A card that fails on RENEWAL, which is the only way past_due actually
   * happens. It cannot be faked by setting a status: Stripe decides that, and
   * getting here requires moving time forward, so this uses a test clock.
   *
   * Worth the ~40 seconds. This is the state where our own code decides
   * whether a paying customer whose bank declined a routine renewal keeps
   * access, and it is the one path where a mistake looks like theft.
   */
  describe("a failed renewal enters the grace period", () => {
    let clockId = "";
    let graceUserId = "";
    let graceCustomerId = "";
    let graceSubscriptionId = "";

    beforeAll(async () => {
      const clock = await stripe.testHelpers.testClocks.create({
        frozen_time: Math.floor(Date.now() / 1000),
      });
      clockId = clock.id;

      const graceEmail = `stripe-grace-${Date.now()}@suitedpoker.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email: graceEmail,
        password: `pw-${Math.random().toString(36).slice(2)}!A1`,
        email_confirm: true,
      });
      if (error !== null || data.user === null) throw new Error(`user: ${error?.message}`);
      graceUserId = data.user.id;
      created.users.push(graceUserId);

      const customer = await stripe.customers.create({
        email: graceEmail,
        metadata: { userId: graceUserId },
        test_clock: clockId,
      });
      graceCustomerId = customer.id;
      created.customers.push(graceCustomerId);

      // Good card first, so the subscription starts active like a real one.
      const good = await stripe.paymentMethods.create({
        type: "card",
        card: { token: "tok_visa" },
      });
      await stripe.paymentMethods.attach(good.id, { customer: graceCustomerId });
      await stripe.customers.update(graceCustomerId, {
        invoice_settings: { default_payment_method: good.id },
      });

      const subscription = await stripe.subscriptions.create({
        customer: graceCustomerId,
        items: [{ price: PRICE_MONTHLY }],
        metadata: { userId: graceUserId, plan: "monthly" },
      });
      graceSubscriptionId = subscription.id;

      // Now the card goes bad, and time moves past the renewal.
      const bad = await stripe.paymentMethods.create({
        type: "card",
        card: { token: "tok_chargeCustomerFail" },
      });
      await stripe.paymentMethods.attach(bad.id, { customer: graceCustomerId });
      await stripe.customers.update(graceCustomerId, {
        invoice_settings: { default_payment_method: bad.id },
      });

      const periodEnd = subscription.items.data[0]?.current_period_end ?? 0;
      await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: periodEnd + 3600 });

      for (let i = 0; i < 60; i++) {
        const clockNow = await stripe.testHelpers.testClocks.retrieve(clockId);
        if (clockNow.status === "ready") break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }, 300_000);

    afterAll(async () => {
      // Deleting the clock removes every object created on it, customer
      // included, so those are not deleted individually.
      if (clockId !== "") await stripe.testHelpers.testClocks.del(clockId).catch(() => undefined);
      created.customers = created.customers.filter((id) => id !== graceCustomerId);

      const { subscriptions } = await import("../../src/db/schema");
      const { eq } = await import("drizzle-orm");
      if (graceUserId !== "") {
        await db
          .getDb()
          .delete(subscriptions)
          .where(eq(subscriptions.userId, graceUserId))
          .catch(() => undefined);
      }
    }, 120_000);

    async function graceRow() {
      const { subscriptions } = await import("../../src/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .getDb()
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, graceSubscriptionId));
      return row;
    }

    it("Stripe really did put the subscription past_due", async () => {
      const live = await stripe.subscriptions.retrieve(graceSubscriptionId);
      expect(live.status).toBe("past_due");
    });

    it("stamps past_due_since and KEEPS access", async () => {
      const event = await latestEvent(
        "invoice.payment_failed",
        (e) =>
          (e.data.object as Stripe.Invoice).parent?.subscription_details?.subscription ===
          graceSubscriptionId,
      );

      const response = await deliver(event);
      expect(response.status).toBe(200);
      log.push(`${event.id}  ${event.type.padEnd(32)} → ${JSON.stringify(await response.json())}`);

      const row = await graceRow();
      expect(row!.status).toBe("past_due");
      expect(row!.pastDueSince).not.toBeNull();

      const { hasActiveSubscription } = await import("../../src/lib/entitlement");
      const { invalidateEntitlement } = await import("../../src/lib/entitlement");
      await invalidateEntitlement(graceUserId);
      expect(
        await hasActiveSubscription(graceUserId),
        "a declined renewal must not lock a paying customer out on the first failure",
      ).toBe(true);
    });

    it("does not restart the grace clock on each retry", async () => {
      // Stripe re-sends payment_failed for every retry. Re-stamping `now` each
      // time would push the deadline out forever, so a card that never
      // succeeds would keep its access indefinitely.
      const before = (await graceRow())!.pastDueSince;
      expect(before).not.toBeNull();

      const event = await latestEvent(
        "invoice.payment_failed",
        (e) =>
          (e.data.object as Stripe.Invoice).parent?.subscription_details?.subscription ===
          graceSubscriptionId,
      );
      // A distinct event id, so it is a genuine second delivery rather than a
      // duplicate the idempotency guard would swallow.
      const retry = { ...event, id: `evt_retry_${Date.now()}` };
      log.push(retry.id);
      await deliver(retry);

      const after = (await graceRow())!.pastDueSince;
      expect(after!.getTime()).toBe(before!.getTime());
    });

    it("locks out once the grace period has elapsed", async () => {
      const { isEntitled, PAST_DUE_GRACE_MS } = await import("../../src/lib/entitlement-rule");
      const row = await graceRow();
      const failedAt = row!.pastDueSince!;

      expect(isEntitled(row!, new Date(failedAt.getTime() + PAST_DUE_GRACE_MS - 1_000))).toBe(true);
      expect(isEntitled(row!, new Date(failedAt.getTime() + PAST_DUE_GRACE_MS + 1_000))).toBe(
        false,
      );

      log.push(
        `  grace: ${failedAt.toISOString()} → ${new Date(failedAt.getTime() + PAST_DUE_GRACE_MS).toISOString()}`,
      );
    });
  });

  describe("events we do not handle", () => {
    it("acknowledges without claiming an event id", async () => {
      const eventId = `evt_ignored_${Date.now()}`;
      const response = await deliver({
        id: eventId,
        object: "event",
        type: "customer.discount.created",
        data: { object: {} },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ignored: "customer.discount.created" });
      // No claim row: re-delivering an unhandled event must stay harmless
      // rather than filling the table with rows we never act on.
      expect(await eventRows(eventId)).toHaveLength(0);
    });
  });
});
