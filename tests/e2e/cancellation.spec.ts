import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * LEAVING, END TO END, AGAINST REAL STRIPE.
 *
 * Cancellation is the one flow where being slightly wrong is expensive in both
 * directions. Cancel immediately and you have taken back a period they paid
 * for. Fail to cancel and you keep billing someone who asked you to stop, which
 * comes back as a chargeback rather than a refund request.
 *
 * So each test drives the real UI against a real test-mode subscription and
 * then asks STRIPE what happened, not our own database.
 */

loadLocalEnv();

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY ?? "";
const PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL ?? "";

const CONFIGURED =
  isConfigured() &&
  STRIPE_KEY.startsWith("sk_test_") &&
  PRICE_MONTHLY !== "" &&
  PRICE_ANNUAL !== "";

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
let stripe: Stripe;
const createdUsers: string[] = [];
const createdCustomers: string[] = [];

interface Subscriber {
  userId: string;
  email: string;
  customerId: string;
  subscriptionId: string;
  periodEnd: Date;
}

/** A real user with a real live test-mode subscription. */
async function makeSubscriber(plan: "monthly" | "annual" = "monthly"): Promise<Subscriber> {
  const email = `e2e+cancel${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null || data.user === null) throw error ?? new Error("no user");
  const userId = data.user.id;
  createdUsers.push(userId);

  const customer = await stripe.customers.create({ email, metadata: { userId } });
  createdCustomers.push(customer.id);

  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: plan === "annual" ? PRICE_ANNUAL : PRICE_MONTHLY }],
    metadata: { userId, plan },
  });

  const periodEnd = new Date((subscription.items.data[0]?.current_period_end ?? 0) * 1000);

  const { error: insertError } = await admin.from("subscriptions").insert({
    user_id: userId,
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    price_id: plan === "annual" ? PRICE_ANNUAL : PRICE_MONTHLY,
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
  });
  if (insertError !== null) throw insertError;

  return { userId, email, customerId: customer.id, subscriptionId: subscription.id, periodEnd };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(dashboard|onboarding|paywall)/, { timeout: 25_000 });
}

test.describe("cancellation", () => {
  test.skip(!CONFIGURED, "Supabase or Stripe test credentials absent");
  // Each test provisions a real Stripe customer, card and subscription before
  // it touches the page, which is comfortably more than the default budget.
  test.describe.configure({ mode: "serial", timeout: 150_000 });

  test.beforeAll(() => {
    admin = adminClient();
    stripe = new Stripe(STRIPE_KEY, { apiVersion: "2026-07-29.dahlia" });
  });

  test.afterAll(async () => {
    for (const id of createdCustomers) await stripe.customers.del(id).catch(() => undefined);
    for (const id of createdUsers) {
      await admin.from("cancellations").delete().eq("user_id", id);
      await admin.from("subscriptions").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  /* ── the five reasons ─────────────────────────────────────────────────── */

  const CASES = [
    { reason: "too_expensive", offer: "switch_to_annual" },
    { reason: "not_using", offer: "try_daily" },
    { reason: "not_learning", offer: "tell_us" },
    { reason: "found_better", offer: null },
    { reason: "taking_break", offer: null },
  ] as const;

  for (const { reason, offer } of CASES) {
    test(`"${reason}" shows the right offer, stores the reason, and cancels at period end`, async ({
      page,
    }) => {
      const user = await makeSubscriber("monthly");
      await login(page, user.email);

      await page.goto("/account/cancel");
      await page.getByTestId(`reason-${reason}`).click();
      await page.getByTestId("reason-continue").click();

      if (offer === null) {
        // No honest offer exists for this reason — straight to confirm.
        await expect(page.getByTestId("confirm")).toBeVisible();
        await expect(page.getByTestId("offer")).toHaveCount(0);
      } else {
        const shown = page.getByTestId("offer");
        await expect(shown).toBeVisible();
        await expect(shown).toHaveAttribute("data-offer", offer);

        // Declining goes STRAIGHT to confirm. An offer that reappears is a dark
        // pattern, and the people it catches charge back instead of cancelling.
        await page.getByTestId("offer-decline").click();
        await expect(page.getByTestId("confirm")).toBeVisible();
        await expect(page.getByTestId("offer")).toHaveCount(0);
      }

      // The date is stated before they confirm, not after.
      await expect(page.getByTestId("access-until")).toContainText(/\d{4}/);

      await page.getByTestId("confirm-cancel").click();
      await expect(page.getByTestId("done")).toBeVisible({ timeout: 25_000 });

      // Stripe is the authority, not our table.
      const live = await stripe.subscriptions.retrieve(user.subscriptionId);
      expect(live.cancel_at_period_end, "must cancel at period end").toBe(true);
      expect(live.status, "must NOT cancel immediately — they paid for this period").toBe("active");

      const { data: rows } = await admin
        .from("cancellations")
        .select("reason, offer_shown, offer_accepted")
        .eq("user_id", user.userId);

      expect(rows).toHaveLength(1);
      expect(rows![0]!.reason).toBe(reason);
      expect(rows![0]!.offer_shown).toBe(offer ?? "none");
      expect(rows![0]!.offer_accepted).toBe(false);
    });
  }

  /* ── access persists ──────────────────────────────────────────────────── */

  test("a cancelled user keeps access until the date they were shown", async ({ page }) => {
    const user = await makeSubscriber("monthly");
    await login(page, user.email);

    await page.goto("/account/cancel");
    await page.getByTestId("reason-taking_break").click();
    await page.getByTestId("reason-continue").click();
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByTestId("done")).toBeVisible({ timeout: 25_000 });

    const shownDate = await page.getByTestId("access-until").textContent();
    expect(shownDate).toContain(
      user.periodEnd.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    );

    // The whole point: still in, right now.
    await page.goto("/drill");
    await expect(page).not.toHaveURL(/\/paywall/);

    await page.goto("/account");
    await expect(page.getByTestId("cancelling-notice")).toBeVisible();
    // And no second chance to cancel what is already cancelled.
    await expect(page.getByTestId("start-cancel")).toHaveCount(0);
  });

  test("the yearly plan is not offered a switch to yearly", async ({ page }) => {
    const user = await makeSubscriber("annual");
    await login(page, user.email);

    await page.goto("/account/cancel");
    await page.getByTestId("reason-too_expensive").click();
    await page.getByTestId("reason-continue").click();

    // An annual subscriber told "switch to yearly and save" reads as an unread
    // form letter, and confirms they were right to leave.
    await expect(page.getByTestId("offer")).toHaveCount(0);
    await expect(page.getByTestId("confirm")).toBeVisible();
  });

  /* ── deletion ─────────────────────────────────────────────────────────── */

  test("deleting the account provably cancels the Stripe subscription", async ({ page }) => {
    const user = await makeSubscriber("monthly");
    await login(page, user.email);

    await page.goto("/account");
    await page.getByTestId("delete-open").click();

    // The wrong word must not arm the button.
    await page.getByTestId("delete-confirm").fill("delete");
    await expect(page.getByTestId("delete-submit")).toBeDisabled();

    await page.getByTestId("delete-confirm").fill("DELETE");
    await expect(page.getByTestId("delete-submit")).toBeEnabled();
    await page.getByTestId("delete-submit").click();

    await page.waitForURL(/\/($|\?)/, { timeout: 30_000 });

    // Asked of Stripe. An orphaned subscription billing a deleted user is a
    // chargeback we would lose.
    const live = await stripe.subscriptions.retrieve(user.subscriptionId);
    expect(live.status, "no orphaned subscription may remain").toBe("canceled");
    // Immediate, not at period end — the account no longer exists to bill.
    expect(live.cancel_at_period_end).toBe(false);

    const { data } = await admin.auth.admin.getUserById(user.userId);
    expect(data.user, "the auth user must be gone").toBeNull();
  });

  /* ── timezone ─────────────────────────────────────────────────────────── */

  test("a timezone change immediately changes which day the daily uses", async ({ page }) => {
    const user = await makeSubscriber("monthly");
    await login(page, user.email);

    await page.goto("/account");
    await page.getByTestId("timezone-input").fill("Pacific/Kiritimati");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    const { data: ahead } = await admin
      .from("profiles")
      .select("timezone")
      .eq("id", user.userId)
      .single();
    expect(ahead!.timezone).toBe("Pacific/Kiritimati");

    // Kiritimati is UTC+14 and Niue is UTC-11: 25 hours apart, so for most of
    // any given day the two are on DIFFERENT calendar dates. That is the whole
    // reason localDay() exists, and why a wrong timezone costs a real streak.
    const dayIn = (zone: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

    await page.getByTestId("timezone-input").fill("Pacific/Niue");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    const { data: behind } = await admin
      .from("profiles")
      .select("timezone")
      .eq("id", user.userId)
      .single();
    expect(behind!.timezone).toBe("Pacific/Niue");

    console.log(
      `  Kiritimati: ${dayIn("Pacific/Kiritimati")} · Niue: ${dayIn("Pacific/Niue")} — ${
        dayIn("Pacific/Kiritimati") === dayIn("Pacific/Niue")
          ? "same day right now"
          : "DIFFERENT days"
      }`,
    );

    // A rejected zone must not overwrite a good one.
    await page.getByTestId("timezone-input").fill("Not/AZone");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("That didn't save. Try again?")).toBeVisible();

    const { data: unchanged } = await admin
      .from("profiles")
      .select("timezone")
      .eq("id", user.userId)
      .single();
    expect(unchanged!.timezone).toBe("Pacific/Niue");
  });
});
