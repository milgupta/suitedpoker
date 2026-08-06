import "server-only";

import { z } from "zod";
import { parse } from "./env";

/**
 * Server-only environment variables.
 *
 * Split out of env.ts so the client bundle never carries the names of server
 * secrets. `server-only` makes importing this from a client component a build
 * error rather than a code review catch.
 */

const optionalUrl = z.string().url().optional().or(z.literal(""));

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional().or(z.literal("")),
  DATABASE_URL: z.string().min(1).optional().or(z.literal("")),

  STRIPE_SECRET_KEY: z.string().min(1).optional().or(z.literal("")),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional().or(z.literal("")),
  // Server-only on purpose. The client sends a plan id and the server chooses
  // the price — a client that can name its own price can name a cheap one.
  STRIPE_PRICE_MONTHLY: z.string().optional().or(z.literal("")),
  STRIPE_PRICE_ANNUAL: z.string().optional().or(z.literal("")),

  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional().or(z.literal("")),

  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().or(z.literal("")),

  RESEND_API_KEY: z.string().optional().or(z.literal("")),
  META_CAPI_ACCESS_TOKEN: z.string().optional().or(z.literal("")),

  ADMIN_EMAILS: z.string().optional().default(""),

  /** 4.5's circuit breaker. Both optional — the defaults are safe. */
  AI_DAILY_BUDGET_USD: z.string().optional().or(z.literal("")),
  ALERT_WEBHOOK_URL: z.string().optional().or(z.literal("")),
  DEV_BYPASS_ENTITLEMENT: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),
});

let _serverEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Server-only variables. Lazily parsed and cached so importing this module
 * from a client component does not throw — but calling it there will.
 */
export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called on the client. This is a bug — never do this.");
  }
  if (_serverEnv) return _serverEnv;

  const parsed = parse(serverSchema, process.env, "server");

  // The development entitlement bypass must be structurally impossible in
  // production. This is deliberately not a convention — it is enforced here
  // and asserted in tests/unit/env.test.ts.
  if (parsed.NODE_ENV === "production" && parsed.DEV_BYPASS_ENTITLEMENT) {
    parsed.DEV_BYPASS_ENTITLEMENT = false;
  }

  _serverEnv = parsed;
  return _serverEnv;
}

/** Emails allowed into /admin, parsed from the comma-separated env var. */
export function adminEmails(): string[] {
  return serverEnv()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Test-only. Resets the memoised server env so a test can re-parse. */
export function __resetServerEnvForTests() {
  _serverEnv = null;
}
