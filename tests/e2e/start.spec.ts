import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";
import { START_ANSWERS_KEY } from "../../src/lib/start-answers";

/**
 * Paid-ads funnel: `/start` (quiz) → `/signup?from=start` → commit → hand.
 *
 * Organic `/signup` → `/onboarding` is covered by onboarding.spec.ts. This
 * file only proves the two entry points stay separate and that answers
 * survive the account wall.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

const PATH = [
  { value: "live_1_2" },
  { value: "call_too_much" },
  { value: "weekly" },
  { value: "move_up" },
  { value: "charts" },
] as const;

async function pick(page: Page, value: string): Promise<void> {
  await page.locator(`[data-value='${value}']`).click();
}

async function passChart(page: Page): Promise<void> {
  await expect(page.locator("[data-chart='comparison']")).toBeVisible();
  await page.getByRole("button", { name: "Keep going" }).click();
}

test.describe("start funnel (public)", () => {
  test("/start is public and does not require login", async ({ page }) => {
    await page.goto("/start");
    await expect(page).toHaveURL(/\/start/);
    await expect(page.getByRole("button", { name: "Find my leak" })).toBeVisible();
  });

  test("quiz completion lands on signup with answers stored", async ({ page }) => {
    await page.goto("/start");
    await page.getByRole("button", { name: "Find my leak" }).click();

    for (const step of PATH) {
      await pick(page, step.value);
    }

    await page.locator(`[data-value='facing_aggression']`).click();
    await page.locator(`[data-value='bet_sizing']`).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await passChart(page);
    await pick(page, "10");

    await expect(page).toHaveURL(/\/signup\?from=start/);
    await expect(page.getByText(/Save your answers and see the hand/i)).toBeVisible();

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      START_ANSWERS_KEY,
    );
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as { venue?: string; minutes?: string };
    expect(parsed.venue).toBe("live_1_2");
    expect(parsed.minutes).toBe("10");
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

  test("continue commits stored answers and opens the demo hand", async ({ page }) => {
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
          venue: "live_1_2",
          pain: "call_too_much",
          frequency: "weekly",
          goal: "move_up",
          study: "charts",
          leaks: ["facing_aggression", "bet_sizing"],
          minutes: "10",
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
    // Middleware must send unpaid /signup here, not to /practice.
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/onboarding\/hand/, { timeout: 30_000 });

    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding, skill_tier, primary_leak_key")
      .eq("id", id)
      .single();

    const onboarding = profile?.onboarding as Record<string, unknown>;
    expect(onboarding.venue).toBe("live_1_2");
    expect(profile?.skill_tier).toBeTruthy();
    expect(profile?.primary_leak_key).toBeTruthy();

    const cleared = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      START_ANSWERS_KEY,
    );
    expect(cleared).toBeNull();
  });
});
