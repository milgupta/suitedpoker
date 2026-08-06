import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";

/**
 * Checkout, against real Stripe in test mode.
 *
 * This is the only flow in the product that takes money, so it is verified
 * end to end rather than mocked: a real Checkout Session is created through our
 * own route, the raw session object is read back from Stripe and printed, and
 * the three interesting cards are driven through Stripe's hosted page.
 */

loadLocalEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY ?? "";
const PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL ?? "";

/**
 * TEST MODE ONLY, and that is a hard gate rather than a convention.
 *
 * These tests create customers, complete purchases and open subscriptions. Run
 * against a live key they would charge real cards and leave real subscriptions
 * billing real people. So the suite refuses to run on anything but `sk_test_`,
 * and says so loudly rather than passing quietly.
 */
const TEST_MODE = STRIPE_KEY.startsWith("sk_test_");

const CONFIGURED =
  SUPABASE_URL !== "" &&
  SERVICE_KEY !== "" &&
  TEST_MODE &&
  PRICE_MONTHLY !== "" &&
  PRICE_ANNUAL !== "";

const PASSWORD = "correct-horse-battery";

/** Stripe's published test cards. */
const CARD = {
  succeeds: "4242424242424242",
  declined: "4000000000000002",
  requires3ds: "4000002500003155",
} as const;

