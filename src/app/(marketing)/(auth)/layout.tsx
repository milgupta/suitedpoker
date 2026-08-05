import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The auth shell. Ambient glow is allowed here — DESIGN.md permits it on
 * marketing and onboarding surfaces, and this is the last marketing screen
 * before the product.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ambient-host flex min-h-screen flex-col">
      <span
        className="ambient-blob -top-40 left-1/2 -translate-x-1/2 opacity-70"
        aria-hidden="true"
      />

      <header className="px-4 py-6">
        <Link
          href="/"
          className="text-accent-bright text-body-md font-mono font-bold tracking-widest"
        >
          SUITEDPOKER
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
