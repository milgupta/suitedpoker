import { daysBetween, localDay, monthOf } from "@/lib/local-day";

/**
 * Streaks, computed in the USER'S timezone.
 *
 * This is the substage's most likely bug and it is worth being explicit about
 * why: a player in Los Angeles finishing the daily at 5pm is at midnight UTC.
 * Counting in UTC would end their streak while they are still looking at the
 * screen. Every boundary here comes from `profiles.timezone`.
 *
 * Pure functions. The caller supplies "now" and the stored state, so the
 * timezone matrix can be tested without a database or a clock.
 */

export interface StreakState {
  count: number;
  longest: number;
  /** `YYYY-MM-DD` in the user's zone, or null if they have never played. */
  lastPlayedDay: string | null;
  /** First-of-month `YYYY-MM` in which a freeze was last spent. */
  freezeUsedMonth: string | null;
}

export interface StreakResult extends StreakState {
  /** True when this completion extended the streak. */
  extended: boolean;
  /** True when a freeze covered a missed day. The UI MUST say so. */
  freezeApplied: boolean;
  /** Set when this completion crossed a milestone. */
  milestone: number | null;
}

/** Each gets a distinct celebration. */
export const MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export function isMilestone(count: number): boolean {
  return (MILESTONES as readonly number[]).includes(count);
}

/**
 * Applies a daily completion.
 *
 * The freeze is applied automatically on a single missed day, once per calendar
 * month. It is reported rather than hidden: an unannounced save teaches the
 * user nothing, while an announced one is the moment they feel looked after.
 */
export function completeDaily(state: StreakState, nowMs: number, timeZone: string): StreakResult {
  const today = localDay(nowMs, timeZone).key;

  // Already played today — idempotent, so a double submit cannot inflate.
  if (state.lastPlayedDay === today) {
    return { ...state, extended: false, freezeApplied: false, milestone: null };
  }

  if (state.lastPlayedDay === null) {
    const count = 1;
    return {
      count,
      longest: Math.max(state.longest, count),
      lastPlayedDay: today,
      freezeUsedMonth: state.freezeUsedMonth,
      extended: true,
      freezeApplied: false,
      milestone: isMilestone(count) ? count : null,
    };
  }

  const gap = daysBetween(state.lastPlayedDay, today);

  // Yesterday — the ordinary case.
  if (gap === 1) {
    const count = state.count + 1;
    return {
      count,
      longest: Math.max(state.longest, count),
      lastPlayedDay: today,
      freezeUsedMonth: state.freezeUsedMonth,
      extended: true,
      freezeApplied: false,
      milestone: isMilestone(count) ? count : null,
    };
  }

  // Exactly one day missed, and a freeze is available this month.
  const thisMonth = monthOf(today);
  if (gap === 2 && state.freezeUsedMonth !== thisMonth) {
    const count = state.count + 1;
    return {
      count,
      longest: Math.max(state.longest, count),
      lastPlayedDay: today,
      freezeUsedMonth: thisMonth,
      extended: true,
      freezeApplied: true,
      milestone: isMilestone(count) ? count : null,
    };
  }

  // Anything else — including a second miss in the same month — resets. The
  // streak restarts at 1 rather than 0, because they did play today.
  return {
    count: 1,
    longest: Math.max(state.longest, 1),
    lastPlayedDay: today,
    freezeUsedMonth: state.freezeUsedMonth,
    extended: false,
    freezeApplied: false,
    milestone: null,
  };
}

/**
 * The streak as it stands right now, without recording a completion.
 *
 * A streak the user has not yet defended today is still live — it only breaks
 * once the day they missed is behind them.
 */
export function currentStreak(state: StreakState, nowMs: number, timeZone: string): number {
  if (state.lastPlayedDay === null) return 0;
  const gap = daysBetween(state.lastPlayedDay, localDay(nowMs, timeZone).key);
  if (gap <= 1) return state.count;
  if (gap === 2 && state.freezeUsedMonth !== monthOf(localDay(nowMs, timeZone).key)) {
    return state.count;
  }
  return 0;
}
