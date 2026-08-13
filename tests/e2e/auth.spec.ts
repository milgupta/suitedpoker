import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * Auth end to end, against the real Supabase project.
 *
 * Test users are recognisable (`e2e+<timestamp>@suitedpoker.com`), every test
 * deletes its own users through the service role, and the whole suite skips
 * when credentials are absent — the same shape as the RLS suite, so CI stays
 * green without pointing at a live database.
 *
 * NOTE FOR LAUNCH: these users land in the production auth table. Before
 * spending on ads, move this to a second free Supabase project so test signups
 * cannot pollute real signup metrics.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

let admin: SupabaseClient;
const created: string[] = [];

function uniqueEmail(): string {
  return `e2e+${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
}

/**
 * A confirmed user WITH an active subscription.
 *
 * The subscription is not incidental. Since 1.3, the product home is behind the
 * entitlement gate, so an unsubscribed user lands on /paywall — correctly. An
 * auth test that asserts the home route would then be measuring entitlement, which
 * has its own suite (tests/e2e/entitlement.spec.ts). Granting the subscription
 * keeps these tests about auth and nothing else.
 */
async function makeConfirmedUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);

  const { error: subError } = await admin.from("subscriptions").insert({
    user_id: id,
    status: "active",
    price_id: "price_e2e",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (subError !== null) throw subError;

  return id;
}

async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.describe("auth", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent — auth e2e cannot run");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("unauthenticated /dashboard redirects to /login carrying next", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test("logging in honours ?next and lands where the user was headed", async ({ page }) => {
    const email = uniqueEmail();
    await makeConfirmedUser(email);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/practice/);
    await expect(page.locator("[data-practice]")).toBeVisible();
  });

  test("a wrong password shows friendly copy, never a raw error", async ({ page }) => {
    const email = uniqueEmail();
    await makeConfirmedUser(email);

    await login(page, email, "definitely-not-it");

    const alert = page.locator("form [role=alert]");
    await expect(alert).toHaveText("That email and password don't match.");
    // The raw Supabase string must never reach the user.
    await expect(alert).not.toContainText("Invalid login credentials");
    await expect(alert).not.toContainText("AuthApiError");
  });

  test("the session survives a hard refresh", async ({ page }) => {
    const email = uniqueEmail();
    await makeConfirmedUser(email);

    await login(page, email);
    await expect(page).toHaveURL(/\/practice/);

    await page.reload();
    await expect(page.locator("[data-practice]")).toBeVisible();
    await expect(page).toHaveURL(/\/practice/);
  });

  test("logging out ends the session and re-protects the app", async ({ page }) => {
    const email = uniqueEmail();
    await makeConfirmedUser(email);

    await login(page, email);
    await expect(page).toHaveURL(/\/practice/);

    // Sign-out lives on /account. It used to be on /paywall only, which meant
    // a subscribed user had no way to log out at all — this assertion is what
    // surfaced that.
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test("a signed-in user is bounced off /login and /signup", async ({ page }) => {
    const email = uniqueEmail();
    await makeConfirmedUser(email);

    await login(page, email);
    await expect(page).toHaveURL(/\/practice/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/practice/);

    await page.goto("/signup");
    await expect(page).toHaveURL(/\/practice/);
  });

  test("signup creates an account and routes correctly for the project's email setting", async ({
    page,
  }) => {
    const email = uniqueEmail();

    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    // Supabase's built-in SMTP allows only a handful of confirmation emails an
    // hour on the free tier, and every signup sends one. When that budget is
    // gone the app is still behaving correctly — it maps the error to friendly
    // copy — but this test cannot prove anything, so it skips and says why
    // rather than going green on a request that never happened.
    const alert = page.locator("form [role=alert]");
    const outcome = await Promise.race([
      page
        .getByRole("heading", { name: /Most players lose money|Check your email/ })
        .waitFor({ timeout: 15_000 })
        .then(() => "created" as const),
      alert.waitFor({ timeout: 15_000 }).then(() => "error" as const),
    ]);

    if (outcome === "error") {
      const text = (await alert.textContent()) ?? "";
      test.skip(
        /rate limit|a lot of email/i.test(text),
        `Supabase email rate limit reached — signup UI unverified this run: "${text}"`,
      );
      // Any other error is a real failure, not an environment limit.
      expect(text, "signup failed for a reason other than rate limiting").toBe("");
    }

    const { data } = await admin.auth.admin.listUsers();
    const user = data?.users.find((u) => u.email === email);
    expect(user, "signup did not create a user").toBeDefined();
    if (user !== undefined) created.push(user.id);
  });

  test("a confirmation link lands the user on onboarding", async ({ page }) => {
    const email = uniqueEmail();

    // Generate the link directly rather than reading an inbox. This still
    // exercises the real token, the real /auth/callback exchange and the real
    // redirect — it just does not prove the email was delivered.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password: PASSWORD,
      options: { redirectTo: `${BASE_URL}/auth/callback?next=/onboarding` },
    });
    if (error !== null) throw error;
    if (data.user !== null) created.push(data.user.id);

    await page.goto(data.properties.action_link);
    await expect(page.getByRole("heading", { name: /Most players lose money/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("a recovery link sets a new password that then works", async ({ page }) => {
    const email = uniqueEmail();
    await makeConfirmedUser(email);
    const newPassword = "a-brand-new-passphrase";

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${BASE_URL}/auth/callback?next=/reset` },
    });
    if (error !== null) throw error;

    await page.goto(data.properties.action_link);
    await expect(page).toHaveURL(/\/reset/, { timeout: 15_000 });

    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/practice/, { timeout: 15_000 });

    // The real proof: the new password logs in and the old one does not.
    await page.evaluate(() => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/auth/signout";
      document.body.appendChild(form);
      form.submit();
    });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    await login(page, email, PASSWORD);
    await expect(page.locator("form [role=alert]")).toBeVisible();

    await login(page, email, newPassword);
    await expect(page).toHaveURL(/\/practice/);
  });

  test("the Google button reaches Google's consent screen", async ({ page }) => {
    // Proves the provider is actually enabled in Supabase rather than just
    // rendered. It stops at Google's screen — completing a real sign-in would
    // need Google credentials and is not something a test should hold.
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();

    await page.waitForURL(/accounts\.google\.com|supabase\.co\/auth/, { timeout: 20_000 });
    expect(page.url()).toMatch(/accounts\.google\.com/);
  });

  test("the forgot form confirms without revealing whether the account exists", async ({
    page,
  }) => {
    await page.goto("/forgot");
    await page.getByLabel("Email").fill(`e2e+nobody${Date.now()}@suitedpoker.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();

    // Identical copy whether or not the address exists — otherwise this form is
    // an account-enumeration tool.
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test("the service role key is absent from the client bundle", () => {
  // Runs regardless of credentials: it reads the build output, not Supabase.
  const staticDir = resolve(process.cwd(), ".next/static");

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".js")) files.push(full);
    }
  };
  walk(staticDir);
  expect(files.length, "no client bundle to scan").toBeGreaterThan(0);

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const offenders = files.filter((f) => {
    const source = readFileSync(f, "utf8");
    if (source.includes("SUPABASE_SERVICE_ROLE_KEY")) return true;
    return key !== "" && source.includes(key);
  });

  expect(offenders, `service role key leaked into: ${offenders.join(", ")}`).toEqual([]);
});
