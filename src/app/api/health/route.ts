import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { isStripeConfigured, getStripe } from "@/lib/stripe/client";

/**
 * The endpoint an uptime monitor watches.
 *
 * It CHECKS the dependencies rather than reporting that the process is up — a
 * health check that only proves Node is running goes green through a total
 * database outage, which is the one time you need it to be red.
 *
 * Public and unauthenticated on purpose: a monitor has no session. It returns
 * only up/down per dependency and a latency — never a connection string, a
 * version, or an error message from the provider, all of which are useful to
 * someone probing the surface.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Status = "ok" | "degraded" | "down" | "not_configured";

interface Check {
  readonly name: string;
  readonly status: Status;
  readonly ms: number;
}

/** A dependency that hangs is down. Without this the check hangs with it. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function timed(name: string, work: () => Promise<unknown>): Promise<Check> {
  const startedAt = Date.now();
  try {
    await withTimeout(work(), 3_000);
    return { name, status: "ok", ms: Date.now() - startedAt };
  } catch {
    return { name, status: "down", ms: Date.now() - startedAt };
  }
}

export async function GET(): Promise<Response> {
  const checks: Check[] = [];

  checks.push(await timed("database", async () => getDb().execute(sql`select 1`)));

  checks.push(
    isRedisConfigured()
      ? await timed("redis", async () => {
          // A write and a read: `get` alone succeeds against a Redis that has
          // gone read-only, which is not a healthy Redis for a rate limiter.
          const key = "health:probe";
          await getRedis().set(key, "1", 30);
          const value = await getRedis().get(key);
          if (value !== "1") throw new Error("readback failed");
        })
      : // The in-memory fallback is a real implementation, not an outage — it
        // is what runs in development and in CI.
        { name: "redis", status: "not_configured", ms: 0 },
  );

  checks.push(
    isStripeConfigured()
      ? await timed("stripe", async () => {
          // The cheapest authenticated call there is. It proves the key works,
          // which is the thing that actually breaks.
          await getStripe().balance.retrieve();
        })
      : { name: "stripe", status: "not_configured", ms: 0 },
  );

  const down = checks.filter((c) => c.status === "down");
  const healthy = down.length === 0;

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      checks,
      // A monitor graphs this; a human reads it during an incident.
      at: new Date().toISOString(),
    },
    {
      // 503 so an uptime monitor pages someone without having to parse a body.
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store, max-age=0" },
    },
  );
}
