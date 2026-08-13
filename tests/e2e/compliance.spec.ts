import { expect, test } from "@playwright/test";
import { BLOCKED_COUNTRIES, DISCLAIMER } from "../../src/lib/compliance";

/**
 * The three compliance boundaries, driven through the real app.
 *
 * None of these is about legal risk in the abstract. A frozen Stripe account or
 * a banned ad account is a business-ending event, and all three are decided by
 * a reviewer looking at exactly these surfaces.
 */

test.describe("compliance", () => {
  test("signup has no 18+ checkbox or confirm-password field", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.getByTestId("age-confirm")).toHaveCount(0);
    await expect(page.getByLabel(/confirm password/i)).toHaveCount(0);

    const unique = `e2e+age${Date.now()}@suitedpoker.com`;
    await page.getByLabel("Email").fill(unique);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-9");
    await page.getByRole("button", { name: /create|sign up/i }).click();

    // Without the old gates, submit must leave the empty-form validation path —
    // either check-email / onboarding, or a server auth alert. Never the 18+ copy.
    await expect(page.getByRole("alert").filter({ hasText: /18 or over/i })).toHaveCount(0);
  });

  test("a blocked region gets the explanation page, not an error", async ({ browser }) => {
    // Spoofing the header Vercel sets. Locally it is absent, which reads as
    // "not blocked" — failing closed would block every developer.
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-vercel-ip-country": BLOCKED_COUNTRIES[0]! },
    });
    const page = await context.newPage();

    await page.goto("/");
    await expect(page).toHaveURL(/\/unavailable/);

    const text = await page.locator("body").innerText();
    expect(text).toContain("not available where you are");
    expect(text).toContain("help@suitedpoker.com");
    // An explanation, not a failure.
    expect(text.toLowerCase()).not.toContain("forbidden");
    expect(text.toLowerCase()).not.toContain("403");

    // And it cannot be walked around.
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/unavailable/);
    await page.goto("/paywall");
    await expect(page).toHaveURL(/\/unavailable/);

    await context.close();
  });

  test("an allowed region is untouched", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-vercel-ip-country": "GB" },
    });
    const page = await context.newPage();

    await page.goto("/");
    await expect(page).not.toHaveURL(/\/unavailable/);
    await expect(page.locator("[data-cta='hero']")).toBeVisible();

    await context.close();
  });

  test("the disclaimer appears on every page, including the landing page", async ({ page }) => {
    for (const route of [
      "/",
      "/methodology",
      "/login",
      "/signup",
      "/legal/terms",
      "/unavailable",
    ]) {
      await page.goto(route);
      await expect(page.getByText(DISCLAIMER).first(), `${route} has no disclaimer`).toBeVisible();
    }
  });
});
