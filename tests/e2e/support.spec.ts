import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * THE SUPPORT SECTION ON /account.
 *
 * Driven by an UNSUBSCRIBED user on purpose. /account is entitlement-exempt —
 * the people who most need to reach support are the ones whose card just
 * failed — so the test that proves support is reachable must not itself need a
 * subscription to get there. It also exercises the branch where the prefill has
 * no plan to name, which is the one most likely to render an empty field.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";
const SUPPORT_EMAIL = "help@suitedpoker.com";

let admin: SupabaseClient;
const createdUsers: string[] = [];

async function makeUser(): Promise<{ userId: string; email: string }> {
  const email = `e2e+support${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null || data.user === null) throw error ?? new Error("no user");
  createdUsers.push(data.user.id);
  return { userId: data.user.id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(practice|onboarding|paywall)/, { timeout: 30_000 });
}

/** What the mail client will show, rather than what the href happens to encode. */
function decodedParam(href: string, key: string): string {
  const query = href.slice(href.indexOf("?") + 1);
  return new URLSearchParams(query).get(key) ?? "";
}

test.describe("support on the account page", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of createdUsers) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("offers both routes to a human, addressed to the support mailbox", async ({ page }) => {
    const { email } = await makeUser();
    await login(page, email);
    await page.goto("/account");

    await expect(page.getByTestId("support-section")).toBeVisible();

    for (const id of ["support-email", "support-feature"]) {
      const href = await page.getByTestId(id).getAttribute("href");
      expect(href, `${id} has an href`).not.toBeNull();
      expect(href?.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    }
  });

  test("prefills who is writing, so support does not open by asking", async ({ page }) => {
    const { userId, email } = await makeUser();
    await login(page, email);
    await page.goto("/account");

    const href = (await page.getByTestId("support-email").getAttribute("href")) ?? "";
    const body = decodedParam(href, "body");

    expect(body).toContain(email);
    expect(body).toContain(userId);
    // The unsubscribed branch: a plan line that renders blank reads as a bug.
    expect(body).toContain("No subscription");
  });

  test("separates a feature request from support by subject", async ({ page }) => {
    const { email } = await makeUser();
    await login(page, email);
    await page.goto("/account");

    const support = await page.getByTestId("support-email").getAttribute("href");
    const feature = await page.getByTestId("support-feature").getAttribute("href");

    const supportSubject = decodedParam(support ?? "", "subject");
    const featureSubject = decodedParam(feature ?? "", "subject");

    expect(supportSubject).not.toBe(featureSubject);
    expect(featureSubject.toLowerCase()).toContain("feature");
  });

  test("shows the user their own id, in full and copyable", async ({ page }) => {
    const { userId, email } = await makeUser();
    await login(page, email);
    await page.goto("/account");

    // Full, not truncated — a shortened id is not enough to look someone up,
    // which is the only reason it is on the page.
    await expect(page.getByTestId("user-id")).toHaveValue(userId);
    await expect(page.getByTestId("copy-user-id")).toBeVisible();
  });

  test("the id does not push the page sideways at 390px", async ({ page }) => {
    const { email } = await makeUser();
    await login(page, email);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/account");
    await expect(page.getByTestId("user-id")).toBeVisible();

    // A 36-character UUID cannot wrap. The dashboard greeting shipped this exact
    // bug once, so the assertion is on the document, not on the field.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the two 'Email us' phrases are real links, not dead ends", async ({ page }) => {
    const { email } = await makeUser();
    await login(page, email);
    await page.goto("/account");

    // The one under the read-only email field. The deletion-failure copy is the
    // other, and is unreachable without provoking a failed delete.
    const inline = page.getByRole("link", { name: "Email us" }).first();
    await expect(inline).toBeVisible();
    expect((await inline.getAttribute("href"))?.startsWith(`mailto:${SUPPORT_EMAIL}`)).toBe(true);
  });
});
