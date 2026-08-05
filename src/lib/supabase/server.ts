import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

/**
 * The server client, for RSCs and route handlers.
 *
 * Uses the ANON key and the user's cookies, so RLS applies exactly as it does
 * in the browser. For trusted server work that must bypass RLS, use `getDb()`
 * from src/db — and be deliberate about which one you are reaching for.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const { url, anonKey } = supabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Harmless: middleware refreshes the session on every request, so the
          // write this would have made has already happened there.
        }
      },
    },
  });
}

/** The signed-in user, or null. Never throws. */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
