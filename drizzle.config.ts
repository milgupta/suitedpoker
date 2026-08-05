import { defineConfig } from "drizzle-kit";

/**
 * Migrations are written to supabase/migrations so the Supabase CLI and
 * drizzle-kit share one history — two migration folders is how a schema ends up
 * applied in one environment and not another.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // auth.* belongs to Supabase. Without this, drizzle-kit sees the whole auth
  // schema as "extra" and generates migrations that would drop it.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
