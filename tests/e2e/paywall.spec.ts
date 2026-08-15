import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";
// Derived, never pinned: a price change should be one edit in plans.ts, not a
// hunt through the suite for every literal that quoted it.
import { formatUsd, perMonthCents, PLANS, savingPercent } from "../../src/lib/stripe/plans";

/**
 * The paywall itself.
 *
 * Separate from checkout.spec.ts on purpose: this needs no Stripe key at all,
 * because every number on the page comes from src/lib/stripe/plans.ts. Keeping
 * it here means the layout stays verified even while the Stripe suite is
 * skipping for want of test-mode credentials.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const createdUsers: string[] = [];

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+wall${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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
  // Unsubscribed, so the entitlement gate lands them here. That IS the
  // expected destination. Generous timeout: under parallel workers the
  // redirect chain regularly takes ten seconds.
  await expect(page).toHaveURL(/\/paywall/, { timeout: 30_000 });
}

test.describe("paywall", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of createdUsers) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("the paywall fits at 390px with both plans and the CTA above the fold", async ({ page }) => {
    const { email } = await makeUser("fold");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);

    await expect(page.locator("[data-plan=annual]")).toBeVisible();
    await expect(page.locator("[data-plan=monthly]")).toBeVisible();

    // Yearly is pre-selected and says the saving as a number.
    await expect(page.locator("[data-plan=annual]")).toHaveAttribute("data-selected", "true");
    await expect(page.locator("[data-plan=monthly]")).toHaveAttribute("data-selected", "false");
    await expect(page.getByText(`Save ${savingPercent()}%`)).toBeVisible();

    // Both the per-MONTH headline and the real billed price. A monthly figure
    // is the one a subscriber can check against their own bank statement;
    // per-week reads smaller and is the standard trick.
    await expect(
      page.getByText(formatUsd(perMonthCents("annual")), { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText(formatUsd(PLANS.annual.amountCents), { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText("billed yearly", { exact: false })).toBeVisible();

    // Every card carries a real radio, not just a border weight.
    expect(await page.getByRole("radio").count()).toBe(2);

    const cta = page.getByRole("button", { name: "Start training" });
    const box = await cta.boundingBox();
    expect(box, "no CTA rendered").not.toBeNull();
    expect(box!.y + box!.height, `CTA bottom is at ${box!.y + box!.height}px`).toBeLessThan(844);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the paywall scrolls sideways at 390px").toBeLessThanOrEqual(0);
  });

  test("selecting monthly moves the radio and the summary line", async ({ page }) => {
    const { email } = await makeUser("select");
    await login(page, email);

    await page.locator("[data-plan=monthly]").click();
    await expect(page.locator("[data-plan=monthly]")).toHaveAttribute("data-selected", "true");
    await expect(page.locator("[data-plan=annual]")).toHaveAttribute("data-selected", "false");
    await expect(
      page
        .getByText(`${formatUsd(PLANS.monthly.amountCents)} ${PLANS.monthly.intervalLabel}`, {
          exact: false,
        })
        .last(),
    ).toBeVisible();
  });

  test("makes no dollar-denominated claim about poker results", async ({ page }) => {
    // Prices are dollars; RESULTS are bb/100 and accuracy only. That is an
    // ad-account and compliance boundary, not a copy preference.
    const { email } = await makeUser("claims");
    await login(page, email);

    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const claim of [
      /\$\d[\d,.]*\s*(a|per)\s*(year|month|week)\s*(in|of)\s*(profit|winnings)/,
      /won \$/,
      /\+\d+%\s*roi/,
    ]) {
      expect(text, `results claim on the paywall: ${claim}`).not.toMatch(claim);
    }
  });

  test("attributes nothing to a person who is not in the data file", async ({ page }) => {
    // The rendered half of the guarantee in tests/unit/testimonials.test.ts.
    // The proof band slides quotes when TESTIMONIALS has any and product facts
    // when it does not — so with the list empty, an attributed quote appearing
    // on the payment screen means somebody hand-wrote one into the markup.
    const { email } = await makeUser("testimonial");
    await login(page, email);

    const mode = await page.locator("[data-proof]").first().getAttribute("data-proof");
    expect(mode, "no proof band rendered").not.toBeNull();

    if (mode === "points") {
      const text = await page.locator("body").innerText();
      // A dash-attribution or a quoted sentence is what a testimonial looks
      // like. Neither can be on the page while the data file is empty.
      expect(text, "an attributed quote with no source behind it").not.toMatch(
        /[“"][^”"]{20,}[”"]\s*[—–-]\s*[A-Z]/,
      );
    }
  });

  test("the proof band is stoppable and slides", async ({ page }) => {
    const { email } = await makeUser("marquee");
    await login(page, email);

    const track = page.locator("[data-proof] .marquee-track").first();
    await expect(track).toBeVisible();

    // Moving: the animation is named and running, and the track is wider than
    // its mask so there is something to move.
    const state = await track.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        name: style.animationName,
        playState: style.animationPlayState,
        seconds: parseFloat(style.animationDuration),
        overflows: el.scrollWidth > (el.parentElement?.clientWidth ?? 0),
      };
    });
    expect(state.name).toBe("marquee");
    expect(state.playState).toBe("running");
    expect(state.overflows, "the track is not wide enough to loop").toBe(true);
    // Slow on purpose. A payment screen is the wrong place to make someone
    // chase a line of text.
    expect(state.seconds).toBeGreaterThanOrEqual(30);

    // Stoppable: anything moving that carries words has to be.
    await page.locator("[data-proof]").first().hover();
    await expect
      .poll(() => track.evaluate((el) => getComputedStyle(el).animationPlayState))
      .toBe("paused");
  });

  test("the proof band does not animate under reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    const { email } = await makeUser("marqreduce");
    await login(page, email);

    const track = page.locator("[data-proof] .marquee-track").first();
    await expect(track).toBeVisible();

    // No animation at all rather than a fast one — and the band must scroll by
    // hand instead, or its tail is unreachable behind `overflow: hidden`.
    expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(
      await page
        .locator("[data-proof]")
        .first()
        .evaluate((el) => getComputedStyle(el).overflowX),
    ).toBe("auto");

    await context.close();
  });

  test("cancelling returns to the paywall with no charge and a calm message", async ({ page }) => {
    const { email } = await makeUser("cancel");
    await login(page, email);

    await page.goto("/paywall?cancelled=1");
    await expect(page.getByText(/No charge was made/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start training" })).toBeEnabled();
  });
});
