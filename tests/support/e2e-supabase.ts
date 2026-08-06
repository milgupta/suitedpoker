import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load-local-env";

/**
 * THE ONE PLACE THE TEST SUITE GETS SUPABASE CREDENTIALS.
 *
 * Every e2e spec used to build its own admin client straight from
 * `NEXT_PUBLIC_SUPABASE_URL` — which is the PRODUCTION project. A full run
 * creates something like sixty auth users, and every one of them lands in the
 * same `auth.users` table as real signups.
 *
 * That is not a tidiness problem. Signup count, activation rate, and D1
 * retention are the numbers that decide whether an ad campaign is working, and
 * they are computed off that table. Sixty fake rows a run makes the first weeks
 * of paid traffic unreadable, and the corruption is retrospective — you cannot
 * clean it out later without knowing which rows were tests.
 *
 * So: a SECOND Supabase project, addressed by `E2E_SUPABASE_*`. When those are
 * absent the suite still runs (a fresh clone must work) but it says so loudly
 * on every single run, and `assertNotProduction()` refuses outright once the
 * app is pointed at the live domain.
 */

loadLocalEnv();

export interface E2ECredentials {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceKey: string;
  /** False when we fell back to the app's own project. */
  readonly isolated: boolean;
}

function read(name: string): string {
  return process.env[name] ?? "";
}

export function e2eCredentials(): E2ECredentials {
  const url = read("E2E_SUPABASE_URL");
  const anonKey = read("E2E_SUPABASE_ANON_KEY");
  const serviceKey = read("E2E_SUPABASE_SERVICE_ROLE_KEY");

  if (url !== "" && anonKey !== "" && serviceKey !== "") {
    return { url, anonKey, serviceKey, isolated: true };
  }

  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceKey: read("SUPABASE_SERVICE_ROLE_KEY"),
    isolated: false,
  };
}

export function isConfigured(): boolean {
  const { url, serviceKey } = e2eCredentials();
  return url !== "" && serviceKey !== "";
}

/**
 * Refuses to run against the production project once real traffic exists.
 *
 * The signal is `NEXT_PUBLIC_SITE_URL`: a localhost or preview URL means this
 * is a development database and polluting it costs nothing. The live domain
 * means the auth table is the one the funnel is measured from.
 */
export function assertNotProduction(): void {
  const { isolated } = e2eCredentials();
  if (isolated) return;

  const site = read("NEXT_PUBLIC_SITE_URL");
  const isLive = /suitedpoker\.com/.test(site) && !site.includes("localhost");

  if (isLive) {
    throw new Error(
      [
        "",
        "REFUSING TO RUN: the e2e suite would create users in the PRODUCTION",
        "Supabase project, and NEXT_PUBLIC_SITE_URL points at the live domain.",
        "",
        "A full run creates ~60 auth users. They land in the same table your",
        "signup and retention numbers are computed from, and they cannot be",
        "told apart from real ones afterwards.",
        "",
        "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY and",
        "E2E_SUPABASE_SERVICE_ROLE_KEY — see docs/E2E-DATABASE.md.",
        "",
      ].join("\n"),
    );
  }
}

let warned = false;

/** One warning per run, not one per spec file. */
function warnIfShared(): void {
  if (warned) return;
  warned = true;

  const { isolated } = e2eCredentials();
  if (isolated) return;

  console.warn(
    [
      "",
      "  ⚠  E2E IS RUNNING AGAINST THE APP'S OWN SUPABASE PROJECT.",
      "     Every test user lands in the same auth.users table as real signups,",
      "     which corrupts signup and retention metrics permanently.",
      "     Fix before spending on ads — see docs/E2E-DATABASE.md.",
      "",
    ].join("\n"),
  );
}

/** The service-role client every spec should use. */
export function adminClient(): SupabaseClient {
  assertNotProduction();
  warnIfShared();

  const { url, serviceKey } = e2eCredentials();
  if (url === "" || serviceKey === "") {
    throw new Error("No Supabase credentials for e2e. See docs/E2E-DATABASE.md.");
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** An anon client, for the RLS suite which must act as a browser would. */
export function anonClient(): SupabaseClient {
  assertNotProduction();
  warnIfShared();

  const { url, anonKey } = e2eCredentials();
  return createClient(url, anonKey);
}
