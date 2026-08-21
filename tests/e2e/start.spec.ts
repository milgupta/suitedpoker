import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";
import { START_ANSWERS_KEY } from "../../src/lib/start-answers";

/**
 * Paid-ads funnel: `/start` (quiz + example hand) → `/signup?from=start` →
 * commit → paywall.
 *
 * Organic `/signup` → `/onboarding` is covered by onboarding.spec.ts. This
 * file only proves the two entry points stay separate, that the example hand
 * grades its preset answers, and that answers survive the account wall.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

const PATH = [{ value: "call_too_much" }, { value: "move_up" }, { value: "charts" }] as const;

async function pick(page: Page, value: string): Promise<void> {
  await page.locator(`[data-value='${value}']`).click();
}

/** Answers the three singles and the multi, landing on the example hand. */
async function completeQuestions(page: Page): Promise<void> {
  for (const step of PATH) {
    await pick(page, step.value);
  }
  await page.locator(`[data-value='facing_aggression']`).click();
  await page.locator(`[data-value='bet_sizing']`).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("[data-example-hand]")).toBeVisible();
}

test.describe("start funnel (public)", () => {
  test("/start is public and does not require login", async ({ page }) => {
    await page.goto("/start");
    await expect(page).toHaveURL(/\/start/);
    // No intro screen: the quiz opens directly on question one.
    await expect(page.locator("[data-step='1']")).toBeVisible();
  });

  test("the example hand grades the raise as correct and continues to signup", async ({ page }) => {
    await page.goto("/start");
    await expect(page.locator("[data-step='1']")).toBeVisible();
    await completeQuestions(page);

    // The scripted hand: ace-king suited on the button, folded to hero. The
    // three preset buttons are the entire decision surface.
    await expect(page.getByRole("button", { name: "Fold" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Call" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Raise" })).toBeVisible();

    await page.getByRole("button", { name: "Raise" }).click();
    await expect(page.locator("[data-example-verdict='correct']")).toBeVisible();
    await expect(page.getByText(/Exactly right/i)).toBeVisible();
    // The chart's frequencies reveal over the buttons, like the real drill.
    await expect(page.getByText("100%")).toBeVisible();

    await page.getByTestId("example-continue").click();
    await expect(page).toHaveURL(/\/signup\?from=start/);
    await expect(page.getByText(/Save your answers/i)).toBeVisible();

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      START_ANSWERS_KEY,
    );
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as { pain?: string; leaks?: string[] };
    expect(parsed.pain).toBe("call_too_much");
    expect(parsed.leaks).toEqual(["facing_aggression", "bet_sizing"]);
  });

  test("a wrong answer gets corrected, not shamed, and still continues", async ({ page }) => {
    await page.goto("/start");
    await expect(page.locator("[data-step='1']")).toBeVisible();
    await completeQuestions(page);

    await page.getByRole("button", { name: "Fold" }).click();
    await expect(page.locator("[data-example-verdict='corrected']")).toBeVisible();
    await expect(page.getByText(/The play is a raise/i)).toBeVisible();

    await page.getByTestId("example-continue").click();
    await expect(page).toHaveURL(/\/signup\?from=start/);
  });

  test("the example hand fits 390x844 without scrolling the decision away", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/start");
    await expect(page.locator("[data-step='1']")).toBeVisible();
    await completeQuestions(page);

    // The action buttons must be reachable without scrolling — the screen is
    // the product demo, and a decision below the fold is a decision not made.
    for (const name of ["Fold", "Call", "Raise"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box, `${name} has no box`).not.toBeNull();
      expect(box!.y + box!.height, `${name} sits below the fold`).toBeLessThanOrEqual(844);
    }
  });
});

test.describe("start funnel (commit)", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("continue commits stored answers and opens the paywall", async ({ page }) => {
    const email = `e2e+start${Date.now()}@suitedpoker.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error !== null) throw error;
    const id = data.user?.id;
    if (id === undefined) throw new Error("no user id");
    created.push(id);

    await page.goto("/start");
    await page.evaluate(
      ({ key, answers }) => {
        window.localStorage.setItem(key, JSON.stringify(answers));
      },
      {
        key: START_ANSWERS_KEY,
        answers: {
          pain: "call_too_much",
          goal: "move_up",
          study: "charts",
          leaks: ["facing_aggression", "bet_sizing"],
        },
      },
    );

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/(onboarding|paywall|practice)/, { timeout: 30_000 });

    // The session now exists on a page that is not the continue bridge —
    // the same state as "I just created an account and /signup refreshed".
    // Middleware must send unpaid /signup through the bridge, which commits
    // the stored quiz and lands on the wall (the ads funnel already played
    // its hand on /start).
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/paywall/, { timeout: 30_000 });

    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding, skill_tier, primary_leak_key")
      .eq("id", id)
      .single();

    const onboarding = profile?.onboarding as Record<string, unknown>;
    expect(onboarding.pain).toBe("call_too_much");
    expect(profile?.skill_tier).toBeTruthy();
    expect(profile?.primary_leak_key).toBeTruthy();

    const cleared = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      START_ANSWERS_KEY,
    );
    expect(cleared).toBeNull();
  });
});
