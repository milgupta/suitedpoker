import { z } from "zod";

/**
 * Environment validation.
 *
 * Split into server and client schemas so a server-only secret can never
 * be read from client code by accident. Both are validated at module load,
 * so a missing or malformed variable fails at boot with a readable message
 * instead of surfacing as `undefined` deep inside a request handler.
 */

const optionalUrl = z.string().url().optional().or(z.literal(""));

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional().or(z.literal("")),
  DATABASE_URL: z.string().min(1).optional().or(z.literal("")),

  STRIPE_SECRET_KEY: z.string().min(1).optional().or(z.literal("")),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional().or(z.literal("")),

  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional().or(z.literal("")),

  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().or(z.literal("")),

  RESEND_API_KEY: z.string().optional().or(z.literal("")),
  META_CAPI_ACCESS_TOKEN: z.string().optional().or(z.literal("")),

  ADMIN_EMAILS: z.string().optional().default(""),
  DEV_BYPASS_ENTITLEMENT: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_STRIPE_PRICE_YEARLY: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional().default("https://us.i.posthog.com"),
  NEXT_PUBLIC_META_PIXEL_ID: z.string().optional().or(z.literal("")),
});

function parse<T extends z.ZodTypeAny>(schema: T, source: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid ${label} environment variables:\n${issues}\n`);
  }
  return result.data;
}

/**
 * Client-safe variables. Referenced literally so Next.js can inline them
 * at build time — do NOT rewrite this as a loop over process.env.
 */
export const clientEnv = parse(
  clientSchema,
  {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
    NEXT_PUBLIC_STRIPE_PRICE_YEARLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  },
  "client",
);

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
