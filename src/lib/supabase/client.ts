"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

/**
 * The browser client. Holds the anon key, which is public by design — every
 * protection lives in Row Level Security, not in hiding this value.
 *
 * The service role key must never appear anywhere reachable from here. There is
 * an e2e test that greps the built client bundle for it.
 */
export function createClient() {
  const { url, anonKey } = supabaseConfig();
  return createBrowserClient(url, anonKey);
}
