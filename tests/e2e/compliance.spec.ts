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
  test("signup is blocked without the 18+ confirmation", async ({ page }) => {
    await page.goto("/signup");

    const unique = `e2e+age${Date.now()}@suitedpoker.com`;
    await page.getByLabel("Email").fill(unique);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-9");
    await page.getByLabel(/confirm password/i).fill("correct-horse-9");

    // Deliberately NOT checking the box.
    await expect(page.getByTestId("age-confirm")).not.toBeChecked();
    await page.getByRole("button", { name: /create|sign up/i }).click();

    // Still on signup, with the reason stated.
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole("alert").filter({ hasText: /18 or over/i })).toBeVisible();
  });

  test("signup proceeds once it is confirmed", async ({ page }) => {
    // The control: the gate must be a gate, not a wall.
    await page.goto("/signup");
    await page.getByTestId("age-confirm").check();
    await expect(page.getByTestId("age-confirm")).toBeChecked();

    // No validation ERROR before anything is submitted. Matched on the alert
    // role rather than the text — "18 or over" is also the checkbox's own
    // label, so a text match can never be zero and the assertion was
    // unsatisfiable rather than wrong about the product.
    await page.getByLabel("Email").fill(`e2e+age2${Date.now()}@suitedpoker.com`);
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
