import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { drillAttempts, dailyChallenges, dailyResults, profiles } from "@/db/schema";
import { detectLeaks, type Leak, type Street } from "@/poker/grader";
import { tierFor } from "@/lib/rating";
import { loadPath } from "@/lib/curriculum-server";
import { courseFraction, nextLesson } from "@/lib/curriculum-progress";
import { describeLeak } from "@/lib/sim-review";
import { buildArenaLink } from "@/lib/arena-preset";
import { localDay } from "@/lib/local-day";
import {
  accuracyOf,
  evLostPer100,
  goalLine,
  greeting,
  lastSessionDelta,
  leakContext,
  MIN_HANDS_FOR_LEAKS,
  pfrOf,
  sparkline,
  streetAccuracy,
  vpipOf,
  weekOverWeek,
  type AttemptRow,
  type Period,
  type StreetAccuracy,
} from "@/lib/dashboard";
import type { HeroPosition } from "@/poker/solutions";

/**
 * One query pass for the whole home screen.
 *
 * Everything the dashboard shows comes from this function, and nothing here
 * invents a number: a user with no attempts gets zeros AND the flags that let
 * the page show a path instead. A dashboard full of zeros on day one is a
 * refund, so "has data" is a first-class part of the payload.
 */

/** Street from the stored board string — there is no street column. */
function streetOfBoard(board: string | null): Street {
  const cards = board === null || board.trim() === "" ? 0 : board.trim().split(/\s+/).length;
  if (cards === 0) return "preflop";
  if (cards <= 3) return "flop";
  if (cards === 4) return "turn";
  return "river";
}

export interface DashboardData {
  readonly greeting: string;
  readonly displayName: string | null;
  readonly goal: string | null;

  readonly rating: number | null;
  readonly tier: string;
  readonly ratingSparkline: readonly number[];
  readonly lastSessionDelta: number;

  readonly streak: number;
  readonly dailyDoneToday: boolean;
  readonly dailyScore: number | null;

  readonly nextLessonHref: string | null;
  readonly nextLessonTitle: string | null;
  readonly courseFraction: number;

  readonly totalHands: number;
  readonly hasEnoughForLeaks: boolean;
  readonly leaks: readonly { key: string; description: string; severity: number; href: string }[];

  readonly accuracy: number;
  readonly vpip: number;
  readonly pfr: number;
  readonly evLostPer100: number;
  readonly streets: readonly StreetAccuracy[];

  readonly thisWeek: Period;
  readonly lastWeek: Period;
}

const EMPTY_PERIOD: Period = { hands: 0, accuracy: 0, evLostPer100: 0, minutesStudied: 0 };

