import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The styleguide is internal tooling: the full token set, a motion lab, and a
 * deliberate crash button. robots:noindex kept it out of Google and nothing
 * else — any subscriber or competitor who guessed the URL got the whole
 * design system. One layout gates all three routes (/styleguide, /table,
 * /history); in a production build they are a 404, not a secret.
 */
export default function StyleguideLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
