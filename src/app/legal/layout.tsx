import Link from "next/link";
import { ComplianceFooter } from "@/components/ComplianceFooter";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-(--container-marketing) px-6 py-16">
      <Link
        href="/"
        className="text-accent-bright text-body-md font-mono font-bold tracking-widest transition hover:opacity-80"
      >
        SUITEDPOKER
      </Link>
      <div className="text-text-secondary [&_h1]:text-text-primary [&_h2]:text-text-primary [&_strong]:text-text-primary text-body-md [&_h1]:text-display-md [&_h2]:text-heading-md mt-12 space-y-5 [&_h2]:pt-4">
        {children}
      </div>
      <p className="border-border text-text-tertiary text-caption mt-16 border-t pt-6">
        Questions: support@suitedpoker.com
      </p>
      <ComplianceFooter className="mt-2" />
    </div>
  );
}
