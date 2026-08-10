/**
 * Full-app UI review captures for design critique.
 *
 * Unlike `npm run screenshots` (marketing assets in public/), this dumps every
 * meaningful surface — marketing, auth, funnel, and every game mode — into
 * tmp/ui-review{,-web}/. PNGs only; no AVIF pipeline. An index.html lists
 * them for side-by-side review.
 *
 *   PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run screenshots:review
 *   PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run screenshots:review:web
 *
 * `UI_REVIEW_DEVICE=web` shoots a laptop (1280×900) into tmp/ui-review-web/.
 * Default is the phone the product is designed for (390×844).
 *
 * Reuses the same fixture account as the marketing capture so we do not mint
 * a second entitled user every pass. Does NOT reseed attempt rows — a review
 * pass is allowed to leave the fixture dirty.
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

const DEVICE = process.env.UI_REVIEW_DEVICE === "web" ? "web" : "phone";
/**
 * Laptop matches `capture-web-screenshots`: 1280 is where `--container-app`
 * (1100px) sits with gutters. 1180 tall so a six-max table + action bar fit
 * without cropping the decision.
 */
const VIEWPORT = DEVICE === "web" ? { width: 1280, height: 1180 } : { width: 390, height: 844 };
const SCALE = 2;
const OUT = join(process.cwd(), "tmp", DEVICE === "web" ? "ui-review-web" : "ui-review");

const SEED_EMAIL = "screenshots@suitedpoker.internal";
const SEED_PASSWORD = "screenshot-fixture-9f2b";

type AuthMode = "none" | "entitled";

interface Shot {
  readonly name: string;
  readonly path: string;
  readonly auth: AuthMode;
  readonly ready: (page: Page) => Promise<void>;
  readonly fullPage?: boolean;
  readonly group: string;
}

const settle = (page: Page, ms = 500) => page.waitForTimeout(ms);

