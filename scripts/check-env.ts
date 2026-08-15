/**
 * Checks that every environment variable the code reads is present and the
 * right SHAPE, for both the local file and the Vercel production environment.
 *
 * `env.ts` and `env.server.ts` make nearly everything optional, deliberately —
 * that is what lets CI and a fresh clone boot. The cost is that a typo'd name
 * or a test key in the wrong place is silent until a customer finds it. The
 * build gate in `env-required.ts` catches ten of them at deploy time; this
 * catches the rest, and it catches them before the push rather than after.
 *
 * The two environments are NOT the same, and that is the point:
 *
 *   local       Stripe TEST mode. `checkout.spec.ts` refuses to run on a live
 *               key, and `npm run test:stripe` creates real customers.
 *   production  Stripe LIVE mode, and the real site URL.
 *
 * So a value that is correct locally can be exactly wrong in Vercel. Each rule
 * below states which environment it applies to.
 *
 *   npm run check:env            check .env.local
 *   npm run check:env -- --prod  check the same file AS IF it were production
 */

import { loadLocalEnv } from "../tests/support/load-local-env";

loadLocalEnv();

const PROD = process.argv.includes("--prod");

type Scope = "both" | "local" | "prod";

interface Rule {
  readonly name: string;
  /** Absent or empty fails. Optional vars only get shape-checked. */
  readonly required: Scope | "never";
  /** Returns an error string, or null when the value is acceptable. */
  readonly shape?: (value: string) => string | null;
  /** Only applied when checking this environment. */
  readonly shapeScope?: Scope;
  readonly note?: string;
}

const startsWith =
  (prefix: string) =>
  (v: string): string | null =>
    v.startsWith(prefix) ? null : `expected it to start with "${prefix}"`;

function httpsUrl(v: string): string | null {
  if (!/^https?:\/\//.test(v)) return "expected an http(s) URL";
  if (v.endsWith("/")) return "has a TRAILING SLASH — every email link doubles it";
  return null;
}

function liveSiteUrl(v: string): string | null {
  const base = httpsUrl(v);
  if (base !== null) return base;
  if (v.includes("localhost") || v.includes("127.0.0.1")) {
    return "points at localhost — every email link and Stripe redirect goes nowhere";
  }
  if (!v.startsWith("https://")) return "must be https in production";
  return null;
}

function stripeSecret(v: string): string | null {
  if (v.startsWith("rk_")) {
    return "is a RESTRICTED key (rk_) — it passes the build gate and then fails at checkout";
  }
  if (PROD) return v.startsWith("sk_live_") ? null : 'must be "sk_live_…" in production';
  return v.startsWith("sk_test_") ? null : 'must be "sk_test_…" locally — see the header';
}

function stripePublishable(v: string): string | null {
  if (PROD) return v.startsWith("pk_live_") ? null : 'must be "pk_live_…" in production';
  return v.startsWith("pk_test_") ? null : 'must be "pk_test_…" locally';
}

function notTrue(v: string): string | null {
  return v.trim().replace(/^"|"$/g, "") === "true"
    ? "is true — the paywall would be open to everyone"
    : null;
}

function looksLikeEmail(v: string): string | null {
  return v.includes("@") ? null : "should be one or more email addresses";
}

/**
 * The LIVE price ids, pinned.
 *
 * Shape alone cannot catch this: a test-mode price id and a live one both read
 * `price_…`, so a copied `.env.local` sails through every check and then sells
 * a $24.99 subscription against a price that does not exist in live mode.
 * Price ids are not interchangeable between modes — that is the single most
 * repeated warning in `docs/STRIPE-SETUP.md`.
 *
 * Update these if the prices are ever recreated.
 */
const LIVE_PRICE_MONTHLY = "price_1U4F9PLmVAUdxDexeIV7EmBU";
const LIVE_PRICE_ANNUAL = "price_1U1Z5uLmVAUdxDexKlALo6Ol";

const livePrice =
  (expected: string) =>
  (v: string): string | null => {
    if (!v.startsWith("price_")) return 'expected it to start with "price_"';
    if (!PROD) return null;
    return v === expected ? null : `is not the LIVE price id — production needs ${expected}`;
  };

const RULES: readonly Rule[] = [
  // ── Site ──
  {
    name: "NEXT_PUBLIC_SITE_URL",
    required: "both",
    shape: (v) => (PROD ? liveSiteUrl(v) : httpsUrl(v)),
  },

  // ── Supabase ──
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: "both", shape: httpsUrl },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: "both", shape: startsWith("eyJ") },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: "both", shape: startsWith("eyJ") },
  { name: "DATABASE_URL", required: "both", shape: startsWith("postgres") },

  // ── Stripe ──
  { name: "STRIPE_SECRET_KEY", required: "both", shape: stripeSecret },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", required: "never", shape: stripePublishable },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: "both",
    shape: startsWith("whsec_"),
    note: "locally this is the one `stripe listen` prints, NOT the dashboard's",
  },
  { name: "STRIPE_PRICE_MONTHLY", required: "both", shape: livePrice(LIVE_PRICE_MONTHLY) },
  { name: "STRIPE_PRICE_ANNUAL", required: "both", shape: livePrice(LIVE_PRICE_ANNUAL) },

  // ── Infrastructure ──
  {
    name: "CRON_SECRET",
    required: "both",
    shape: (v) => (v.length >= 32 ? null : "is short — use `openssl rand -hex 32`"),
  },
  { name: "UPSTASH_REDIS_REST_URL", required: "prod", shape: httpsUrl },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    required: "prod",
    note: "absent locally is fine — redis.ts falls back to memory. On Vercel it breaks every drill",
  },

  // ── Services ──
  { name: "GOOGLE_GENERATIVE_AI_API_KEY", required: "never", note: "absent → template coach" },
  { name: "RESEND_API_KEY", required: "prod", shape: startsWith("re_") },
  { name: "NEXT_PUBLIC_POSTHOG_KEY", required: "prod", shape: startsWith("phc_") },
  { name: "NEXT_PUBLIC_POSTHOG_HOST", required: "never", shape: httpsUrl },
  { name: "NEXT_PUBLIC_META_PIXEL_ID", required: "never", note: "add after the Meta account" },
  { name: "META_CAPI_ACCESS_TOKEN", required: "never", note: "add after the Meta account" },
  { name: "ADMIN_EMAILS", required: "prod", shape: looksLikeEmail },

  // ── Must not be set wrong ──
  { name: "DEV_BYPASS_ENTITLEMENT", required: "never", shape: notTrue },
  {
    name: "META_TEST_EVENT_CODE",
    required: "never",
    shape: () =>
      PROD ? "must NOT be set in production — every conversion goes to the test panel" : null,
  },
  { name: "AI_DAILY_BUDGET_USD", required: "never", note: "optional, defaults to 25" },
  { name: "ALERT_WEBHOOK_URL", required: "never", note: "optional, budget breaker alerts" },
];

