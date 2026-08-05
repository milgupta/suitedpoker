import { clientEnv } from "@/lib/env";

/**
 * Supabase's URL and anon key, or a readable failure.
 *
 * These stay OPTIONAL in env.ts on purpose: the marketing site, the styleguide
 * and the whole build must work without Supabase credentials. But auth cannot,
 * so the check happens here — at the point of use, with a message that says
 * what to do — rather than as a boot-time crash for someone who only wanted to
 * look at the landing page.
 */
export function supabaseConfig(): { url: string; anonKey: string } {
  const url = clientEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url === undefined || url === "" || anonKey === undefined || anonKey === "") {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local — see Database setup in README.md.",
    );
  }

  return { url, anonKey };
}

/** Whether auth can work at all. Lets a page degrade instead of throwing. */
export function isSupabaseConfigured(): boolean {
  try {
    supabaseConfig();
    return true;
  } catch {
    return false;
  }
}
