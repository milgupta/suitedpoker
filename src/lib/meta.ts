/**
 * Meta attribution, the pure half.
 *
 * WHY BOTH A PIXEL AND A SERVER-SIDE API. iOS App Tracking Transparency and
 * adblockers destroy client-side pixel coverage, and the audience most likely
 * to try a poker tool is unusually likely to run one. Server-side CAPI recovers
 * those conversions. Sending both with a SHARED event id lets Meta deduplicate
 * them into one — get that wrong and every conversion counts twice, which
 * halves your reported cost per acquisition and mis-trains the optimiser on
 * data that never happened.
 *
 * Nothing here does I/O, so the hashing and the payload shape can be checked
 * without a network.
 */

export type MetaEventName = "PageView" | "ViewContent" | "InitiateCheckout" | "Lead" | "Purchase";

/** The events we send from BOTH sides and therefore must deduplicate. */
export const DEDUPLICATED_EVENTS: readonly MetaEventName[] = [
  "InitiateCheckout",
  "Lead",
  "Purchase",
];

export interface Attribution {
  readonly fbclid: string | null;
  readonly fbp: string | null;
  readonly fbc: string | null;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly utmContent: string | null;
  readonly utmTerm: string | null;
}

export const EMPTY_ATTRIBUTION: Attribution = {
  fbclid: null,
  fbp: null,
  fbc: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
};

/** How long a first-touch attribution cookie survives. */
export const ATTRIBUTION_COOKIE = "sp_attr";
export const ATTRIBUTION_MAX_AGE_DAYS = 30;

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/**
 * Meta's `fbc` format, built from a click id when the cookie is missing.
 *
 * `fb.1.<timestamp_ms>.<fbclid>`. Meta's own pixel writes this cookie, but an
 * adblocker stops it while the `?fbclid=` in the URL still arrives — so
 * reconstructing it is what keeps match quality up for exactly the users the
 * pixel already failed to see.
 */
export function fbcFromClickId(fbclid: string, nowMs: number): string {
  return `fb.1.${nowMs}.${fbclid}`;
}

/** Reads attribution out of a landing URL's query string. */
export function attributionFromQuery(params: URLSearchParams, nowMs: number): Partial<Attribution> {
  // Mutable while building; the readonly Attribution is what callers see.
  const found: Record<string, string> = {};

  const fbclid = params.get("fbclid");
  if (fbclid !== null && fbclid !== "") {
    found.fbclid = fbclid;
    found.fbc = fbcFromClickId(fbclid, nowMs);
  }

  const utm: Record<string, keyof Attribution> = {
    utm_source: "utmSource",
    utm_medium: "utmMedium",
    utm_campaign: "utmCampaign",
    utm_content: "utmContent",
    utm_term: "utmTerm",
  };

  for (const [param, field] of Object.entries(utm)) {
    const value = params.get(param);
    // Capped: these land in a cookie and then in a database column, and an
    // unbounded query parameter is an unbounded write.
    if (value !== null && value !== "") found[field] = value.slice(0, 200);
  }

  return found as Partial<Attribution>;
}

/**
 * FIRST touch wins.
 *
 * A user who arrives from an ad, leaves, and comes back through a Google search
 * a week later was acquired by the ad. Letting the later visit overwrite the
 * earlier one credits the channel that closed rather than the one that paid,
 * and the ad account then optimises against its own success.
 */
export function mergeAttribution(
  existing: Attribution,
  incoming: Partial<Attribution>,
): Attribution {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming) as [keyof Attribution, string | null][]) {
    if (value == null || value === "") continue;
    if (merged[key] != null && merged[key] !== "") continue;
    (merged as Record<string, string | null>)[key] = value;
  }
  return merged;
}

/**
 * Meta's normalisation, applied before hashing: lowercase and trim.
 *
 * A hash of "  Alice@Example.com " matches nothing. This is the single most
 * common reason a CAPI integration reports poor match quality while looking
 * perfectly healthy.
 */
export function normaliseForHash(value: string): string {
  return value.trim().toLowerCase();
}

export interface UserData {
  /** SHA-256 of the normalised email. */
  em?: string[];
  fbp?: string;
  fbc?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

export interface MetaEvent {
  event_name: MetaEventName;
  /** Unix SECONDS. Milliseconds are silently rejected by Meta. */
  event_time: number;
  /** The dedup key. The pixel and CAPI must send the same one. */
  event_id: string;
  event_source_url?: string;
  action_source: "website" | "system_generated";
  user_data: UserData;
  custom_data?: Record<string, string | number>;
}

/**
 * The deterministic event id for a purchase.
 *
 * Derived from the Stripe event id rather than generated, so the webhook can be
 * retried without minting a second id and reporting a second sale. The pixel's
 * side of the pair comes through Stripe metadata from checkout.
 */
export function purchaseEventId(stripeEventId: string): string {
  return `purchase_${stripeEventId}`;
}

export function isValidEventTime(seconds: number, nowMs: number): boolean {
  // Meta rejects anything older than 7 days or in the future.
  const now = Math.floor(nowMs / 1000);
  return seconds <= now + 60 && seconds >= now - 7 * 24 * 60 * 60;
}

/** Which fields a Purchase must carry for match quality to be usable. */
export const REQUIRED_PURCHASE_FIELDS = [
  "event_name",
  "event_time",
  "event_id",
  "user_data",
] as const;
