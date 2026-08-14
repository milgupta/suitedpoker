import "server-only";

import { getRedis } from "@/lib/redis";
import { serverEnv } from "@/lib/env.server";

/**
 * THE THING THAT STOPS A $40,000 MONTH.
 *
 * An LLM endpoint behind a flat $24.99 subscription is an unbounded liability
 * sold at a fixed price. Per-user limits (ratelimit.ts) bound one abuser; this
 * bounds EVERYONE at once — a viral post, a scraper, a bug in our own retry
 * logic. It is the only control that holds when the assumption "users behave
 * roughly like users" stops being true.
 *
 * Two thresholds, and they degrade by FEATURE rather than by user class:
 *
 *   soft (80%)  cheap paths go template-only — hints, and explanations of
 *               correct decisions, which are the ones a template already
 *               explains well. The expensive paths stay live.
 *   hard (100%) all generation stops. Everything falls back to templates built
 *               from the same solution data, and the product stays usable.
 *
 * Under a hard paywall every user is paying, so there is no free tier to shed.
 * Degrading a paying customer to a plainer explanation is defensible; cutting
 * one off entirely because they arrived after someone else is not.
 */

/** The daily ceiling in USD, overridable per environment. */
export function dailyBudgetUsd(): number {
  const raw = process.env.AI_DAILY_BUDGET_USD;
  if (raw === undefined || raw.trim() === "") return 25;
  const configured = Number(raw);
  // An unparseable value falls to the default, which is still bounded. An
  // EXPLICIT zero or negative is returned as 0, which `levelFor` reads as
  // hard — the documented promise. The previous version folded "0" into the
  // unset case and quietly ran on the $25 default.
  if (!Number.isFinite(configured)) return 25;
  return configured > 0 ? configured : 0;
}

export const SOFT_CAP_FRACTION = 0.8;
export const HARD_CAP_FRACTION = 1.0;

export type BudgetLevel = "normal" | "soft" | "hard";

export interface BudgetState {
  readonly spentUsd: number;
  readonly budgetUsd: number;
  readonly fraction: number;
  readonly level: BudgetLevel;
  /** UTC day key the counter is filed under. */
  readonly day: string;
}

/**
 * UTC, not the user's local day, and deliberately so.
 *
 * This is OUR bill, not a per-user allowance. `localDay()` exists for anything
 * a user is told about ("resets at midnight"); a global spend counter that
 * rolled over 24 different times would never be a single day's spend.
 */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function spendKey(day: string): string {
  return `ai:spend:${day}`;
}

/** Counters are held in micro-dollars: Redis counts integers, money is not. */
const MICROS = 1_000_000;

export async function recordSpend(costUsd: number, now: Date = new Date()): Promise<number> {
  if (!(costUsd > 0)) return currentSpendUsd(now);

  const day = utcDay(now);
  const micros = Math.round(costUsd * MICROS);

  try {
    const total = await getRedis().incrBy(spendKey(day), micros);
    // Two days, so yesterday's figure is still readable on the admin page.
    await getRedis().expire(spendKey(day), 48 * 60 * 60);
    return total / MICROS;
  } catch {
    // A Redis outage must not fail the request that already cost the money.
    return 0;
  }
}

export async function currentSpendUsd(now: Date = new Date()): Promise<number> {
  try {
    const raw = await getRedis().get(spendKey(utcDay(now)));
    if (raw === null) return 0;
    const micros = Number(raw);
    return Number.isFinite(micros) ? micros / MICROS : 0;
  } catch {
    return 0;
  }
}

export function levelFor(spentUsd: number, budgetUsd: number): BudgetLevel {
  if (budgetUsd <= 0) return "hard";
  const fraction = spentUsd / budgetUsd;
  if (fraction >= HARD_CAP_FRACTION) return "hard";
  if (fraction >= SOFT_CAP_FRACTION) return "soft";
  return "normal";
}

export async function budgetState(now: Date = new Date()): Promise<BudgetState> {
  const budgetUsd = dailyBudgetUsd();
  const spentUsd = await currentSpendUsd(now);
  return {
    spentUsd,
    budgetUsd,
    fraction: budgetUsd <= 0 ? 1 : spentUsd / budgetUsd,
    level: levelFor(spentUsd, budgetUsd),
    day: utcDay(now),
  };
}

/**
 * Which paths a level still allows.
 *
 * `cheap` covers hints and explanations of correct decisions — spots where the
 * template already says something true and useful. `expensive` covers a
 * mistake, a blunder or a chat turn, where a real explanation is the product
 * the user paid for and the last thing to give up.
 */
export type AiPath = "cheap" | "expensive";

export function allowsGeneration(level: BudgetLevel, path: AiPath): boolean {
  if (level === "hard") return false;
  if (level === "soft") return path === "expensive";
  return true;
}

export async function canGenerate(path: AiPath, now: Date = new Date()): Promise<boolean> {
  const state = await budgetState(now);
  await maybeAlert(state);
  return allowsGeneration(state.level, path);
}

/* ── per-user fair share ─────────────────────────────────────────────────── */

