/**
 * Path → chrome mode for the entitled product shell.
 *
 * Pure so unit tests can pin the IA without mounting React. The layout reads
 * this once per navigation; immersive routes get a compact bar so a mid-hand
 * player can still reach Practice without a full nav fighting the table.
 */

export type ChromeMode = "full" | "compact" | "hidden";

/**
 * Where login, OAuth callbacks and the logo land.
 *
 * There is no separate Home hub — Practice is the product entry, and the other
 * nav items (Learn, Ranges, Progress) cover everything else a dashboard used to.
 */
export const APP_HOME = "/practice" as const;

const FUNNEL_PREFIXES = ["/onboarding", "/paywall", "/welcome"] as const;

export const APP_NAV = [
  {
    href: "/practice",
    label: "Practice",
    match: "practice",
  },
  { href: "/learn", label: "Learn", match: "prefix" },
  { href: "/ranges", label: "Ranges", match: "exact" },
  { href: "/progress", label: "Progress", match: "exact" },
] as const;

export type AppNavItem = (typeof APP_NAV)[number];

export function chromeMode(pathname: string): ChromeMode {
  if (FUNNEL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "hidden";
  }

  // Mid-session surfaces: keep a way out without the full capsule row.
  if (pathname === "/arena" || pathname.startsWith("/arena/")) return "compact";
  if (pathname === "/daily" || pathname.startsWith("/daily/")) return "compact";
  if (pathname === "/table/play" || pathname.startsWith("/table/play/")) return "compact";
  // /learn/[module]/[lesson] — two segments after learn.
  if (/^\/learn\/[^/]+\/[^/]+/.test(pathname)) return "compact";

  return "full";
}

export function navItemActive(pathname: string, item: AppNavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  if (item.match === "prefix") {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  // Practice covers the hub and every game mode it launches.
  return (
    pathname === "/practice" ||
    pathname.startsWith("/practice/") ||
    pathname === "/arena" ||
    pathname.startsWith("/arena/") ||
    pathname === "/daily" ||
    pathname.startsWith("/daily/") ||
    pathname === "/table" ||
    pathname.startsWith("/table/")
  );
}
