/**
 * The email palette, copied deliberately.
 *
 * Email clients do not read stylesheets, cannot resolve CSS variables, and
 * Gmail strips `:root`. So the tokens from globals.css are duplicated here as
 * literals — the ONE place in the codebase where a colour literal is correct,
 * and `tests/unit/emails.test.ts` asserts every value still matches its token
 * so the duplication cannot drift.
 *
 * DARK MODE IS NOT OPTIONAL HERE. A dark email in a light client is fine; a
 * light email with light text is unreadable. Every background is set explicitly
 * on the element rather than inherited, because Gmail's dark mode inverts some
 * colours and not others, and an unset background is what it inverts.
 */

export const email = {
  canvas: "#07060d",
  surface: "#0e0d16",
  border: "rgba(255, 255, 255, 0.09)",
  textPrimary: "#f4f5f8",
  // Solid rather than the token's rgba(): Outlook does not support alpha
  // channels in colour values and renders them black on black.
  textSecondary: "#b6b8c2",
  textTertiary: "#84868f",
  accent: "#2f68ff",
  accentBright: "#5b8cff",
  danger: "#ef4b4b",
  /** The label on an accent fill. --color-on-accent in globals.css. */
  onAccent: "#ffffff",
} as const;

export const font =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';

export const type = {
  display: { fontSize: "28px", lineHeight: "34px", fontWeight: 600, letterSpacing: "-0.02em" },
  heading: { fontSize: "18px", lineHeight: "24px", fontWeight: 600 },
  body: { fontSize: "16px", lineHeight: "26px", fontWeight: 400 },
  small: { fontSize: "13px", lineHeight: "20px", fontWeight: 400 },
} as const;

export const SUPPORT_EMAIL = "help@suitedpoker.com";
export const FROM_ADDRESS = "SuitedPoker <hello@suitedpoker.com>";
/** Replies go to a human, not to a no-reply void. */
export const REPLY_TO = SUPPORT_EMAIL;

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return typeof configured === "string" && configured !== ""
    ? configured.replace(/\/$/, "")
    : "https://suitedpoker.com";
}

/** Every link in every email goes through here, so none can be relative. */
export function link(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
