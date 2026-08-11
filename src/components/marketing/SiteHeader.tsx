import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { HERO, NAV } from "@/content/landing";

/**
 * The public header, shared by every marketing surface.
 *
 * It was a wordmark and a single "Pricing" link, which is what a one-page site
 * looks like. Both of the products this competes with lead with a real product
 * nav, and the reason is not decoration: a visitor who can see that there is a
 * methodology page and a separate pricing page reads the site as a product
 * rather than a funnel.
 *
 * NO hamburger. Four links do not earn a menu, a menu is a client component,
 * and this header sits above the LCP on the one page every ad click pays for.
 * Below `sm` the links collapse and the two actions remain, which is the whole
 * job on a phone.
 */
export function SiteHeader({ cta = HERO.cta }: { cta?: string }) {
  return (
    <header className="border-border/70 bg-canvas/80 glass-blur sticky top-0 z-50 border-b">
      <div className="mx-auto flex h-16 max-w-(--container-app) items-center gap-6 px-4 sm:px-6">
        {/* min-h-11: the wordmark is 30px tall and this is a real control, so
            without it the one link every visitor aims at first misses the 44px
            rule. */}
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center"
          aria-label="SuitedPoker home"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-6 md:flex">
          {NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-text-secondary hover:text-text-primary text-body-md transition"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href="/login"
            className="text-text-secondary hover:text-text-primary text-body-md hidden min-h-11 items-center px-3 transition sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            data-cta="header"
            className="border-border text-text-primary hover:border-text-tertiary text-body-md inline-flex min-h-11 items-center rounded-full border px-4 font-medium transition"
          >
            {cta}
          </Link>
        </div>
      </div>
    </header>
  );
}
