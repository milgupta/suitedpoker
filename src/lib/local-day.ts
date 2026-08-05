/**
 * Calendar-day arithmetic in an arbitrary timezone.
 *
 * Shared by the rate limiter's daily budgets and the streak logic, because
 * "what day is it for this user" must have exactly one answer in this codebase.
 * Two implementations of it is how a Los Angeles user loses a streak to a UTC
 * rollover while the budget resets an hour later.
 *
 * Derived by formatting rather than by offset arithmetic, so it is correct for
 * any zone without a timezone library.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (fmt === undefined) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

export interface LocalDay {
  /** `YYYY-MM-DD` in the target zone. */
  readonly key: string;
  /** Epoch ms of the next local midnight. */
  readonly nextMidnight: number;
}

/**
 * On a DST transition day the computed midnight can be an hour out. That shifts
 * a reset by an hour twice a year and is not worth a dependency.
 */
export function localDay(nowMs: number, timeZone: string): LocalDay {
  const parts = formatterFor(timeZone).formatToParts(new Date(nowMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");

  const year = get("year");
  const month = String(get("month")).padStart(2, "0");
  const day = String(get("day")).padStart(2, "0");

  // Intl renders midnight as hour 24 in some zones and locales.
  const hour = get("hour") % 24;
  const elapsed = hour * 3600 + get("minute") * 60 + get("second");

  return {
    key: `${year}-${month}-${day}`,
    nextMidnight: nowMs + (86_400 - elapsed) * 1000,
  };
}

/** Whole days between two `YYYY-MM-DD` keys. Negative if `b` precedes `a`. */
export function daysBetween(a: string, b: string): number {
  const parse = (key: string): number => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

/** `YYYY-MM` — the month a day key falls in. */
export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}
