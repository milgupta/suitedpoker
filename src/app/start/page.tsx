import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { getUser } from "@/lib/supabase/server";
import { StartClient } from "./start-client";

export const metadata: Metadata = {
  title: "Find your leak",
  description: "Two minutes. No poker knowledge needed.",
  robots: { index: false, follow: false },
};

/**
 * Paid-ads entry: quiz first, account second.
 *
 * Organic traffic still uses `/signup` → `/onboarding`. Point Meta ads at
 * `/start` (with UTMs). The homepage CTA stays on `/signup`.
 */
export default async function StartPage() {
  const user = await getUser();
  if (user !== null) redirect("/onboarding");

  return (
    <div className="ambient-host flex min-h-screen flex-col">
      <span
        className="ambient-blob -top-40 left-1/2 -translate-x-1/2 opacity-70"
        aria-hidden="true"
      />

      <header className="px-4 py-6">
        <Link href="/" className="inline-block transition hover:opacity-80">
          <Wordmark />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[30rem] flex-1 px-4 pb-16">
        <StartClient />
      </main>
    </div>
  );
}
