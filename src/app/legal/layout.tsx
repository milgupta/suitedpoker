import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="text-accent font-mono text-sm font-bold tracking-widest transition hover:opacity-80"
      >
        SUITEDPOKER
      </Link>
      <div className="text-text-secondary [&_h1]:text-text-primary [&_h2]:text-text-primary [&_strong]:text-text-primary mt-12 space-y-5 text-sm leading-relaxed [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold">
        {children}
      </div>
      <p className="border-border text-text-tertiary mt-16 border-t pt-6 text-xs">
        Questions: support@suitedpoker.com
      </p>
    </div>
  );
}
