import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsage, profiles } from "@/db/schema";
import { budgetState, type BudgetState } from "./budget";

/**
 * What the AI actually cost, per user and in total.
 *
 * The Redis counter is the fast path the circuit breaker reads on every
 * request; `ai_usage` is the durable ledger. They are reconciled on this page
 * rather than trusted to agree — if Redis was flushed or an insert failed, the
 * difference is the first thing you want to see, not a number you have to
 * derive during an incident.
 */

export interface UserCost {
  readonly userId: string;
  readonly email: string | null;
  readonly calls: number;
  readonly cachedCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface CostReport {
  readonly budget: BudgetState;
  /** From `ai_usage`, which may lag or lead the Redis counter. */
  readonly ledgerSpendUsd: number;
  readonly calls: number;
  readonly cacheHitRate: number;
  readonly activeUsers: number;
  readonly costPerActiveUserUsd: number;
  readonly topUsers: readonly UserCost[];
  readonly byEndpoint: readonly { endpoint: string; calls: number; costUsd: number }[];
}

const EMPTY: Omit<CostReport, "budget"> = {
  ledgerSpendUsd: 0,
  calls: 0,
  cacheHitRate: 0,
  activeUsers: 0,
  costPerActiveUserUsd: 0,
  topUsers: [],
  byEndpoint: [],
};

/** Midnight UTC — the same day boundary the circuit breaker counts against. */
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function loadCostReport(now: Date = new Date()): Promise<CostReport> {
  const budget = await budgetState(now);
  const since = startOfUtcDay(now);

  try {
    const db = getDb();

    const perUser = await db
      .select({
        userId: aiUsage.userId,
        email: profiles.email,
        calls: sql<number>`count(*)::int`,
        cachedCalls: sql<number>`count(*) filter (where ${aiUsage.cached})::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
        costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      })
      .from(aiUsage)
      .leftJoin(profiles, eq(profiles.id, aiUsage.userId))
      .where(gte(aiUsage.createdAt, since))
      .groupBy(aiUsage.userId, profiles.email)
      .orderBy(desc(sql`coalesce(sum(${aiUsage.costUsd}), 0)`))
      .limit(20);

    const totals = await db
      .select({
        calls: sql<number>`count(*)::int`,
        cachedCalls: sql<number>`count(*) filter (where ${aiUsage.cached})::int`,
        costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
        activeUsers: sql<number>`count(distinct ${aiUsage.userId})::int`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since));

    const byEndpoint = await db
      .select({
        endpoint: aiUsage.endpoint,
        calls: sql<number>`count(*)::int`,
        costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since))
      .groupBy(aiUsage.endpoint)
      .orderBy(desc(sql`coalesce(sum(${aiUsage.costUsd}), 0)`));

    const total = totals[0];
    const calls = total?.calls ?? 0;
    const activeUsers = total?.activeUsers ?? 0;
    const ledgerSpendUsd = Number(total?.costUsd ?? 0);

    return {
      budget,
      ledgerSpendUsd,
      calls,
      cacheHitRate: calls === 0 ? 0 : (total?.cachedCalls ?? 0) / calls,
      activeUsers,
      costPerActiveUserUsd: activeUsers === 0 ? 0 : ledgerSpendUsd / activeUsers,
      topUsers: perUser.map((row) => ({
        userId: row.userId,
        email: row.email,
        calls: row.calls,
        cachedCalls: row.cachedCalls,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        costUsd: Number(row.costUsd),
      })),
      byEndpoint: byEndpoint.map((row) => ({
        endpoint: row.endpoint,
        calls: row.calls,
        costUsd: Number(row.costUsd),
      })),
    };
  } catch (error) {
    // A cost page that 500s during an incident is the page you needed most.
    console.error(`[costs] report failed: ${String(error)}`);
    return { budget, ...EMPTY };
  }
}

/** Today's spend for one user, for the per-user daily token budget. */
export async function userSpendToday(userId: string, now: Date = new Date()): Promise<number> {
  try {
    const [row] = await getDb()
      .select({ costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, startOfUtcDay(now))));
    return Number(row?.costUsd ?? 0);
  } catch {
    return 0;
  }
}