export async function loadDashboard(userId: string, now = new Date()): Promise<DashboardData> {
  const db = getDb();

  let profile: {
    displayName: string | null;
    rating: number | null;
    streakCount: number;
    lastDailyAt: string | null;
    timezone: string | null;
    onboarding: unknown;
  } | null = null;

  let rows: AttemptRow[] = [];
  let dailyToday: { score: number | null } | null = null;

  try {
    const [found] = await db
      .select({
        displayName: profiles.displayName,
        rating: profiles.rating,
        streakCount: profiles.streakCount,
        lastDailyAt: profiles.lastDailyAt,
        timezone: profiles.timezone,
        onboarding: profiles.onboarding,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    profile = found ?? null;
  } catch {
    // A dashboard that cannot read a profile still renders the path.
  }

  try {
    // 60 days: enough for a 30-day sparkline and a week-over-week comparison
    // without dragging a year of history into a page render.
    const since = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const found = await db
      .select({
        grade: drillAttempts.grade,
        evLoss: drillAttempts.evLoss,
        board: drillAttempts.board,
        chosenAction: drillAttempts.chosenAction,
        nodeRef: drillAttempts.nodeRef,
        timeMs: drillAttempts.timeMs,
        ratingAfter: drillAttempts.ratingAfter,
        createdAt: drillAttempts.createdAt,
      })
      .from(drillAttempts)
      .where(and(eq(drillAttempts.userId, userId), gte(drillAttempts.createdAt, since)))
      .orderBy(desc(drillAttempts.createdAt))
      .limit(5000);

    rows = found.map((r) => ({
      grade: (r.grade ?? "best") as AttemptRow["grade"],
      evLoss: r.evLoss === null ? 0 : Number(r.evLoss),
      street: streetOfBoard(r.board),
      chosenAction: r.chosenAction ?? "",
      // The grader's leak verbs compare chosen against best; a zero-loss
      // attempt WAS the best action, and anything else was not.
      bestAction:
        (r.evLoss === null ? 0 : Number(r.evLoss)) === 0 ? (r.chosenAction ?? "") : "other",
      timeMs: r.timeMs ?? 0,
      nodeRef: r.nodeRef,
      ratingAfter: r.ratingAfter,
      createdAt: r.createdAt ?? now,
    }));
  } catch {
    // No attempts is the brand-new-user case, not an error.
  }

  try {
    // The day lives on the challenge, not the result — one challenge per day,
    // many results.
    const today = localDay(now.getTime(), profile?.timezone ?? "UTC").key;
    const [found] = await db
      .select({ score: dailyResults.score })
      .from(dailyResults)
      .innerJoin(dailyChallenges, eq(dailyResults.challengeId, dailyChallenges.id))
      .where(and(eq(dailyResults.userId, userId), eq(dailyChallenges.date, today)))
      .limit(1);
    dailyToday = found ?? null;
  } catch {
    // Same.
  }

  const answers = (profile?.onboarding ?? {}) as { goal?: string };

  // The learning path, from the same source /learn uses.
  const path = await loadPath(userId);
  const next = nextLesson(path.modules);

  // Leaks, from the same detector the session review uses — bucketed on the
  // seat and sequence each attempt was ACTUALLY played in. This used to pass
  // "BTN"/"rfi" for every row, so a big-blind overfolder was told they
  // overfold on the button and sent to button drills.
  const leaks: Leak[] =
    rows.length >= MIN_HANDS_FOR_LEAKS
      ? detectLeaks(
          rows.map((r) => {
            const context = leakContext(r.nodeRef);
            return {
              street: r.street,
              position: context.position,
              actionSeq: context.actionSeq,
              handClass: null,
              chosenAction: r.chosenAction,
              bestAction: r.bestAction,
              evLoss: r.evLoss,
            };
          }),
        ).slice(0, 3)
      : [];

  const week = weekOverWeek(rows, now);

  // Rating history for the sparkline: real points, oldest first. Attempts
  // that predate the rating_after column (and daily attempts, which do not
  // move the rating) simply contribute no point.
  const ratingPoints = rows
    .filter((r) => r.ratingAfter != null)
    .map((r) => ({ at: r.createdAt, rating: r.ratingAfter! }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    greeting: greeting(now, profile?.timezone ?? undefined),
    displayName: profile?.displayName ?? null,
    goal: goalLine(answers.goal),

    rating: profile?.rating ?? null,
    tier: tierFor(profile?.rating ?? 0).name,
    ratingSparkline: sparkline(ratingPoints, profile?.rating ?? 0, now),
    lastSessionDelta: lastSessionDelta(ratingPoints),

    streak: profile?.streakCount ?? 0,
    dailyDoneToday: dailyToday !== null,
    dailyScore: dailyToday?.score ?? null,

    nextLessonHref: next === null ? null : `/learn/${next.lesson.module}/${next.lesson.slug}`,
    nextLessonTitle: next?.lesson.title ?? null,
    courseFraction: courseFraction(path.modules),

    totalHands: rows.length,
    hasEnoughForLeaks: rows.length >= MIN_HANDS_FOR_LEAKS,
    leaks: leaks.map((leak) => ({
      key: leak.key,
      description: describeLeak(leak),
      severity: leak.severity,
      // The drill link targets the leak's ACTUAL family — a postflop leak
      // opens postflop practice on that street, a preflop one opens the exact
      // seat and sequence.
      href: buildArenaLink({
        config:
          leak.actionSeq === "postflop"
            ? { type: "postflop", street: leak.street === "preflop" ? undefined : leak.street }
            : {
                type: "preflop",
                heroPos: leak.position as HeroPosition,
                actionSeq: leak.actionSeq,
              },
        length: 10,
        label: `Fixing: ${leak.actionSeq === "postflop" ? "postflop play" : leak.position}`,
        returnTo: "/progress",
      }),
    })),

    accuracy: accuracyOf(rows),
    vpip: vpipOf(rows),
    pfr: pfrOf(rows),
    evLostPer100: evLostPer100(rows),
    streets: streetAccuracy(rows),

    thisWeek: week.thisWeek ?? EMPTY_PERIOD,
    lastWeek: week.lastWeek ?? EMPTY_PERIOD,
  };
}
