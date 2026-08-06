/**
 * What must be set to run this in production, and what must not.
 *
 * Every variable is OPTIONAL in the schemas so the app boots with an empty
 * `.env.local` — that is deliberate and it is what makes CI and a fresh clone
 * work. But "boots" is not "ready to take money": a production deploy missing
 * `STRIPE_WEBHOOK_SECRET` accepts payments and never grants access, and nothing
 * would surface that until a customer emailed.
 *
 * So this list is checked at BUILD time for a production deploy only. Pure and
 * dependency-free, so `next.config.ts` can call it before anything else loads.
 */

export interface RequiredVar {
  readonly name: string;
  /** What breaks without it — the message someone reads at 2am. */
  readonly because: string;
}

export const REQUIRED_IN_PRODUCTION: readonly RequiredVar[] = [
  { name: "DATABASE_URL", because: "nothing reads or writes without it" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", because: "nobody can log in" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", because: "nobody can log in" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", because: "account deletion and admin paths fail" },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    because: "every email link and Stripe redirect points at nothing",
  },
  { name: "STRIPE_SECRET_KEY", because: "checkout cannot be created" },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    because: "payments succeed and access is NEVER granted — silently",
  },
  { name: "STRIPE_PRICE_MONTHLY", because: "the monthly plan cannot be purchased" },
  { name: "STRIPE_PRICE_ANNUAL", because: "the annual plan cannot be purchased" },
  { name: "CRON_SECRET", because: "the daily challenge and the dunning cron fail closed" },
];

/**
 * Values that must NOT appear in production, whatever else is set.
 *
 * A test-mode Stripe key in production takes no money at all while looking
 * completely healthy — every checkout succeeds and nothing is charged.
 */
export interface ForbiddenValue {
  readonly name: string;
  readonly pattern: RegExp;
  readonly because: string;
}

export const FORBIDDEN_IN_PRODUCTION: readonly ForbiddenValue[] = [
  {
    name: "STRIPE_SECRET_KEY",
    pattern: /^sk_test_/,
    because: "a test key takes no money while every checkout appears to succeed",
  },
  {
    name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    pattern: /^pk_test_/,
    because: "a test key takes no money while every checkout appears to succeed",
  },
  {
    name: "META_TEST_EVENT_CODE",
    pattern: /.+/,
    because: "every conversion is routed to Meta's test panel and none is reported",
  },
  {
    name: "DEV_BYPASS_ENTITLEMENT",
    pattern: /^true$/,
    because: "the paywall is open to everyone",
  },
];

export interface EnvProblem {
  readonly name: string;
  readonly problem: "missing" | "forbidden";
  readonly because: string;
}

/** Returns every problem, so one build surfaces all of them rather than the first. */
export function productionEnvProblems(env: Record<string, string | undefined>): EnvProblem[] {
  const problems: EnvProblem[] = [];

  for (const { name, because } of REQUIRED_IN_PRODUCTION) {
    const value = env[name];
    if (value === undefined || value.trim() === "") {
      problems.push({ name, problem: "missing", because });
    }
  }

  for (const { name, pattern, because } of FORBIDDEN_IN_PRODUCTION) {
    const value = env[name];
    if (value !== undefined && value.trim() !== "" && pattern.test(value.trim())) {
      problems.push({ name, problem: "forbidden", because });
    }
  }

  return problems;
}

/** True only for a real production deploy, never for a preview or a local build. */
export function isProductionDeploy(env: Record<string, string | undefined>): boolean {
  // VERCEL_ENV distinguishes production from preview; NODE_ENV does not — a
  // preview build is also NODE_ENV=production, and failing those would block
  // every branch deploy.
  if (env.VERCEL_ENV !== undefined) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production" && env.CI === "true";
}

export function formatProblems(problems: readonly EnvProblem[]): string {
  const lines = problems.map(
    (p) =>
      `  ${p.problem === "missing" ? "MISSING " : "FORBIDDEN"} ${p.name.padEnd(38)} ${p.because}`,
  );
  return [
    "",
    "═".repeat(78),
    "  PRODUCTION BUILD REFUSED — the environment is not ready to take money.",
    "═".repeat(78),
    ...lines,
    "",
    "  Set these in the Vercel project's Production environment and redeploy.",
    "═".repeat(78),
    "",
  ].join("\n");
}
