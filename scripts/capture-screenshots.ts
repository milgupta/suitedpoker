/**
 * Product screenshots, captured from the real app.
 *
 * THE SCRIPT IS THE DELIVERABLE, not the images. A screenshot pasted into
 * public/ once is wrong the first time anything moves, and nobody notices until
 * a prospect compares the landing page to the product. This regenerates the set
 * in one command against a seeded user, so the answer to "the UI changed" is
 * always `npm run screenshots`.
 *
 *   PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run screenshots
 *
 * DETERMINISM, and its honest limit.
 *
 * The fixture account is wiped and reseeded from fixed data every run, so the
 * dashboard, diagnosis, range grid and lesson come back byte-identical.
 *
 * The three that show a DEALT HAND — drill, the feedback shot, and the table
 * sim — do not, and deliberately should not. Making them reproducible would
 * mean letting the client choose the spot seed, and 3.2's whole design is that
 * the seed lives server-side: a client that picks the seed can pick a spot it
 * already knows the answer to. A reproducible screenshot is not worth a hole in
 * the grading boundary, so those three vary by which hand was dealt and are
 * identical in every other respect.
 *
 *   4/7 byte-identical · 3/7 vary only in the hand dealt
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../tests/support/load-local-env";

loadLocalEnv();

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const OUT = join(process.cwd(), "public", "screenshots");

/** Fixed, so re-running produces the same account rather than a new one. */
const SEED_EMAIL = "screenshots@suitedpoker.internal";
const SEED_PASSWORD = "screenshot-fixture-9f2b";

/** 2x, at the phone the product is designed for. */
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 2;

interface Shot {
  readonly name: string;
  readonly path: string;
  /** Waits for the thing that makes the shot worth taking. */
  readonly ready: (page: Page) => Promise<void>;
  readonly fullPage?: boolean;
}

/**
 * ORDER MATTERS. Read-only screens first.
 *
 * The drill and sim shots play real hands, which write attempt rows. Captured
 * before the dashboard, they moved its counts by one and no two runs matched.
 * Everything that only reads goes first; everything that writes goes last.
 */
const SHOTS: Shot[] = [
  {
    name: "dashboard",
    path: "/dashboard",
    ready: async (page) => {
      await page.waitForSelector("[data-section='actions']", { timeout: 30_000 });
      await page.waitForTimeout(500);
    },
    fullPage: true,
  },
  {
    name: "diagnosis",
    path: "/diagnosis",
    ready: async (page) => {
      // The reveal is stage-delayed opacity over ~2.4s (7.2). Playwright counts
      // opacity:0 as visible, so waiting for a selector is not enough.
      await page.waitForTimeout(3_200);
    },
    fullPage: true,
  },
  {
    name: "range-grid",
    path: "/ranges",
    ready: async (page) => {
      await page.waitForSelector("[data-cell]", { timeout: 30_000 });
      // The 169-cell reveal is capped at 300ms.
      await page.waitForTimeout(800);
    },
  },
  {
    name: "lesson",
    path: "/learn",
    ready: async (page) => {
      await page.waitForSelector("a[href^='/learn/']", { timeout: 30_000 });
      await page.locator("a[href^='/learn/']").first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
    },
    fullPage: true,
  },
  {
    name: "drill",
    path: "/arena",
    ready: async (page) => {
      // The hand itself, not the shell. 7.1 shipped with the arena crashing on
      // every load and a security test passing the whole time, because a
      // crashed page leaks nothing — so this waits for the SUCCESS state.
      await page.waitForSelector("[data-action]", { timeout: 30_000 });
      await page.waitForTimeout(600);
    },
  },
  {
    name: "feedback-frequency-bar",
    path: "/arena",
    ready: async (page) => {
      await page.waitForSelector("[data-action]", { timeout: 30_000 });
      // Answer, so the frequency bar is on screen. THE hero shot.
      await page.locator("[data-action]").first().click();
      await page.getByRole("button", { name: "Next hand" }).waitFor({ timeout: 25_000 });
      // The AI explanation streams in after the grade. The first version of
      // this shot caught the shimmer placeholders instead of the sentence —
      // a hero image of a loading state.
      // Shimmer carries aria-busy, which is the stable hook — a class name is
      // not, and this script exists to survive UI churn.
      await page
        .locator('[aria-busy="true"]')
        .first()
        .waitFor({ state: "detached", timeout: 20_000 })
        .catch(() => undefined);
      await page.waitForTimeout(1_200);
    },
  },
  {
    name: "table-sim",
    path: "/table",
    ready: async (page) => {
      // /table opens on a setup screen; the hand is one click past it.
      await page.getByTestId("start-session").click();
      await page.waitForSelector("[data-seat]", { timeout: 40_000 });
      await page.waitForTimeout(1_200);
    },
  },
];

