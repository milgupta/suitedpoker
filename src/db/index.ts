import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env.server";
import * as schema from "./schema";

/**
 * The typed database client.
 *
 * Server-only, and lazily constructed: importing this module must not open a
 * connection, or every build step that merely touches a type would need a live
 * database.
 *
 * This connects as the database owner and therefore BYPASSES Row Level
 * Security. Use it for trusted server work — grading, seeding, webhooks. For
 * anything acting on behalf of a user, go through the Supabase client so RLS
 * applies. Getting this backwards is how a user reads another user's rows.
 */

let client: ReturnType<typeof postgres> | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (database !== null) return database;

  const url = serverEnv().DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local — see the Supabase setup steps in README.md.",
    );
  }

  // prepare:false is required by Supabase's transaction-mode pooler, which
  // does not support prepared statements.
  client = postgres(url, { prepare: false });
  database = drizzle(client, { schema });
  return database;
}

/** Closes the pool. For scripts and tests; a serverless request never needs it. */
export async function closeDb(): Promise<void> {
  await client?.end();
  client = null;
  database = null;
}

export { schema };
