import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { DISCLAIMER } from "@/lib/compliance";

/**
 * The public footer.
 *
 * It carries `DISCLAIMER` itself rather than sitting next to `ComplianceFooter`
 * — one line, one place. Every public surface that uses this footer is covered
 * by definition, which is the failure mode 9.6 hit when the disclaimer lived in
 * the root layout, moved out, and /methodology was missed for a while.
 */
const COLUMNS: readonly { heading: string; links: readonly { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/#how" },
      { label: "Pricing", href: "/pricing" },
      // /methodology is deliberately UNLINKED from the public site. It still
      // exists, still renders and is still in the sitemap for crawlers — it is
      // a long read that was pulling people out of the funnel. The landing
      // page keeps the short provenance statement, which is the part that has
      // to be visible.
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Create an account", href: "/signup" },
      { label: "Log in", href: "/login" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "/legal/terms" },
      { label: "Privacy", href: "/legal/privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto max-w-(--container-app) px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="text-text-secondary text-body-md mt-3 max-w-xs">
              Poker training that explains itself, for players who are past the rules and stuck on
              the rest.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-text-tertiary text-overline font-mono uppercase">
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-text-secondary hover:text-text-primary text-body-md inline-flex min-h-11 items-center transition"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-border mt-12 border-t pt-8">
          <p className="text-text-tertiary text-caption max-w-3xl">{DISCLAIMER}</p>
          <p className="text-text-tertiary text-caption mt-4">
            Support:{" "}
            <a
              href="mailto:support@suitedpoker.com"
              className="hover:text-text-secondary transition"
            >
              support@suitedpoker.com
            </a>{" "}
            · © {new Date().getFullYear()} SuitedPoker
          </p>
        </div>
      </div>
    </footer>
  );
}
