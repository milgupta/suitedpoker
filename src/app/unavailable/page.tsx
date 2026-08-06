import type { Metadata } from "next";
import { BLOCKED_PAGE, DISCLAIMER } from "@/lib/compliance";

export const metadata: Metadata = {
  title: "Not available in your region",
  robots: { index: false, follow: false },
};

/**
 * The page a blocked visitor sees.
 *
 * An explanation, not an error. Someone here has done nothing wrong, is quite
 * possibly on a VPN or a mislocated IP, and the difference between a polite
 * page with a working email address and a 403 is whether they come back.
 */
export default function UnavailablePage() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-(--container-marketing) flex-col justify-center px-6 py-16">
      <h1 className="text-display-md">{BLOCKED_PAGE.heading}</h1>
      <p className="text-text-secondary text-body-lg mt-6">{BLOCKED_PAGE.body}</p>
      <p className="text-text-secondary text-body-md mt-6">
        {BLOCKED_PAGE.footer.split("help@suitedpoker.com")[0]}
        <a href="mailto:help@suitedpoker.com" className="text-accent-bright underline">
          help@suitedpoker.com
        </a>
        {BLOCKED_PAGE.footer.split("help@suitedpoker.com")[1]}
      </p>
      <p className="text-text-tertiary text-body-sm mt-12">{DISCLAIMER}</p>
    </main>
  );
}
