import { chromium } from "@playwright/test";
import {
  ISOLATION_VARS,
  assertNotProduction,
  e2eCredentials,
  missingIsolationVars,
  projectRefOf,
} from "../support/e2e-supabase";
import { loadLocalEnv } from "../support/load-local-env";

/**
 * PROVES THE APP UNDER TEST IS POINTED AT THE E2E PROJECT, BEFORE ANY SPEC RUNS.
 *
 * `tests/support/e2e-supabase.ts` controls where the TEST PROCESS creates
 * users. It has no say over where the SERVER sends them — and three specs
 * (`auth.spec.ts`, `analytics.spec.ts`) drive the real signup form, so the
 * server's Supabase project is what decides whether a run pollutes the table
 * the funnel is measured from.
 *
 * `playwright.config.ts` passes the e2e credentials into `webServer.env`, which
 * is correct and also not sufficient: `reuseExistingServer` is on locally, so a
 * server someone already had running on the port is used as-is and the env
 * never applies. That failure is silent and it is the exact one that costs you
 * the metrics.
 *
 * So this asks the running server directly. It opens /login, submits, and reads
 * the hostname of the auth request the browser makes — login goes through the
 * BROWSER Supabase client, so the destination is observable from the outside.
 * The request is aborted: nothing is sent to any project, and no user is
 * created anywhere by the check itself.
 *
 * It fails CLOSED. An unreadable destination aborts the run rather than
 * assuming the good case, because the bad case is unrecoverable.
 */

loadLocalEnv();

const PROBE_EMAIL = "e2e-isolation-probe@suitedpoker.com";
const PROBE_PASSWORD = "not-a-real-password-000";

function panel(lines: readonly string[]): string {
  return ["", ...lines, ""].join("\n");
}

async function observedAuthHost(baseURL: string): Promise<string | null> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const hosts: string[] = [];

  try {
    await page.route("**/*", async (route) => {
      const { hostname } = new URL(route.request().url());
      if (hostname.includes("supabase")) {
        hosts.push(hostname);
        // Abort rather than continue: we want the address, not the round trip.
        await route.abort();
        return;
      }
      await route.fallback();
    });

    await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
    await page.fill("#email", PROBE_EMAIL);
    await page.fill("#password", PROBE_PASSWORD);
    await page.click('button[type="submit"]');

    const deadline = Date.now() + 20_000;
    while (hosts.length === 0 && Date.now() < deadline) {
      await page.waitForTimeout(250);
    }

    return hosts[0] ?? null;
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const missing = missingIsolationVars();

  // A fresh clone has none of them. That is allowed — the suite runs, and
  // `adminClient()` warns once per run about where the users are going.
  if (missing.length === ISOLATION_VARS.length) {
    assertNotProduction();
    return;
  }

  if (missing.length > 0) {
    throw new Error(
      panel([
        "  REFUSING TO RUN: e2e isolation is only half configured.",
        "",
        `  Missing: ${missing.join(", ")}`,
        "",
        "  A partial set is worse than none. The auth table would be isolated",
        "  while every profile, drill attempt and sim hand still lands in the",
        "  production database — and the warning that would have told you so",
        "  goes quiet, because the auth half looks correct.",
        "",
        "  Set all four, or none. See docs/E2E-DATABASE.md.",
      ]),
    );
  }

  const expected = projectRefOf(e2eCredentials().url);
  const host = await observedAuthHost(baseURL);

  if (host === null) {
    throw new Error(
      panel([
        "  REFUSING TO RUN: could not observe where the app sends auth.",
        "",
        `  Submitted the login form at ${baseURL}/login and saw no request to`,
        "  any Supabase host within 20s.",
        "",
        "  Usually this means the server has no Supabase credentials at all, or",
        "  it is not the server you think it is. Check that it started, and that",
        "  NEXT_PUBLIC_SUPABASE_URL reached it.",
      ]),
    );
  }

  if (!host.startsWith(`${expected}.`)) {
    throw new Error(
      panel([
        "  REFUSING TO RUN: the app under test is pointed at the WRONG Supabase",
        "  project. Test users would land in it.",
        "",
        `    expected  ${expected}.supabase.co   (E2E_SUPABASE_URL)`,
        `    observed  ${host}`,
        "",
        "  The e2e credentials are passed through webServer.env, but",
        "  reuseExistingServer is on locally — so a server that was already",
        "  running on this port is used exactly as it was started, with your",
        "  own .env.local.",
        "",
        "  Stop it and let Playwright start its own:",
        "",
        "    PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test",
        "",
        "  See docs/E2E-DATABASE.md.",
      ]),
    );
  }

  console.log(`\n  ✓ e2e isolated — the app under test authenticates against ${expected}\n`);
}
