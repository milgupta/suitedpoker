import "server-only";

import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { drillAttempts, profiles, subscriptions } from "@/db/schema";
import { sendTransactional } from "@/lib/email";
import { link } from "@/emails/theme";
import { PLANS, formatUsd, type PlanId } from "@/lib/stripe/plans";
import { planForPriceId } from "@/lib/stripe/client";
import { loadPath } from "@/lib/curriculum-server";
import {
  accessEndsAt,
  DUNNING_TEMPLATES,
  dunningIdempotencyKey,
  formatDate,
  stageDueOn,
} from "@/lib/dunning";

/**
 * The dunning run.
 *
 * Reads every past_due subscription and sends whichever email is due TODAY,
 * computed from `past_due_since`. A subscription that has recovered is no
 * longer past_due, so it is simply not in the result set — the sequence stops
 * because the state it derives from stopped, not because anything cancels it.
 */

export interface DunningResult {
  readonly considered: number;
  readonly sent: { userId: string; stage: string; email: string }[];
  readonly skipped: { userId: string; reason: string }[];
}

/** The real numbers for dunning #2. Placeholders here would be a lie. */
async function accountStats(userId: string): Promise<{
  streakDays: number | null;
  rating: number | null;
  handsPlayed: number | null;
  lessonsCompleted: number | null;
}> {
  const db = getDb();

  let streakDays: number | null = null;
  let rating: number | null = null;
  try {
    const [row] = await db
      .select({ streak: profiles.streakCount, rating: profiles.rating })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    streakDays = row?.streak ?? null;
    rating = row?.rating ?? null;
  } catch {
    // A stat we cannot read is omitted from the email rather than faked.
  }

  let handsPlayed: number | null = null;
  try {
    const rows = await db
      .select({ id: drillAttempts.id })
      .from(drillAttempts)
      .where(eq(drillAttempts.userId, userId))
      .limit(100_000);
    handsPlayed = rows.length;
  } catch {
    // Same.
  }

  let lessonsCompleted: number | null = null;
  try {
    const path = await loadPath(userId);
    lessonsCompleted = path.modules.reduce(
      (total, module) =>
        total + module.lessons.filter((lesson) => lesson.status === "completed").length,
      0,
    );
  } catch {
    // Same.
  }

  return { streakDays, rating, handsPlayed, lessonsCompleted };
}

export async function runDunning(now: Date = new Date()): Promise<DunningResult> {
  const result: DunningResult = { considered: 0, sent: [], skipped: [] };

  const rows = await getDb()
    .select({
      userId: subscriptions.userId,
      status: subscriptions.status,
      pastDueSince: subscriptions.pastDueSince,
      priceId: subscriptions.priceId,
      email: profiles.email,
    })
    .from(subscriptions)
    .leftJoin(profiles, eq(profiles.id, subscriptions.userId))
    .where(isNotNull(subscriptions.pastDueSince))
    .limit(1000);

  for (const row of rows) {
    // A recovered subscription is no longer past_due. This is the whole "stop
    // on payment" mechanism — there is nothing to cancel.
    if (row.status !== "past_due") continue;
    if (row.pastDueSince === null) continue;

    (result as { considered: number }).considered += 1;

    const stage = stageDueOn(row.pastDueSince, now);
    if (stage === null) {
      result.skipped.push({ userId: row.userId, reason: "not_due_today" });
      continue;
    }

    if (row.email === null || row.email === "") {
      result.skipped.push({ userId: row.userId, reason: "no_email" });
      continue;
    }

    const plan: PlanId = planForPriceId(row.priceId) ?? "monthly";
    const stats = stage === "reminder" ? await accountStats(row.userId) : {};

    const ok = await sendTransactional({
      to: row.email,
      template: DUNNING_TEMPLATES[stage],
      data: {
        amount: formatUsd(PLANS[plan].amountCents),
        updateUrl: link("/account"),
        accessEndsOn: formatDate(accessEndsAt(row.pastDueSince)),
        ...stats,
      },
      // Two cron runs in the same minute must not send it twice.
      idempotencyKey: dunningIdempotencyKey(row.userId, row.pastDueSince, stage),
    });

    if (ok) result.sent.push({ userId: row.userId, stage, email: row.email });
    else result.skipped.push({ userId: row.userId, reason: "send_failed" });
  }

  return result;
}
