import "server-only";

import { getRedis } from "@/lib/redis";
import { localDay } from "@/lib/local-day";

/**
 * Rate limiting.
 *
 * Two window kinds, because two genuinely different things are being limited:
 *
 * `sliding`     — burst control. "No more than N of these per minute." Uses a
 *                 two-bucket weighted counter, the same approximation Upstash's
 *                 own sliding limiter uses: exact counting would need one
 *                 stored entry per unit, and a token budget charging 1500 units
 *                 would write 1500 entries.
 *
 * `calendarDay` — a daily budget that resets at midnight. A rolling 24h window
 *                 can never say "resets at midnight" truthfully, and that is
 *                 the message the UI has to show.
 *
 * Rules also carry a `cost`, because an AI call spending 1500 tokens is not the
 * same event as one spending 20.
 */

export type WindowKind = "sliding" | "calendarDay";
export type FailMode = "open" | "closed";

export interface Rule {
  /** Namespace in the key. Never reuse one across rules. */
  readonly key: string;
  readonly limit: number;
  readonly kind: WindowKind;
  /** Required for `sliding`, ignored for `calendarDay`. */
  readonly windowSeconds?: number;
  /**
   * What to do when Redis is unreachable.
   *
   * `open` for anything that only costs us latency — blocking a paying user
   * because our cache is down is worse than letting a few extra requests
   * through. `closed` for anything that costs MONEY, because an outage is
   * exactly when an unmetered AI endpoint drains a budget.
   */
  readonly failMode: FailMode;
  /** IANA zone the day boundary is measured in. `calendarDay` only. */
  readonly timeZone?: string;
}

export interface LimitResult {
  readonly allowed: boolean;
  /** Units left in the current window, floored at 0. */
  readonly remaining: number;
  /** Epoch ms at which the allowance is back. */
  readonly resetAt: number;
  /** True when this verdict came from a Redis failure rather than a count. */
  readonly degraded: boolean;
}

/**
 * Named rules. Every caller references one of these rather than passing
 * numbers, so 4.5 can tune the whole app from one place.
 *
 * The numbers are deliberate defaults, not measurements — 4.5 tunes them
 * against real usage.
 */
export const RULES = {
  /** One graded answer per drill decision; generous, this is the core loop. */
  DRILL_ANSWER: {
    key: "drill_answer",
    limit: 120,
    kind: "sliding",
    windowSeconds: 60,
    failMode: "open",
  },

  /**
   * Dealing the next spot. Its own bucket: /drills/next used to charge
   * DRILL_ANSWER, so every hand cost two units of a budget the product
   * describes as answers — with prefetch, dealing and answering also happen
   * at different moments and must not race each other's allowance.
   */
  DRILL_NEXT: {
    key: "drill_next",
    limit: 120,
    kind: "sliding",
    windowSeconds: 60,
    failMode: "open",
  },

  /**
   * A flood guard, NOT the hint budget — `HINTS_DAILY` is that.
   *
   * It must stay strictly above `HINTS_DAILY.limit`, or it fires first and the
   * user gets a 429 where the product promised a friendly counter. Two limits
   * with the same number means the softer one can never be reached.
   */
  COACH_HINT: {
    key: "coach_hint",
    limit: 40,
    kind: "sliding",
    windowSeconds: 60,
    failMode: "closed",
  },

  /**
   * The hint budget the UI shows as a counter.
   *
   * A calendar day rather than a rolling window, because "20 hints left today"
   * is the only honest way to phrase it in the interface — a rolling 24h window
   * cannot answer "when do I get more?" with a time the user recognises.
   */
  HINTS_DAILY: {
    key: "hints_daily",
    limit: 20,
    kind: "calendarDay",
    failMode: "closed",
    timeZone: "UTC",
  },

  COACH_EXPLAIN: {
    key: "coach_explain",
    limit: 30,
    kind: "sliding",
    windowSeconds: 300,
    failMode: "closed",
  },

  COACH_CHAT: {
    key: "coach_chat",
    limit: 40,
    kind: "sliding",
    windowSeconds: 300,
    failMode: "closed",
  },

  /** A token budget, charged by `cost`, that resets at the user's midnight. */
  AI_TOKENS_DAILY: {
    key: "ai_tokens_daily",
    limit: 150_000,
    kind: "calendarDay",
    failMode: "closed",
    timeZone: "UTC",
  },

  /**
   * The table sim. Its own rule because the cadence is real: a fast folder
   * taps fold + next twice a second, and every hand is several requests. The
   * drill rule's 120/min rejects a legitimate hot streak mid-session.
   */
  SIM_ACTION: {
    key: "sim_action",
    limit: 600,
    kind: "sliding",
    windowSeconds: 60,
    failMode: "open",
  },

  API_GENERIC: {
    key: "api_generic",
    limit: 300,
    kind: "sliding",
    windowSeconds: 60,
    failMode: "open",
  },

  /** Fails CLOSED despite costing nothing — this one guards credentials. */
  AUTH_ATTEMPT: {
    key: "auth_attempt",
    limit: 10,
    kind: "sliding",
    windowSeconds: 900,
    failMode: "closed",
  },
} as const satisfies Record<string, Rule>;