async function ensureUser(): Promise<void> {
  if (SUPABASE_URL === "" || SERVICE_KEY === "") {
    throw new Error("Screenshots need Supabase credentials in .env.local.");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users.find((u) => u.email === SEED_EMAIL);

  const userId =
    existing?.id ??
    (
      await admin.auth.admin.createUser({
        email: SEED_EMAIL,
        password: SEED_PASSWORD,
        email_confirm: true,
      })
    ).data.user?.id;

  if (userId === undefined) throw new Error("could not create the screenshot user");

  // Entitled, so the paid screens render rather than redirecting to /paywall.
  await admin.from("subscriptions").delete().eq("user_id", userId);
  await admin.from("subscriptions").insert({
    user_id: userId,
    status: "active",
    price_id: "price_screenshots",
    current_period_end: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  });

  /**
   * Wiped and reseeded every run.
   *
   * Without this the fixture accumulates the hands each capture plays, so the
   * dashboard's counts creep upward and no two runs match. Deleting first is
   * what makes the derived screens reproducible.
   */
  await admin.from("drill_attempts").delete().eq("user_id", userId);
  await admin.from("sim_sessions").delete().eq("user_id", userId);

  const NOW = Date.parse("2026-06-01T18:00:00Z");
  const GRADES = ["best", "best", "sharp", "solid", "inaccuracy", "mistake", "best", "solid"];
  const rows = Array.from({ length: 240 }, (_, i) => ({
    user_id: userId,
    node_ref: i % 2 === 0 ? "BTN:rfi" : "CO:vs_rfi_UTG",
    hero_hand: ["AQo", "KQs", "77", "A5s", "JTs", "T9s"][i % 6],
    board: i % 3 === 0 ? null : "Kh 7d 2c",
    chosen_action: ["raise", "call", "fold"][i % 3],
    grade: GRADES[i % GRADES.length],
    ev_loss: (i % 5) * 0.31,
    time_ms: 4200 + (i % 7) * 300,
    // Spread across the last three weeks so the sparkline and the
    // week-over-week comparison both have something to show.
    created_at: new Date(NOW - i * 2 * 3_600_000).toISOString(),
  }));
  await admin.from("drill_attempts").insert(rows);

  // A profile that produces a dashboard worth showing. Fixed values, so the
  // numbers in the screenshot are the same every run.
  await admin
    .from("profiles")
    .update({
      display_name: "Alex",
      rating: 1142,
      rating_deviation: 84,
      streak_count: 12,
      longest_streak: 19,
      skill_tier: "videos",
      primary_leak_key: "overfolds_bb",
      timezone: "America/New_York",
      onboarding: { goal: "beat_friends", complete: true },
    })
    .eq("id", userId);
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(dashboard|onboarding|paywall)/, { timeout: 30_000 });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await ensureUser();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
    // Motion off: an animation mid-flight is the difference between two runs
    // producing identical bytes and producing near-identical ones.
    reducedMotion: "reduce",
  });

  const page = await context.newPage();
  await login(page);

  const results: { name: string; bytes: number }[] = [];

  for (const shot of SHOTS) {
    process.stdout.write(`  ${shot.name.padEnd(26)}`);
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded" });
      await shot.ready(page);

      const file = join(OUT, `${shot.name}.png`);
      const buffer = await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
      results.push({ name: shot.name, bytes: buffer.length });
      console.log(`${Math.round(buffer.length / 1024)}KB`);
    } catch (error) {
      console.log(`FAILED — ${error instanceof Error ? error.message.split("\n")[0] : "unknown"}`);
      results.push({ name: shot.name, bytes: 0 });
    }
  }

  await browser.close();

  // A manifest, so the landing page and the tests can enumerate what exists
  // rather than hardcoding a list that drifts.
  writeFileSync(
    join(OUT, "manifest.json"),
    `${JSON.stringify(
      {
        capturedAt: null,
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        shots: results.map((r) => ({ name: r.name, file: `/screenshots/${r.name}.png` })),
      },
      null,
      2,
    )}\n`,
  );

  const failed = results.filter((r) => r.bytes === 0);
  console.log(`\n  ${results.length - failed.length}/${results.length} captured`);
  if (failed.length > 0) {
    console.error(`  FAILED: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
}

void main();