function appliesTo(scope: Scope, prod: boolean): boolean {
  return scope === "both" || (prod ? scope === "prod" : scope === "local");
}

const errors: string[] = [];
const warnings: string[] = [];
const ok: string[] = [];

for (const rule of RULES) {
  const raw = process.env[rule.name];
  const value = (raw ?? "").trim().replace(/^"(.*)"$/, "$1");
  const isRequired = rule.required !== "never" && appliesTo(rule.required, PROD);

  if (value === "") {
    if (isRequired) {
      errors.push(`${rule.name.padEnd(36)} MISSING${rule.note ? ` — ${rule.note}` : ""}`);
    } else {
      warnings.push(`${rule.name.padEnd(36)} unset${rule.note ? ` — ${rule.note}` : ""}`);
    }
    continue;
  }

  const shapeApplies = rule.shapeScope === undefined || appliesTo(rule.shapeScope, PROD);
  const problem = shapeApplies && rule.shape ? rule.shape(value) : null;

  if (problem !== null) {
    errors.push(`${rule.name.padEnd(36)} ${problem}`);
  } else {
    ok.push(`${rule.name.padEnd(36)} ok${rule.note ? ` — ${rule.note}` : ""}`);
  }
}

const label = PROD ? "PRODUCTION" : "LOCAL";
console.log(`\n  Checking .env.local against the ${label} ruleset\n`);

for (const line of ok) console.log(`  [32m✓[0m ${line}`);
for (const line of warnings) console.log(`  [33m·[0m ${line}`);
for (const line of errors) console.log(`  [31m✗[0m ${line}`);

console.log(
  `\n  ${ok.length} ok · ${warnings.length} unset (allowed) · ${errors.length} problem(s)\n`,
);

if (errors.length > 0) {
  console.error(`  ${label} environment is NOT correct.\n`);
  process.exit(1);
}
console.log(`  ${label} environment is correct.\n`);