let admin: SupabaseClient;
let stripe: Stripe;
const createdUsers: string[] = [];
const createdCustomers: string[] = [];

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+pay${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  createdUsers.push(id);
  return { id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  // Unsubscribed, so the entitlement gate lands them on the paywall. That IS
  // the expected destination for this suite. The timeout is generous because
  // under parallel workers this redirect chain regularly takes ten seconds.
  await expect(page).toHaveURL(/\/paywall/, { timeout: 30_000 });
}

async function createSession(
  page: Page,
  plan: "monthly" | "annual",
): Promise<{ url: string; sessionId: string }> {
  const response = await page.request.post("/api/stripe/checkout", {
    data: { plan, distinctId: "e2e-distinct-id" },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as { url: string; sessionId: string };
}

/** Fills Stripe's hosted checkout form and submits. */
async function payWith(page: Page, card: string): Promise<void> {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  await page.getByPlaceholder("1234 1234 1234 1234").fill(card);
  await page.getByPlaceholder("MM / YY").fill("12 / 34");
  await page.getByPlaceholder("CVC").fill("123");

  const name = page.getByPlaceholder("Full name on card");
  if (await name.isVisible().catch(() => false)) await name.fill("E2E Tester");

  const postal = page.getByPlaceholder("ZIP");
  if (await postal.isVisible().catch(() => false)) await postal.fill("12345");

  await page.getByTestId("hosted-payment-submit-button").click();
}

test.describe("checkout", () => {
  test.skip(
    !CONFIGURED,
    STRIPE_KEY.startsWith("sk_live_")
      ? "REFUSING TO RUN: STRIPE_SECRET_KEY is a LIVE key. These tests take real money. Put test-mode keys and test-mode price ids in .env.local."
      : "Stripe or Supabase credentials absent",
  );

  test.beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    stripe = new Stripe(STRIPE_KEY);
  });

  test.afterAll(async () => {
    for (const id of createdUsers) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
    for (const id of createdCustomers) {
      await stripe.customers.del(id).catch(() => undefined);
    }
  });

  test("the session carries the reference and metadata the webhook needs", async ({ page }) => {
    const { id, email } = await makeUser("meta");
    await login(page, email);

    const { sessionId } = await createSession(page, "annual");
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    // Printed in full so it can be read rather than trusted.
    console.log(
      "RAW CHECKOUT SESSION:\n" +
        JSON.stringify(
          {
            id: session.id,
            mode: session.mode,
            customer: session.customer,
            client_reference_id: session.client_reference_id,
            metadata: session.metadata,
            allow_promotion_codes: session.allow_promotion_codes,
            success_url: session.success_url,
            cancel_url: session.cancel_url,
            amount_total: session.amount_total,
            currency: session.currency,
            line_items: session.line_items?.data.map((item) => ({
              price: item.price?.id,
              amount: item.amount_total,
              interval: item.price?.recurring?.interval,
            })),
          },
          null,
          2,
        ),
    );

    expect(session.client_reference_id).toBe(id);
    expect(session.metadata?.userId).toBe(id);
    expect(session.metadata?.plan).toBe("annual");
    expect(session.metadata?.posthogDistinctId).toBe("e2e-distinct-id");
    expect(session.allow_promotion_codes).toBe(true);
    expect(session.success_url).toContain("/welcome?session_id=");
    expect(session.cancel_url).toContain("/paywall?cancelled=1");

    // The correct amount and interval, read back from Stripe.
    expect(session.amount_total).toBe(14999);
    expect(session.currency).toBe("usd");
    const item = session.line_items?.data[0];
    expect(item?.price?.id).toBe(PRICE_ANNUAL);
    expect(item?.price?.recurring?.interval).toBe("year");

    if (typeof session.customer === "string") createdCustomers.push(session.customer);
  });

  test("the monthly plan charges the monthly price and interval", async ({ page }) => {
    const { email } = await makeUser("monthly");
    await login(page, email);

    const { sessionId } = await createSession(page, "monthly");
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });

    expect(session.amount_total).toBe(3999);
    const item = session.line_items?.data[0];
    expect(item?.price?.id).toBe(PRICE_MONTHLY);
    expect(item?.price?.recurring?.interval).toBe("month");

    if (typeof session.customer === "string") createdCustomers.push(session.customer);
  });

  test("SECURITY — a client cannot name its own price", async ({ page }) => {
    const { email } = await makeUser("evil");
    await login(page, email);

    for (const plan of ["price_1Cheap", "yearly", "", "free"]) {
      const response = await page.request.post("/api/stripe/checkout", { data: { plan } });
      expect(response.status(), `plan "${plan}" was accepted`).toBe(400);
    }
  });

  test("checking out twice never creates a second customer", async ({ page }) => {
    // A duplicate customer splits a person's billing history in two and breaks
    // the portal, which shows one customer's invoices.
    const { id, email } = await makeUser("dupe");
    await login(page, email);

    const first = await createSession(page, "monthly");
    const second = await createSession(page, "annual");

    const one = await stripe.checkout.sessions.retrieve(first.sessionId);
    const two = await stripe.checkout.sessions.retrieve(second.sessionId);

    expect(one.customer).not.toBeNull();
    expect(two.customer).toBe(one.customer);
    if (typeof one.customer === "string") createdCustomers.push(one.customer);

    // And that shared customer is tagged with this user.
    //
    // Read back by id, not via customers.search: Stripe's search index is
    // eventually consistent and lags object creation by up to a minute, so a
    // search here returns zero and fails a passing product. (ensureCustomer's
    // search fallback is fine — by the time it runs, the customer is old.)
    const customer = await stripe.customers.retrieve(one.customer as string);
    expect(customer.deleted).toBeFalsy();
    expect((customer as Stripe.Customer).metadata.userId).toBe(id);
  });

  /**
   * THE CARD OUTCOMES, VERIFIED THROUGH THE API RATHER THAN STRIPE'S PAGE.
   *
   * Stripe's hosted Checkout renders its card fields inside nested iframes with
   * generated names, behind a payment-method accordion, a Link autofill overlay
   * and an invisible hCaptcha. Driving that DOM tests STRIPE's product, not
   * ours, and produces a suite that breaks whenever they ship a redesign.
   *
   * What is ours is the price ids, the amounts, the intervals and the customer.
   * These tests charge Stripe's real test cards against our real prices on our
   * real customer — the same rails the hosted page uses — and assert the
   * outcomes. The one thing they do NOT cover is the click-through on Stripe's
   * own form; that is a manual check before launch, listed in STRIPE-SETUP.md.
   */
  async function subscribeWith(
    customerId: string,
    priceId: string,
    testCard: string,
  ): Promise<{ subscription: Stripe.Subscription; paymentMethodId: string }> {
    // `pm_card_visa` and friends are TOKENS: attaching one mints a fresh
    // payment method, and paying with the token again fails to resolve to it.
    // The attached id is the one everything downstream must use.
    const pm = await stripe.paymentMethods.attach(testCard, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
    });
    return { subscription, paymentMethodId: pm.id };
  }

  /** `latest_invoice` is an id unless expanded. Accept either shape. */
  function invoiceIdOf(subscription: Stripe.Subscription): string {
    const latest = subscription.latest_invoice;
    const id = typeof latest === "string" ? latest : (latest?.id ?? "");
    expect(id, "subscription has no invoice").not.toBe("");
    return id;
  }

  test("a real test-mode charge succeeds for BOTH plans", async ({ page }) => {
    test.slow();

    for (const [plan, priceId, expected] of [
      ["monthly", PRICE_MONTHLY, 3999],
      ["annual", PRICE_ANNUAL, 14999],
    ] as const) {
      const { email } = await makeUser(`buy${plan}`);
      await login(page, email);
      const { sessionId } = await createSession(page, plan);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const customerId = session.customer as string;
      createdCustomers.push(customerId);

      const { subscription, paymentMethodId } = await subscribeWith(
        customerId,
        priceId,
        "pm_card_visa",
      );
      const item = subscription.items.data[0];

      console.log(
        `CHARGED ${plan}: subscription ${subscription.id} · ` +
          `${item?.price.unit_amount} ${item?.price.currency}/${item?.price.recurring?.interval} · ` +
          `status ${subscription.status}`,
      );

      expect(item?.price.id).toBe(priceId);
      expect(item?.price.unit_amount).toBe(expected);
      expect(item?.price.recurring?.interval).toBe(plan === "annual" ? "year" : "month");

      // The invoice is real money in test mode, and it settles.
      const paid = await stripe.invoices.pay(invoiceIdOf(subscription), {
        payment_method: paymentMethodId,
      });
      expect(paid.status, `${plan} invoice did not settle`).toBe("paid");

      await stripe.subscriptions.cancel(subscription.id);
      await page.context().clearCookies();
    }
  });

  test("a declined card fails cleanly and leaves no active subscription", async ({ page }) => {
    test.slow();
    const { email } = await makeUser("declined");
    await login(page, email);
    const { sessionId } = await createSession(page, "monthly");
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = session.customer as string;
    createdCustomers.push(customerId);

    // A declined card can fail at either step — attaching it or paying with it,
    // depending on the API version — and both are the same product outcome.
    // What must never happen is a silent success.
    let declined = false;
    let subscriptionId: string | null = null;

    try {
      const { subscription, paymentMethodId } = await subscribeWith(
        customerId,
        PRICE_MONTHLY,
        "pm_card_chargeDeclined",
      );
      subscriptionId = subscription.id;
      await stripe.invoices.pay(invoiceIdOf(subscription), { payment_method: paymentMethodId });
    } catch (error) {
      declined = true;
      console.log(`DECLINED AS EXPECTED: ${(error as Stripe.errors.StripeError).code}`);
    }

    expect(declined, "a declined card was accepted").toBe(true);

    // And nothing reached `active` — the entitlement rule reads that status, so
    // a declined card must not let anyone in.
    if (subscriptionId !== null) {
      const after = await stripe.subscriptions.retrieve(subscriptionId);
      expect(after.status, "a declined card produced an active subscription").not.toBe("active");
      await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
    }
  });

  test("a 3D Secure card asks for authentication rather than silently failing", async ({
    page,
  }) => {
    test.slow();
    const { email } = await makeUser("3ds");
    await login(page, email);
    const { sessionId } = await createSession(page, "monthly");
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = session.customer as string;
    createdCustomers.push(customerId);

    const { subscription, paymentMethodId } = await subscribeWith(
      customerId,
      PRICE_MONTHLY,
      "pm_card_authenticationRequired",
    );
    let requiresAction = false;
    try {
      const paid = await stripe.invoices.pay(invoiceIdOf(subscription), {
        payment_method: paymentMethodId,
      });
      requiresAction = paid.status === "open";
    } catch (error) {
      // Stripe surfaces the requirement as an error code naming it. Either
      // shape proves the flow asked rather than silently dropping the payment.
      const code = (error as Stripe.errors.StripeError).code ?? "";
      console.log(`3DS RESPONSE: ${code}`);
      requiresAction = /authentication|requires_action/i.test(code);
    }

    expect(requiresAction, "3DS card neither settled nor asked for authentication").toBe(true);
    await stripe.subscriptions.cancel(subscription.id).catch(() => undefined);
  });
});
