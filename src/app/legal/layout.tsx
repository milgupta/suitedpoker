import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

/**
 * Legal pages carry the full public navigation, not a bare wordmark. Someone
 * who clicked Terms from the paywall or the footer is mid-funnel; a dead-end
 * page with one small link back is where they fall out. The header restores
 * every route (and the signup CTA), and `SiteFooter` carries the DISCLAIMER
 * the compliance e2e asserts on — the old standalone `ComplianceFooter` here
 * duplicated it.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-(--container-marketing) px-6 py-16">
        <div className="text-text-secondary [&_h1]:text-text-primary [&_h2]:text-text-primary [&_strong]:text-text-primary text-body-md [&_h1]:text-display-md [&_h2]:text-heading-md space-y-5 [&_h2]:pt-4">
          {children}
        </div>
        <p className="border-border text-text-tertiary text-caption mt-16 border-t pt-6">
          Questions: support@suitedpoker.com
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
