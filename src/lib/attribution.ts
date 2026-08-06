import {
  attributionFromQuery,
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_DAYS,
  EMPTY_ATTRIBUTION,
  mergeAttribution,
  type Attribution,
} from "@/lib/meta";

/**
 * Reading and writing the attribution cookie.
 *
 * Edge-safe on purpose — the cookie is written by the proxy, which runs on the
 * very first request, because that is the only moment `?fbclid=` and the UTMs
 * are visible. By the time someone reaches /signup, several navigations later,
 * the query string is long gone and the attribution with it.
 */

export function parseAttributionCookie(raw: string | undefined): Attribution {
  if (raw === undefined || raw === "") return EMPTY_ATTRIBUTION;
  try {
    // Tolerant of both forms. Next decodes `request.cookies.get()` for us, but
    // a value read straight off `document.cookie` or out of a Playwright
    // context is still percent-encoded — and double-decoding a decoded value
    // is what made the first version of this throw on every request.
    const text = raw.trimStart().startsWith("{") ? raw : decodeURIComponent(raw);
    const parsed = JSON.parse(text) as Partial<Attribution>;
    return mergeAttribution(EMPTY_ATTRIBUTION, parsed);
  } catch {
    // A malformed cookie is no attribution, never an error — a broken cookie
    // must not stop someone signing up.
    return EMPTY_ATTRIBUTION;
  }
}

export function serialiseAttributionCookie(attribution: Attribution): string {
  // Only the fields that have values, so the cookie stays small.
  const compact: Record<string, string> = {};
  for (const [key, value] of Object.entries(attribution)) {
    if (typeof value === "string" && value !== "") compact[key] = value;
  }
  // Plain JSON. The cookie layer does its own percent-encoding, and encoding
  // here too produces a double-encoded value that survives one decode and then
  // fails to parse.
  return JSON.stringify(compact);
}

export function hasAttribution(attribution: Attribution): boolean {
  return Object.values(attribution).some((value) => typeof value === "string" && value !== "");
}

/**
 * The cookie for this request, first touch preserved.
 *
 * Returns null when nothing changed, so the proxy can skip a Set-Cookie on the
 * overwhelming majority of requests.
 */
export function nextAttributionCookie(
  currentRaw: string | undefined,
  url: URL,
  cookies: { fbp?: string; fbc?: string },
  nowMs: number,
): string | null {
  const existing = parseAttributionCookie(currentRaw);

  // Meta's own pixel writes _fbp and _fbc. Reading them here picks them up for
  // users whose pixel DID run, and the reconstructed fbc covers the rest.
  const incoming: Partial<Attribution> = {
    ...attributionFromQuery(url.searchParams, nowMs),
    ...(cookies.fbp !== undefined && cookies.fbp !== "" ? { fbp: cookies.fbp } : {}),
    ...(cookies.fbc !== undefined && cookies.fbc !== "" ? { fbc: cookies.fbc } : {}),
  };

  const merged = mergeAttribution(existing, incoming);

  // FIRST touch wins, so an unchanged value means nothing to write.
  const changed = (Object.keys(merged) as (keyof Attribution)[]).some(
    (key) => merged[key] !== existing[key],
  );
  if (!changed) return null;
  if (!hasAttribution(merged)) return null;

  return serialiseAttributionCookie(merged);
}

export const ATTRIBUTION_COOKIE_OPTIONS = {
  maxAge: ATTRIBUTION_MAX_AGE_DAYS * 24 * 60 * 60,
  path: "/",
  sameSite: "lax" as const,
  // Readable by the client pixel code, which needs fbp/fbc to send the same
  // values the server will. Nothing in it is a credential.
  httpOnly: false,
};

export { ATTRIBUTION_COOKIE };
export type { Attribution };
