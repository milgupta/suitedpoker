import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Fonts are self-hosted via the `geist` package rather than next/font/google so
// builds stay hermetic — no network call to fonts.googleapis.com at build time.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://suitedpoker.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SuitedPoker — Learn what a solver would do",
    template: "%s · SuitedPoker",
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
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-canvas text-text-primary antialiased">{children}</body>
    </html>
  );
}
