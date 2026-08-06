import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env.server";
import { supabaseConfig } from "./config";

/**
 * The service-role client. It bypasses RLS entirely.
 *
 * Used for exactly one thing right now — deleting an auth user, which is the
 * only operation the anon client genuinely cannot perform on its own behalf.
 * Every other user-scoped read and write goes through the request-scoped
 * Supabase client so policies apply. Reaching for this because it is easier is
 * how one user ends up reading another's rows.
 */

let cached: SupabaseClient | null = null;

export function isAdminConfigured(): boolean {
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  return key !== undefined && key !== "";
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached !== null) return cached;

  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (key === undefined || key === "") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Call isAdminConfigured() first.");
  }

  cached = createClient(supabaseConfig().url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
