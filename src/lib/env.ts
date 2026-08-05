import { z } from "zod";

/**
 * Client-safe environment variables.
 *
 * The SERVER schema deliberately does not live here. This module is imported by
 * client components, so anything in it ships to the browser — and a zod schema
 * listing every server secret's NAME is a map of what to go looking for. The
 * server half is in env.server.ts, behind `server-only`.
 */

const optionalUrl = z.string().url().optional().or(z.literal(""));

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

export function parse<T extends z.ZodTypeAny>(
  schema: T,
  source: unknown,
  label: string,
): z.infer<T> {
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