const SHOTS: Shot[] = [
  // —— Marketing / public ——
  {
    name: "01-landing",
    path: "/",
    auth: "none",
    group: "Marketing",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("main", { timeout: 30_000 });
      await settle(page, 800);
    },
  },
  {
    name: "02-features",
    path: "/features",
    auth: "none",
    group: "Marketing",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("main", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "03-pricing",
    path: "/pricing",
    auth: "none",
    group: "Marketing",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("main", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "04-methodology",
    path: "/methodology",
    auth: "none",
    group: "Marketing",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("main", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "05-legal-terms",
    path: "/legal/terms",
    auth: "none",
    group: "Marketing",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("main, article, h1", { timeout: 30_000 });
      await settle(page);
    },
  },
  {
    name: "06-legal-privacy",
    path: "/legal/privacy",
    auth: "none",
    group: "Marketing",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("main, article, h1", { timeout: 30_000 });
      await settle(page);
    },
  },
  {
    name: "07-unavailable",
    path: "/unavailable",
    auth: "none",
    group: "Marketing",
    ready: async (page) => {
      await page.waitForSelector("h1, main", { timeout: 30_000 });
      await settle(page);
    },
  },

  // —— Auth ——
  {
    name: "10-login",
    path: "/login",
    auth: "none",
    group: "Auth",
    ready: async (page) => {
      await page.getByLabel("Email").waitFor({ timeout: 30_000 });
      await settle(page);
    },
  },
  {
    name: "11-signup",
    path: "/signup",
    auth: "none",
    group: "Auth",
    ready: async (page) => {
      await page.getByLabel("Email").waitFor({ timeout: 30_000 });
      await settle(page);
    },
  },
  {
    name: "12-forgot",
    path: "/forgot",
    auth: "none",
    group: "Auth",
    ready: async (page) => {
      await page.getByLabel("Email").waitFor({ timeout: 30_000 });
      await settle(page);
    },
  },
  {
    name: "13-reset",
    path: "/reset",
    auth: "none",
    group: "Auth",
    ready: async (page) => {
      await page.waitForSelector("form, h1", { timeout: 30_000 });
      await settle(page);
    },
  },

  // —— Funnel (logged in; exempt from entitlement) ——
  {
    name: "20-onboarding",
    path: "/onboarding",
    auth: "entitled",
    group: "Funnel",
    ready: async (page) => {
      await page.waitForSelector("form, [data-step], h1", { timeout: 30_000 });
      await settle(page, 800);
    },
  },
  {
    name: "21-onboarding-hand-gate",
    path: "/onboarding/hand",
    auth: "entitled",
    group: "Funnel",
    ready: async (page) => {
      await page.getByRole("button", { name: /Deal me in/i }).waitFor({ timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "21b-onboarding-hand-dealt",
    path: "/onboarding/hand",
    auth: "entitled",
    group: "Funnel",
    ready: async (page) => {
      const deal = page.getByRole("button", { name: /Deal me in/i });
      if (await deal.isVisible().catch(() => false)) {
        await deal.click();
      }
      await page.waitForSelector("[data-action]", { timeout: 30_000 });
      await settle(page, 1000);
    },
  },
  {
    name: "22-diagnosis",
    path: "/diagnosis",
    auth: "entitled",
    group: "Funnel",
    fullPage: true,
    ready: async (page) => {
      // Stage-delayed opacity (~2.4s). Selector alone is not enough.
      await page.waitForSelector("h1, [data-diagnosis]", { timeout: 30_000 });
      await settle(page, 3_200);
    },
  },
  {
    name: "23-paywall",
    path: "/paywall",
    auth: "entitled",
    group: "Funnel",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("input[type=radio], [data-plan]", { timeout: 30_000 });
      await settle(page, 800);
    },
  },
  {
    name: "24-welcome",
    path: "/welcome",
    auth: "entitled",
    group: "Funnel",
    ready: async (page) => {
      await page.waitForSelector("h1, main", { timeout: 30_000 });
      await settle(page, 800);
    },
  },

  // —— Product home / hubs ——
  {
    name: "30-practice",
    path: "/practice",
    auth: "entitled",
    group: "Home",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("[data-practice]", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "31-progress",
    path: "/progress",
    auth: "entitled",
    group: "Home",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("main, h1", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "32-account",
    path: "/account",
    auth: "entitled",
    group: "Home",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("h1, main", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "33-account-cancel",
    path: "/account/cancel",
    auth: "entitled",
    group: "Home",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("h1, form, main", { timeout: 30_000 });
      await settle(page, 600);
    },
  },

  // —— Game modes ——
  {
    name: "40-arena",
    path: "/arena",
    auth: "entitled",
    group: "Game modes",
    ready: async (page) => {
      await page.waitForSelector("[data-action]", { timeout: 30_000 });
      await settle(page, 800);
    },
  },
  {
    name: "41-arena-feedback",
    path: "/arena",
    auth: "entitled",
    group: "Game modes",
    ready: async (page) => {
      await page.waitForSelector("[data-action]", { timeout: 30_000 });
      await page.locator("[data-action]").first().click();
      await page.getByRole("button", { name: "Next hand" }).waitFor({ timeout: 25_000 });
      await page
        .locator('[aria-busy="true"]')
        .first()
        .waitFor({ state: "detached", timeout: 20_000 })
        .catch(() => undefined);
      await settle(page, 1_000);
      await page
        .getByRole("button", { name: "Next hand" })
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      await settle(page, 400);
    },
  },
  {
    name: "42-daily",
    path: "/daily",
    auth: "entitled",
    group: "Game modes",
    ready: async (page) => {
      await page.waitForSelector("[data-action], [data-daily], h1", { timeout: 30_000 });
      await settle(page, 1000);
    },
  },
  {
    name: "43-ranges",
    path: "/ranges",
    auth: "entitled",
    group: "Game modes",
    ready: async (page) => {
      await page.waitForSelector("[data-cell]", { timeout: 30_000 });
      await settle(page, 900);
    },
  },
  {
    name: "44-learn-index",
    path: "/learn",
    auth: "entitled",
    group: "Game modes",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("a[href^='/learn/']", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "45-learn-lesson",
    path: "/learn/before-the-flop/position-is-everything",
    auth: "entitled",
    group: "Game modes",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("article, [data-lesson], h1", { timeout: 30_000 });
      await settle(page, 800);
    },
  },
  {
    name: "46-table-setup",
    path: "/table",
    auth: "entitled",
    group: "Game modes",
    ready: async (page) => {
      await page.getByTestId("start-session").waitFor({ timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "47-table-play",
    path: "/table",
    auth: "entitled",
    group: "Game modes",
    ready: async (page) => {
      await page.getByTestId("start-session").click();
      await page.waitForSelector("[data-seat]", { timeout: 40_000 });
      await settle(page, 1_200);
    },
  },
  {
    name: "48-table-review-empty",
    path: "/table/review",
    auth: "entitled",
    group: "Game modes",
    ready: async (page) => {
      // No session id → empty/error state; still a real surface to review.
      await page.waitForSelector("main, p, a", { timeout: 30_000 });
      await settle(page, 600);
    },
  },

  // —— Design reference ——
  {
    name: "50-styleguide",
    path: "/styleguide",
    auth: "none",
    group: "Styleguide",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("h1, main", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
  {
    name: "51-styleguide-table",
    path: "/styleguide/table",
    auth: "none",
    group: "Styleguide",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("[data-seat], h1, main", { timeout: 30_000 });
      await settle(page, 800);
    },
  },
  {
    name: "52-styleguide-history",
    path: "/styleguide/history",
    auth: "none",
    group: "Styleguide",
    fullPage: true,
    ready: async (page) => {
      await page.waitForSelector("h1, main", { timeout: 30_000 });
      await settle(page, 600);
    },
  },
];

async function ensureUser(): Promise<void> {
  if (SUPABASE_URL === "" || SERVICE_KEY === "") {
    throw new Error("UI review screenshots need Supabase credentials in .env.local.");
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

  await admin.from("subscriptions").delete().eq("user_id", userId);
  await admin.from("subscriptions").insert({
    user_id: userId,
    status: "active",
    price_id: "price_screenshots",
    current_period_end: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  });

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
      // Full quiz answers — `complete: true` alone is not enough for /diagnosis
      // (resumeIndex walks every required question).
      onboarding: {
        venue: "live_1_2",
        pain: "call_too_much",
        frequency: "weekly",
        goal: "stop_losing",
        study: "charts",
        leaks: ["facing_aggression"],
        minutes: "10",
        complete: true,
      },
    })
    .eq("id", userId);
}

async function hideDevOverlay(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(practice|onboarding|paywall)/, { timeout: 30_000 });
}

function writeIndex(results: { name: string; group: string; ok: boolean; path: string }[]): void {
  const byGroup = new Map<string, typeof results>();
  for (const r of results) {
    const list = byGroup.get(r.group) ?? [];
    list.push(r);
    byGroup.set(r.group, list);
  }

  const sections = [...byGroup.entries()]
    .map(([group, shots]) => {
      const cards = shots
        .map((s) => {
          if (!s.ok) {
            return `<figure class="fail"><figcaption>${s.name} — FAILED</figcaption></figure>`;
          }
          return `<figure>
  <a href="${s.name}.png" target="_blank"><img src="${s.name}.png" alt="${s.name}" loading="lazy" /></a>
  <figcaption>${s.name}<br/><code>${s.path}</code></figcaption>
</figure>`;
        })
        .join("\n");
      return `<section><h2>${group}</h2><div class="grid">${cards}</div></section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SuitedPoker UI review</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #0b0d12; color: #e8eaef; }
    header { padding: 24px 20px 8px; position: sticky; top: 0; background: #0b0d12ee; backdrop-filter: blur(8px); z-index: 1; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    h2 { margin: 28px 20px 12px; font-size: 15px; color: #9aa3b5; text-transform: uppercase; letter-spacing: 0.06em; }
    p { margin: 0; color: #9aa3b5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; padding: 0 20px 32px; }
    figure { margin: 0; background: #141821; border: 1px solid #232836; border-radius: 12px; overflow: hidden; }
    figure.fail { padding: 24px; color: #f87171; }
    img { display: block; width: 100%; height: auto; background: #000; }
    figcaption { padding: 10px 12px 12px; font-size: 12px; }
    code { color: #7dd3fc; font-size: 11px; }
  </style>
</head>
<body>
  <header>
    <h1>SuitedPoker UI review</h1>
    <p>${DEVICE} · ${VIEWPORT.width}×${VIEWPORT.height} @${SCALE}x · ${results.filter((r) => r.ok).length}/${results.length} captured · ${new Date().toISOString()}</p>
  </header>
  ${sections}
</body>
</html>`;

  writeFileSync(join(OUT, "index.html"), html);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await ensureUser();

  const browser = await chromium.launch();

  const publicCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const entitledCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });

  const publicPage = await publicCtx.newPage();
  const entitledPage = await entitledCtx.newPage();
  await login(entitledPage);

  const results: { name: string; group: string; ok: boolean; path: string }[] = [];

  for (const shot of SHOTS) {
    process.stdout.write(`  ${shot.name.padEnd(28)}`);
    const page = shot.auth === "entitled" ? entitledPage : publicPage;
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await hideDevOverlay(page);
      await shot.ready(page);

      const file = join(OUT, `${shot.name}.png`);
      const buffer = await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
      results.push({ name: shot.name, group: shot.group, ok: true, path: shot.path });
      console.log(`${Math.round(buffer.length / 1024)}KB`);
    } catch (error) {
      const msg = error instanceof Error ? error.message.split("\n")[0] : "unknown";
      console.log(`FAILED — ${msg}`);
      results.push({ name: shot.name, group: shot.group, ok: false, path: shot.path });
    }
  }

  await browser.close();

  writeIndex(results);
  writeFileSync(
    join(OUT, "manifest.json"),
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        base: BASE,
        shots: results,
      },
      null,
      2,
    )}\n`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n  ${results.length - failed.length}/${results.length} captured → ${OUT}`);
  console.log(`  Open ${join(OUT, "index.html")} in a browser to review.`);
  if (failed.length > 0) {
    console.error(`  FAILED: ${failed.map((f) => f.name).join(", ")}`);
    process.exit(1);
  }
}

void main();
