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
  // the expected destination for this suite.
  await expect(page).toHaveURL(/\/paywall/);
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

    // And Stripe itself holds exactly one customer tagged with this user.
    const found = await stripe.customers.search({ query: `metadata['userId']:'${id}'` });
    expect(found.data, `${found.data.length} customers for one user`).toHaveLength(1);
  });

  test("a real test-mode purchase completes for BOTH plans", async ({ page }) => {
    test.slow();

    for (const plan of ["monthly", "annual"] as const) {
      const { email } = await makeUser(`buy${plan}`);
      await login(page, email);

      const { url, sessionId } = await createSession(page, plan);
      await page.goto(url);
      await payWith(page, CARD.succeeds);

      // Stripe redirects to our success_url. /welcome is outside the
      // entitlement gate precisely so this lands even before the webhook.
      await page.waitForURL(/\/welcome/, { timeout: 60_000 });

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
      expect(session.payment_status).toBe("paid");

      const subscription = session.subscription as Stripe.Subscription | null;
      expect(subscription, "no subscription was created").not.toBeNull();

      const item = subscription!.items.data[0];
      console.log(
        `PURCHASED ${plan}: subscription ${subscription!.id} · ` +
          `${item?.price.unit_amount} ${item?.price.currency} / ${item?.price.recurring?.interval} · ` +
          `status ${subscription!.status}`,
      );

      expect(item?.price.unit_amount).toBe(plan === "annual" ? 14999 : 3999);
      expect(item?.price.recurring?.interval).toBe(plan === "annual" ? "year" : "month");
      expect(["active", "trialing"]).toContain(subscription!.status);

      if (typeof session.customer === "string") createdCustomers.push(session.customer);
      await page.context().clearCookies();
    }
  });

  test("a declined card fails on Stripe's page without reaching /welcome", async ({ page }) => {
    test.slow();
    const { email } = await makeUser("declined");
    await login(page, email);

    const { url, sessionId } = await createSession(page, "monthly");
    await page.goto(url);
    await payWith(page, CARD.declined);

    // The error is Stripe's to show, and the user must stay on the payment page
    // rather than being bounced anywhere of ours.
    await expect(page.getByText(/declin/i).first()).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toContain("checkout.stripe.com");

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    expect(session.payment_status).toBe("unpaid");
    if (typeof session.customer === "string") createdCustomers.push(session.customer);
  });

  test("a 3D Secure card completes through the authentication step", async ({ page }) => {
    test.slow();
    const { email } = await makeUser("3ds");
    await login(page, email);

    const { url, sessionId } = await createSession(page, "monthly");
    await page.goto(url);
    await payWith(page, CARD.requires3ds);

    // Stripe renders the challenge in a nested iframe.
    const challenge = page.frameLocator("iframe[name^='__privateStripeFrame']").last();
    const complete = challenge.getByRole("button", { name: /complete/i });
    await complete.waitFor({ state: "visible", timeout: 45_000 });
    await complete.click();

    await page.waitForURL(/\/welcome/, { timeout: 60_000 });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    expect(session.payment_status).toBe("paid");
    if (typeof session.customer === "string") createdCustomers.push(session.customer);
  });
});