export type RuleName = keyof typeof RULES;

export interface LimitOptions {
  /** Units this request consumes. Defaults to 1. */
  readonly cost?: number;
  /** Injectable clock, for tests. */
  readonly now?: () => number;
}

/* ── The limiter ─────────────────────────────────────────────────────────── */

function degraded(rule: Rule, resetAt: number): LimitResult {
  return {
    allowed: rule.failMode === "open",
    remaining: rule.failMode === "open" ? rule.limit : 0,
    resetAt,
    degraded: true,
  };
}

async function limitSliding(
  identifier: string,
  rule: Rule,
  cost: number,
  nowMs: number,
): Promise<LimitResult> {
  const windowMs = (rule.windowSeconds ?? 60) * 1000;
  const bucket = Math.floor(nowMs / windowMs);
  const elapsed = nowMs - bucket * windowMs;
  const nextBoundary = (bucket + 1) * windowMs;

  const currentKey = `rl:${rule.key}:${identifier}:${bucket}`;
  const previousKey = `rl:${rule.key}:${identifier}:${bucket - 1}`;

  const redis = getRedis();

  const [currentRaw, previousRaw] = await redis.mget([currentKey, previousKey]);

  const current = Number(currentRaw ?? "0");
  const previous = Number(previousRaw ?? "0");

  // The previous window's contribution decays as the current one fills. This
  // is what makes the limit slide instead of resetting on a boundary.
  const weight = 1 - elapsed / windowMs;
  const used = current + previous * weight;

  if (used + cost > rule.limit) {
    return {
      allowed: false,
      remaining: Math.max(0, Math.floor(rule.limit - used)),
      resetAt: nextBoundary,
      degraded: false,
    };
  }

  // Two windows of TTL, so the previous bucket is still readable while it
  // decays. One round trip for both commands — this runs on every drill.
  await redis.incrByWithExpire(currentKey, cost, (rule.windowSeconds ?? 60) * 2);

  return {
    allowed: true,
    remaining: Math.max(0, Math.floor(rule.limit - used - cost)),
    resetAt: nextBoundary,
    degraded: false,
  };
}

async function limitCalendarDay(
  identifier: string,
  rule: Rule,
  cost: number,
  nowMs: number,
): Promise<LimitResult> {
  const { key: dayKey, nextMidnight } = localDay(nowMs, rule.timeZone ?? "UTC");
  const redisKey = `rl:${rule.key}:${identifier}:${dayKey}`;

  const redis = getRedis();
  const used = Number((await redis.get(redisKey)) ?? "0");

  if (used + cost > rule.limit) {
    return {
      allowed: false,
      remaining: Math.max(0, rule.limit - used),
      resetAt: nextMidnight,
      degraded: false,
    };
  }

  // Two days of slack, so a key cannot outlive its usefulness or vanish early.
  await redis.incrByWithExpire(redisKey, cost, 172_800);

  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - used - cost),
    resetAt: nextMidnight,
    degraded: false,
  };
}

/**
 * Checks and consumes allowance for `identifier` under `rule`.
 *
 * Returns a result rather than a boolean because the UI needs to say WHEN the
 * allowance returns, not just that it is gone.
 */
export async function limit(
  identifier: string,
  rule: Rule,
  options: LimitOptions = {},
): Promise<LimitResult> {
  const nowMs = (options.now ?? Date.now)();
  const cost = options.cost ?? 1;

  try {
    return rule.kind === "calendarDay"
      ? await limitCalendarDay(identifier, rule, cost, nowMs)
      : await limitSliding(identifier, rule, cost, nowMs);
  } catch {
    // A cost-bearing rule fails CLOSED: an outage is precisely when an
    // unmetered AI endpoint would drain the budget.
    const resetAt =
      rule.kind === "calendarDay"
        ? localDay(nowMs, rule.timeZone ?? "UTC").nextMidnight
        : nowMs + (rule.windowSeconds ?? 60) * 1000;
    return degraded(rule, resetAt);
  }
}
