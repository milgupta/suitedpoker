import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The plan band on the paywall — what used to be the `/diagnosis` page.
 *
 * That page was cut: it was a full page load with a 1.4s staged reveal sitting
 * between the graded demo hand and the price. The CONTENT survived and moved
 * above the plan cards, so the invariants it carried have to move with it, or
 * deleting a route quietly deletes a compliance scan.
 *
 * What is asserted here and nowhere else:
 *   - the plan is THEIRS (their minutes, their Q6 leak picks, their rating)
 *   - no dollar figure inside the band, for any venue including play money
 *   - no winnings framing anywhere in it — rule 5, the ad-account boundary
 *   - an unfinished quiz produces no band, and does not break the paywall
 *
 * Scanned through `[data-plan-band]` rather than the whole page ON PURPOSE:
 * the paywall legitimately prints "$119.99 per year" a few hundred pixels
 * below. Prices in dollars are fine; RESULTS in dollars are not, and a
 * page-wide `/\$\d/` here would either fail forever or have to be so loose it
 * proved nothing.
 *
 * The users are deliberately UNSUBSCRIBED — `/paywall` redirects an entitled
 * visitor to the app, so a subscribed fixture would test a redirect.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

const FULL_ANSWERS = {
  venue: "live_1_2",
  pain: "call_too_much",
  frequency: "weekly",
  goal: "stop_losing",
  study: "charts",
  leaks: ["blind_defense", "bet_sizing"],
  minutes: "10",
};

async function makeUser(
  tag: string,
  answers: Record<string, unknown> | null,
): Promise<{ id: string; email: string }> {
  const email = `e2e+plan${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);

  if (answers !== null) {
    await admin.from("profiles").update({ onboarding: answers }).eq("id", id);
  }

  return { id, email };
}

async function loginThenPaywall(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  // Unsubscribed, so the entitlement gate lands them here on its own.
  await expect(page).toHaveURL(/\/paywall/, { timeout: 30_000 });
}

test.describe("the plan band on the paywall", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("renders THEIR plan: first fix, Q6 picks, minutes and rating", async ({ page }) => {
    const { email } = await makeUser("mine", FULL_ANSWERS);
    await loginThenPaywall(page, email);

    const band = page.locator("[data-plan-band]");
    await expect(band).toBeVisible();

    await expect(page.locator("[data-plan-first-fix]")).toContainText(/First:/);
    // Their Q6 picks, reflected back. Without this the question is dead weight.
    await expect(page.locator("[data-plan-also]")).toContainText(/defending your blinds/);
    // Their minutes answer, and the rating the quiz placed them at.
    await expect(page.locator("[data-plan-summary]")).toContainText("10 min a day");
    await expect(page.locator("[data-plan-summary]")).toContainText(/\d{3,4}/);
  });

  test("a play-money user gets a plan with no dollar figure in it", async ({ page }) => {
    const { email } = await makeUser("playmoney", { ...FULL_ANSWERS, venue: "play_money" });
    await loginThenPaywall(page, email);

    const band = page.locator("[data-plan-band]");
    await expect(band).toBeVisible();
    expect(await band.innerText()).not.toMatch(/\$\d/);
  });

  test("never frames a figure as winnings inside the band", async ({ page }) => {
    const { email } = await makeUser("clean", FULL_ANSWERS);
    await loginThenPaywall(page, email);

    const text = await page.locator("[data-plan-band]").innerText();
    for (const claim of [/won \$/i, /win \$/i, /profit/i, /\+\s*\$\d/, /\+\d+%/, /earn/i]) {
      expect(text, `earnings framing in the plan band: ${claim}`).not.toMatch(claim);
    }
  });

  test("an unfinished quiz shows no band, and the paywall still sells", async ({ page }) => {
    const { email } = await makeUser("partial", { venue: "live_1_2", pain: "call_too_much" });
    await loginThenPaywall(page, email);

    // A half-answered questionnaire would have to guess at a plan.
    await expect(page.locator("[data-plan-band]")).toHaveCount(0);
    // The page still does its job — this is the failure mode that costs money.
    await expect(page.getByRole("button", { name: /Start training/i })).toBeVisible();
  });

  test("no onboarding at all shows no band, and the paywall still sells", async ({ page }) => {
    const { email } = await makeUser("none", null);
    await loginThenPaywall(page, email);

    await expect(page.locator("[data-plan-band]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Start training/i })).toBeVisible();
  });

  test("the CTA still clears 844px at 390px wide with the band above it", async ({ page }) => {
    // The band is new content ABOVE the purchase column, which is exactly the
    // kind of addition that pushes a CTA below the fold on a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    const { email } = await makeUser("fold", FULL_ANSWERS);
    await loginThenPaywall(page, email);

    const cta = page.getByRole("button", { name: /Start training/i }).first();
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box, "no CTA box").not.toBeNull();
    expect(box!.y + box!.height, `CTA bottom is at ${box!.y + box!.height}px`).toBeLessThan(844);
  });
});