/**
 * The global breaker degrades by FEATURE because cutting a paying user off
 * entirely is indefensible — but with only a global counter, one heavy user
 * spends the whole pool and the time of day you practise decides whether your
 * coach is live. The fair-share cap bounds one user's slice of the day: past
 * it, THAT user gets templates on every path while everyone else stays live,
 * and the global thresholds keep working as the backstop underneath.
 *
 * Unset defaults to $0.50/day — at ~$0.00009 per explanation that is
 * thousands of model calls, so nobody using the product as a product gets
 * near it. An EXPLICIT zero or negative value is HARD for everyone, never
 * unlimited: a misconfigured env var must fail toward spending nothing, and
 * the product stays usable on templates by design.
 */
export function userDailyBudgetUsd(): number {
  const raw = process.env.AI_USER_DAILY_BUDGET_USD;
  if (raw === undefined || raw.trim() === "") return 0.5;
  const configured = Number(raw);
  if (!Number.isFinite(configured)) return 0.5;
  return configured > 0 ? configured : 0;
}

/**
 * UTC like the global counter, deliberately. The fair share is a cost control
 * the user is never told about — no "resets at midnight" copy anywhere — so it
 * files under the same day as the bill it protects. `localDay()` remains the
 * answer for anything a user is promised.
 */
function userSpendKey(day: string, userId: string): string {
  return `ai:spend:${day}:user:${userId}`;
}

export async function recordUserSpend(
  userId: string,
  costUsd: number,
  now: Date = new Date(),
): Promise<void> {
  if (!(costUsd > 0)) return;

  const day = utcDay(now);
  const micros = Math.round(costUsd * MICROS);

  try {
    await getRedis().incrBy(userSpendKey(day, userId), micros);
    await getRedis().expire(userSpendKey(day, userId), 48 * 60 * 60);
  } catch {
    // A Redis outage must not fail the request that already cost the money.
  }
}

/** Records against the global counter AND the user's slice, in one call. */
export async function recordSpendFor(
  userId: string,
  costUsd: number,
  now: Date = new Date(),
): Promise<void> {
  await recordSpend(costUsd, now);
  await recordUserSpend(userId, costUsd, now);
}

export async function userSpentUsd(userId: string, now: Date = new Date()): Promise<number> {
  try {
    const raw = await getRedis().get(userSpendKey(utcDay(now), userId));
    if (raw === null) return 0;
    const micros = Number(raw);
    return Number.isFinite(micros) ? micros / MICROS : 0;
  } catch {
    return 0;
  }
}

export interface UserBudgetState {
  readonly spentUsd: number;
  readonly budgetUsd: number;
  readonly exhausted: boolean;
}

export async function userBudgetState(
  userId: string,
  now: Date = new Date(),
): Promise<UserBudgetState> {
  const budgetUsd = userDailyBudgetUsd();
  const spentUsd = await userSpentUsd(userId, now);
  return { spentUsd, budgetUsd, exhausted: budgetUsd <= 0 || spentUsd >= budgetUsd };
}

/**
 * The gate the coach routes call: the global breaker first (with its alert),
 * then the caller's own slice. An over-cap user is refused BOTH paths — their
 * degradation is by user, which is exactly the point: it is the one shape of
 * degradation that protects every other user instead of sharing the damage.
 * The responses they get are the same template fallbacks the breaker serves,
 * marked `source: "template"` on every surface.
 */
export async function canGenerateFor(
  userId: string,
  path: AiPath,
  now: Date = new Date(),
): Promise<boolean> {
  if (!(await canGenerate(path, now))) return false;
  const user = await userBudgetState(userId, now);
  return !user.exhausted;
}

/* ── alerting ────────────────────────────────────────────────────────────── */

function alertKey(day: string, level: BudgetLevel): string {
  return `ai:alerted:${day}:${level}`;
}

/**
 * One alert per threshold per day.
 *
 * Without the marker every request past 80% posts to the webhook, which is how
 * a cost alert becomes noise and then becomes muted — at which point the hard
 * cap arrives with no warning at all.
 */
export async function maybeAlert(state: BudgetState): Promise<boolean> {
  if (state.level === "normal") return false;

  const url = serverEnv().ALERT_WEBHOOK_URL;
  const key = alertKey(state.day, state.level);

  try {
    const already = await getRedis().get(key);
    if (already !== null) return false;
    await getRedis().set(key, "1", 48 * 60 * 60);
  } catch {
    // Cannot dedupe, so do not send — repeated alerts train people to ignore
    // them, and this is the alert that matters most.
    return false;
  }

  const message =
    state.level === "hard"
      ? `🔴 SuitedPoker AI budget EXHAUSTED for ${state.day}: $${state.spentUsd.toFixed(2)} of $${state.budgetUsd.toFixed(2)}. All generation is off; templates are serving.`
      : `🟡 SuitedPoker AI budget at ${Math.round(state.fraction * 100)}% for ${state.day}: $${state.spentUsd.toFixed(2)} of $${state.budgetUsd.toFixed(2)}. Cheap paths degraded to templates.`;

  console.warn(`[ai-budget] ${message}`);

  if (url === undefined || url === "") return true;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `text` and `content` together, so the same URL works for Slack or
      // Discord without a config flag nobody will remember to set.
      body: JSON.stringify({ text: message, content: message }),
    });
  } catch {
    // An unreachable webhook must never fail the request that triggered it.
  }

  return true;
}

/** Test-only: clears today's counters. */
export async function __resetBudgetForTests(now: Date = new Date()): Promise<void> {
  const day = utcDay(now);
  await getRedis().del(spendKey(day));
  await getRedis().del(alertKey(day, "soft"));
  await getRedis().del(alertKey(day, "hard"));
}
