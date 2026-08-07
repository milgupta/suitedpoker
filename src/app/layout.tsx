import { Suspense } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";

/**
 * Inter, self-hosted through next/font rather than through the fontsource CSS
 * import it used to use.
 *
 * The import worked, but it shipped a plain stylesheet — so the browser only
 * discovered the woff2 after parsing CSS and laying out, and the hero heading
 * repainted when it finally arrived. LCP sat at 3.8-4.8s while FCP was 1.2s and
 * the page was visually complete at 1.2s: the whole gap was one late font.
 *
 * next/font emits a <link rel="preload"> for it, so the download starts with
 * the document instead of after it.
 */
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
  preload: true,
  fallback: ["-apple-system", "system-ui", "sans-serif"],
});
import "./globals.css";
import { MotionProvider } from "@/components/motion";
import { PostHogProvider } from "@/components/PostHogProvider";
import { MetaPixel } from "@/components/MetaPixel";

// Every font is self-hosted — Inter via @fontsource-variable, Geist via the
// `geist` package — rather than next/font/google, so builds stay hermetic with
// no network call to fonts.googleapis.com. Inter is the display and body face;
// Inter is the body face and Geist Mono carries every figure. Geist SANS was
// dropped in 8.4: it sat behind Inter in the stack, so it downloaded 68KB on
// every page load and rendered nothing.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://suitedpoker.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  /**
   * The landing page is the brand alone; every other page is the brand and
   * then what the page is. Brand-first on a subpage, rather than the "%s ·
   * SuitedPoker" this used to be, so a truncated tab still says who we are.
   *
   * A page's own `title` is therefore the SHORT form — "Account", not
   * "Account — SuitedPoker", and never with an em dash of its own, or the tab
   * reads "SuitedPoker — Methodology — where the strategy comes from".
   */
  title: {
    default: "SuitedPoker",
    template: "SuitedPoker — %s",
  },
  description:
    "A poker training app for beginners. Practise real spots, see exactly what a solver does, and understand why — explained in plain English.",
  openGraph: {
    title: "SuitedPoker — Learn what a solver would do",
    description:
      "Practise real poker spots, see exactly what a solver does, and understand why. Built for players who are past the rules and stuck on the rest.",
    url: SITE_URL,
    siteName: "SuitedPoker",
    type: "website",
  },
  robots: { index: true, follow: true },
  twitter: {
    card: "summary_large_image",
    title: "SuitedPoker — Learn what a solver would do",
    description: "Practise real poker spots, see exactly what a solver does, and understand why.",
  },
  // "Educational software", stated in the metadata as well as on the page.
  // Meta's ad review reads both, and this is the category boundary that keeps
  // an ad account alive.
  category: "education",
  applicationName: "SuitedPoker",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistMono.variable}`}>
      <body className="bg-canvas text-text-primary antialiased">
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
        <PostHogProvider>
          <MotionProvider>{children}</MotionProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
