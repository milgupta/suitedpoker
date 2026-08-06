import type { MetadataRoute } from "next";
import { email as palette } from "@/emails/theme";

/**
 * The PWA manifest.
 *
 * `standalone` because the whole product is a one-column mobile app behind a
 * login — a browser chrome bar on the drill screen costs a row of hand at
 * 390x844, which is the viewport everything is designed for.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SuitedPoker",
    short_name: "SuitedPoker",
    description:
      "Poker strategy training for beginners. Practise real spots, see the full strategy, and understand why.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    // From the shared literal palette: a manifest is JSON parsed by the OS,
    // which resolves no CSS variable — the same reason email and next/og read
    // from that module.
    background_color: palette.canvas,
    theme_color: palette.canvas,
    categories: ["education", "games"],
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      // `maskable` so Android crops the mark rather than framing it in a white
      // circle — the icon is inset for exactly this.
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
