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

/* ── which environments may reach the live dataset ───────────────────────── */

/**
 * Where an event actually goes.
 *
 * There is ONE dataset. Every event a developer's laptop or a preview deploy
 * fires lands in the same reporting the ad account optimises against — and it
 * cannot be deleted, only diluted. A localhost Purchase teaches the optimiser
 * that a person who never paid was worth bidding for.
 *
 * - `send` — the live dataset. Production only.
 * - `test` — Meta's Test Events panel, via `test_event_code`. Reaches Meta and
 *   is visible in Events Manager, but Meta excludes it from reporting and from
 *   optimisation, so it cannot dilute anything.
 * - `log`  — a console line and nothing else. The default everywhere but
 *   production.
 */
export type MetaDelivery = "send" | "test" | "log";

/**
 * FAILS CLOSED: anything that is not a production Vercel deploy stays off the
 * live dataset.
 *
 * `VERCEL_ENV`, never `NODE_ENV` — a preview build is also `NODE_ENV=production`
 * and would pass a NODE_ENV check while pointing at the live dataset. Absent
 * altogether (a laptop, CI, any non-Vercel host) means log, because the cost of
 * being wrong in that direction is a missing dev log line and the cost of being
 * wrong in the other is permanent.
 *
 * `META_TEST_EVENT_CODE` is the deliberate opt-out of the console, and ONLY
 * outside production. Setting it is an explicit statement that you want to watch
 * events land in Events Manager rather than read them in a terminal; without
 * this branch the gate would swallow the variable and it would look broken.
 * It cannot leak the other way — `FORBIDDEN_IN_PRODUCTION` in env-required.ts
 * refuses a production build that has it set, and production resolves to `send`
 * here regardless, so the code is never attached to a real conversion.
 */
export function metaDelivery(
  vercelEnv: string | null | undefined,
  testEventCode?: string | null,
): MetaDelivery {
  if (vercelEnv === "production") return "send";
  if (typeof testEventCode === "string" && testEventCode.trim() !== "") return "test";
  return "log";
}

/**
 * What a suppressed event prints.
 *
 * Deliberately one greppable line carrying the dedup id and the match-quality
 * fields, because "did my event fire, and did it carry an fbc" is the entire
 * question this exists to answer. The email is already a SHA-256 by the time it
 * reaches here and is truncated anyway — a log line is not a place to widen the
 * blast radius of a leaked file.
 */
export function formatSuppressedEvent(
  event: MetaEvent,
  vercelEnv: string | null | undefined,
): string {
  const user = event.user_data;
  const match = [
    user.em === undefined || user.em[0] === undefined ? "em=—" : `em=${user.em[0].slice(0, 12)}…`,
    `fbp=${user.fbp ?? "—"}`,
    `fbc=${user.fbc ?? "—"}`,
    `ip=${user.client_ip_address === undefined ? "—" : "set"}`,
    `ua=${user.client_user_agent === undefined ? "—" : "set"}`,
  ].join(" ");
  const custom =
    event.custom_data === undefined ? "" : ` custom=${JSON.stringify(event.custom_data)}`;
  return `[meta] SUPPRESSED (${vercelEnv ?? "no VERCEL_ENV"}) ${event.event_name} id=${event.event_id} ${match}${custom}`;
}

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

export const FBCLID_MAX_LENGTH = 500;

/**
 * Last chance to produce an `fbc` before an event goes out without one.
 *
 * Meta scores Event Match Quality largely on `fbc`, and a stored `fbclid` with
 * no `fbc` beside it is a click we were paid attention for and then failed to
 * report. `attributionFromQuery` writes both together, so this only fires on a
 * row written before it did — but the fallback timestamp is the honest part:
 * Meta reads the middle segment as "when the click happened", and stamping
 * `now` on a month-old click id would claim a click that never occurred. The
 * caller passes the earliest defensible time it knows.
 */
export function withDerivedFbc<T extends Partial<Attribution>>(
  attribution: T,
  clickTimeMs: number,
): T {
  const hasFbc = typeof attribution.fbc === "string" && attribution.fbc !== "";
  const fbclid = attribution.fbclid;
  if (hasFbc || typeof fbclid !== "string" || fbclid === "") return attribution;
  return { ...attribution, fbc: fbcFromClickId(fbclid, clickTimeMs) };
}

/** Reads attribution out of a landing URL's query string. */
export function attributionFromQuery(params: URLSearchParams, nowMs: number): Partial<Attribution> {
  // Mutable while building; the readonly Attribution is what callers see.
  const found: Record<string, string> = {};

  const fbclid = params.get("fbclid");
  if (fbclid !== null && fbclid !== "") {
    // Capped for the same reason the UTMs below are: this lands in a cookie and
    // then in a database column, and an unbounded query parameter is an
    // unbounded write. Meta's click ids run to ~120 characters; 500 is slack.
    const capped = fbclid.slice(0, FBCLID_MAX_LENGTH);
    found.fbclid = capped;
    found.fbc = fbcFromClickId(capped, nowMs);
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
