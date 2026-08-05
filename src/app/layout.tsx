import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Fonts are self-hosted via the `geist` package rather than next/font/google.
// That keeps builds hermetic — no network call to fonts.googleapis.com at build
// time, which matters in CI and in sandboxed environments. Substage 0.2 sets the
// full type scale on top of these.
export const metadata: Metadata = {
  title: "SuitedPoker",
  description: "A GTO poker trainer for beginners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
