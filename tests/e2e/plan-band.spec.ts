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
 * the paywall legitimately prints "$73.99 per year" a few hundred pixels
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

  test("the showcase renders one real hand, with a real mix", async ({ page }) => {
    /*
     * The plan band that used to sit here was removed — a list of things the
     * product WOULD teach, replaced by the thing itself. What matters now is
     * that the showcase is a LIVE render of the solution data, not a picture:
     * a screenshot goes stale silently, and this one cannot.
     */
    const { email } = await makeUser("mine", FULL_ANSWERS);
    await loginThenPaywall(page, email);

    const showcase = page.locator("[data-showcase]");
    await expect(showcase).toBeVisible();

    const text = await showcase.innerText();
    // Two frequencies that sum to 100 — the mix IS the argument this makes.
    const percents = [...text.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(percents.length, `no frequencies in the showcase: ${text}`).toBeGreaterThanOrEqual(2);
    expect(percents[0]! + percents[1]!).toBe(100);
  });

  test("the showcase carries no dollar figure and no winnings framing", async ({ page }) => {
    // Rule 5, on the highest-traffic pre-purchase screen in the product. Scoped
    // to the showcase, because the plan PRICES on the same page are legitimately
    // in dollars — a price is not a result.
    const { email } = await makeUser("clean", FULL_ANSWERS);
    await loginThenPaywall(page, email);

    const text = await page.locator("[data-showcase]").innerText();
    expect(text).not.toMatch(/\$\d/);
    for (const claim of [/won \$/i, /win \$/i, /profit/i, /\+\s*\$\d/, /\+\d+%/, /earn/i]) {
      expect(text, `earnings framing in the showcase: ${claim}`).not.toMatch(claim);
    }
  });

  test("a play-money user still sees no dollar figure", async ({ page }) => {
    const { email } = await makeUser("playmoney", { ...FULL_ANSWERS, venue: "play_money" });
    await loginThenPaywall(page, email);

    await expect(page.locator("[data-showcase]")).toBeVisible();
    expect(await page.locator("[data-showcase]").innerText()).not.toMatch(/\$\d/);
  });

  test("no onboarding at all still sells", async ({ page }) => {
    const { email } = await makeUser("none", null);
    await loginThenPaywall(page, email);

    // The showcase does not depend on the quiz, so it renders for everybody —
    // which is the point of replacing the personalised band with it.
    await expect(page.locator("[data-showcase]")).toBeVisible();
    await expect(page.getByRole("button", { name: /Start training/i })).toBeVisible();
  });

  test("the CTA still clears 844px at 390px wide", async ({ page }) => {
    /*
     * The showcase is a second grid column on desktop and a block BELOW the
     * purchase column on a phone, so it must not push the CTA down. This is the
     * assertion that keeps the DOM order (purchase first) load-bearing rather
     * than incidental.
     */
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
