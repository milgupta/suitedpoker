import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The onboarding quiz, end to end.
 *
 * This is the top of the paid funnel, so the things checked here are the ones
 * that cost signups when they break: that answers survive a drop-off, that the
 * back button does not eat them, that every screen fits a phone without
 * scrolling, and that eight questions really can be answered in a minute.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+onb${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);

  // Entitled, so the gate does not intercept on the way to /onboarding.
  const { error: subError } = await admin.from("subscriptions").insert({
    user_id: id,
    status: "active",
    price_id: "price_e2e",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (subError !== null) throw subError;

  return { id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  // Generous on purpose. Under a loaded dev server with parallel workers this
  // redirect chain — middleware, entitlement check, render — regularly takes
  // ten seconds, and a 5s default turns that into a fake product failure.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function startQuiz(page: Page): Promise<void> {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Find my leak" }).click();
  await expect(page.locator("[data-step='1']")).toBeVisible();
}

/** Taps the nth option of the current single-select and waits for the advance. */
async function pick(page: Page, value: string): Promise<void> {
  await page.locator(`[data-value='${value}']`).click();
}

const PATH = [
  { step: 1, value: "live_1_2" },
  { step: 2, value: "call_too_much" },
  { step: 3, value: "weekly" },
  { step: 4, value: "move_up" },
  { step: 5, value: "charts" },
];

test.describe("onboarding", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("completes all eight questions and derives the profile", async ({ page }) => {
    const { id, email } = await makeUser("full");
    await login(page, email);
    await startQuiz(page);

    for (const { step, value } of PATH) {
      await expect(page.locator(`[data-step='${step}']`)).toBeVisible();
      await pick(page, value);
    }

    // Q6 is the multi-select: Continue is disabled until something is picked.
    await expect(page.locator("[data-step='6']")).toBeVisible();
    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect(continueButton).toBeDisabled();
    await page.locator("[data-value='facing_aggression']").click();
    await page.locator("[data-value='bet_sizing']").click();
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    await expect(page.locator("[data-step='7']")).toBeVisible();
    await pick(page, "10");

    await expect(page.locator("[data-step='8']")).toBeVisible();
    await page.getByRole("textbox").fill("Folded top pair to a river shove and it still bugs me.");
    await page.getByRole("button", { name: "Show me my leak" }).click();

    await expect(page).toHaveURL(/\/diagnosis/);

    const { data } = await admin
      .from("profiles")
      .select("onboarding, skill_tier, primary_leak_key, rating, rating_deviation")
      .eq("id", id)
      .single();

    console.log("DERIVED PROFILE:\n" + JSON.stringify(data, null, 2));

    const onboarding = data?.onboarding as Record<string, unknown>;
    expect(onboarding.venue).toBe("live_1_2");
    expect(onboarding.pain).toBe("call_too_much");
    expect(onboarding.frequency).toBe("weekly");
    expect(onboarding.goal).toBe("move_up");
    expect(onboarding.study).toBe("charts");
    expect(onboarding.leaks).toEqual(["facing_aggression", "bet_sizing"]);
    expect(onboarding.minutes).toBe("10");
    expect(String(onboarding.hand)).toContain("river shove");

    expect(data?.skill_tier).toBe("charts");
    expect(data?.primary_leak_key).toBe("overcalling");
    expect(data?.rating).toBe(1000);
    expect(data?.rating_deviation).toBe(350);
  });

  test("single-selects auto-advance with no Continue button", async ({ page }) => {
    const { email } = await makeUser("advance");
    await login(page, email);
    await startQuiz(page);

    // Nothing to press. One tap is the whole interaction.
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await pick(page, "home");
    await expect(page.locator("[data-step='2']")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  });

  test("progress never decreases and never skips, including going back", async ({ page }) => {
    const { email } = await makeUser("progress");
    await login(page, email);
    await startQuiz(page);

    const seen: number[] = [];
    const read = async (): Promise<number> =>
      Number(await page.locator("[role=progressbar]").getAttribute("data-progress"));

    for (const { value } of PATH) {
      seen.push(await read());
      await pick(page, value);
      await page.waitForTimeout(400);
    }
    seen.push(await read());

    // Forward: strictly +1 each time, no gaps.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `progress went ${seen[i - 1]} -> ${seen[i]}`).toBe(seen[i - 1]! + 1);
    }

    // Back: exactly one step, and forward again returns to the same number.
    const before = await read();
    await page.getByLabel("Back").click();
    await page.waitForTimeout(400);
    expect(await read()).toBe(before - 1);
  });

  test("back preserves every answer", async ({ page }) => {
    const { email } = await makeUser("back");
    await login(page, email);
    await startQuiz(page);

    await pick(page, "online_micro");
    await page.waitForTimeout(400);
    await pick(page, "tilt");
    await page.waitForTimeout(400);

    await page.getByLabel("Back").click();
    await page.waitForTimeout(400);
    await expect(page.locator("[data-value='tilt']")).toHaveAttribute("aria-checked", "true");

    await page.getByLabel("Back").click();
    await page.waitForTimeout(400);
    await expect(page.locator("[data-value='online_micro']")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("resumes mid-quiz after the session is closed", async ({ page, browser }) => {
    const { email } = await makeUser("resume");
    await login(page, email);
    await startQuiz(page);

    for (const { value } of PATH.slice(0, 3)) {
      await pick(page, value);
      await page.waitForTimeout(400);
    }
    await expect(page.locator("[data-step='4']")).toBeVisible();

    // A fresh context: new tab, new day, phone picked back up.
    const second = await browser.newContext();
    const resumed = await second.newPage();
    await login(resumed, email);
    await resumed.goto("/onboarding");

    // Straight back to Q4, with the first three intact.
    await expect(resumed.locator("[data-step='4']")).toBeVisible();
    await resumed.getByLabel("Back").click();
    await resumed.waitForTimeout(400);
    await expect(resumed.locator("[data-value='weekly']")).toHaveAttribute("aria-checked", "true");

    await second.close();
  });

  test("every screen fits 390x844 without scrolling", async ({ page }) => {
    const { email } = await makeUser("fits");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);
    await startQuiz(page);

    async function assertFits(label: string): Promise<void> {
      const overflow = await page.evaluate(() => ({
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.y, `${label} needs ${overflow.y}px of vertical scroll`).toBeLessThanOrEqual(
        0,
      );
      expect(overflow.x, `${label} scrolls sideways by ${overflow.x}px`).toBeLessThanOrEqual(0);
    }

    for (const { step, value } of PATH) {
      await assertFits(`Q${step}`);
      await pick(page, value);
      await page.waitForTimeout(400);
    }

    await assertFits("Q6");
    await page.locator("[data-value='bluffing']").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(400);

    await assertFits("Q7");
    await pick(page, "5");
    await page.waitForTimeout(400);

    await assertFits("Q8");
  });

  test("every option clears a 44px touch target at 390px", async ({ page }) => {
    const { email } = await makeUser("targets");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);
    await startQuiz(page);

    const undersized = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll("[role=radio],[role=checkbox]"))) {
        const { width, height } = el.getBoundingClientRect();
        if (height > 0 && (height < 44 || width < 44)) {
          bad.push(`${el.textContent?.trim()} — ${Math.round(width)}x${Math.round(height)}`);
        }
      }
      return bad;
    });
    expect(undersized, undersized.join("\n")).toEqual([]);
  });

  test("shows the same reassurance on every question", async ({ page }) => {
    // Identical every time so it goes invisible after step two while still
    // removing the "am I locking myself in?" hesitation.
    const { email } = await makeUser("footer");
    await login(page, email);
    await startQuiz(page);

    for (const { value } of PATH.slice(0, 3)) {
      await expect(page.getByText("You can adjust later.")).toBeVisible();
      await pick(page, value);
      await page.waitForTimeout(400);
    }
    await expect(page.getByText("You can adjust later.")).toBeVisible();
  });

  test("completes in under 75 seconds with fast tapping", async ({ page }) => {
    const { email } = await makeUser("speed");
    await login(page, email);

    const startedAt = Date.now();
    await startQuiz(page);

    for (const { value } of PATH) {
      await pick(page, value);
      await page.waitForTimeout(300);
    }
    await page.locator("[data-value='bluffing']").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(300);
    await pick(page, "5");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page).toHaveURL(/\/diagnosis/);

    const elapsed = (Date.now() - startedAt) / 1000;
    console.log(`QUIZ COMPLETED IN ${elapsed.toFixed(1)}s`);
    expect(elapsed, `took ${elapsed.toFixed(1)}s`).toBeLessThan(75);
  });

  test("the optional last question really is skippable", async ({ page }) => {
    const { id, email } = await makeUser("skip");
    await login(page, email);
    await startQuiz(page);

    for (const { value } of PATH) {
      await pick(page, value);
      await page.waitForTimeout(400);
    }
    await page.locator("[data-value='bluffing']").click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(400);
    await pick(page, "5");
    await page.waitForTimeout(400);

    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page).toHaveURL(/\/diagnosis/);

    // Skipping still completes the derivation — it is optional, not required.
    const { data } = await admin
      .from("profiles")
      .select("skill_tier, primary_leak_key, rating")
      .eq("id", id)
      .single();
    expect(data?.skill_tier).toBe("charts");
    expect(data?.rating).toBe(1000);
  });
});
