/**
 * Proves Redis is real, not that a variable is set.
 *
 * `src/lib/redis.ts` falls back to an in-memory store when Upstash is absent,
 * and that fallback is deliberately invisible — every call succeeds. Locally
 * that is correct and convenient. On Vercel it is a trap: each serverless
 * invocation gets its own memory, so `/api/drills/next` writes the spot seed
 * into one instance and `/api/drills/answer` reads from another and finds
 * nothing. The core loop 404s and nothing logs an error.
 *
 * So this checks the thing that actually matters: a value written now can be
 * read back by a SEPARATE client, which is what the in-memory store cannot do.
 *
 *   npm run check:redis
 */

import { Redis } from "@upstash/redis";
import { loadLocalEnv } from "../tests/support/load-local-env";

loadLocalEnv();

const URL_VAR = "UPSTASH_REDIS_REST_URL";
const TOKEN_VAR = "UPSTASH_REDIS_REST_TOKEN";

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env[URL_VAR] ?? "";
  const token = process.env[TOKEN_VAR] ?? "";

  if (url === "" || token === "") {
    fail(
      `${url === "" ? URL_VAR : TOKEN_VAR} is empty.\n` +
        "    The app silently uses an in-memory store without it, which does not\n" +
        "    survive between serverless invocations — see docs/REDIS-SETUP.md.",
    );
  }

  // The single most common setup mistake. Upstash shows a `redis://…` string
  // for TCP clients and an `https://…` one for the REST API; this codebase uses
  // the REST client, and the TCP URL fails at request time rather than at
  // startup — so it looks configured and behaves like the fallback.
  if (!url.startsWith("https://")) {
    fail(
      `${URL_VAR} is "${url.slice(0, 24)}…", which is not a REST URL.\n` +
        "    Upstash shows two: use the one starting https:// (REST API), not redis://.",
    );
  }

  const writer = new Redis({ url, token, automaticDeserialization: false });
  const key = `healthcheck:${Date.now()}`;
  const value = `ok-${Math.random().toString(36).slice(2)}`;

  let latency = 0;
  try {
    const startedAt = Date.now();
    await writer.set(key, value, { ex: 60 });
    latency = Date.now() - startedAt;
  } catch (error) {
    fail(`write failed: ${error instanceof Error ? error.message : "unknown"}`);
  }

  // A SEPARATE client. Reading back through the same one would also pass
  // against an in-memory store, which is exactly the failure being ruled out.
  const reader = new Redis({ url, token, automaticDeserialization: false });
  const readBack = await reader.get<string>(key);

  if (readBack !== value) {
    fail(
      `wrote "${value}" but a second client read back ${JSON.stringify(readBack)}.\n` +
        "    That is the in-memory fallback, not a shared store.",
    );
  }

  // incrBy backs the AI budget breaker and every rate limit.
  const counterKey = `healthcheck:counter:${Date.now()}`;
  await writer.incrby(counterKey, 5);
  const counted = await reader.incrby(counterKey, 3);
  if (counted !== 8) fail(`incrby returned ${counted}, expected 8`);

  // And the TTL, which is what stops the spot store growing without bound.
  const ttl = await reader.ttl(key);
  if (ttl <= 0) fail(`the key has no TTL (ttl=${ttl}); expiry is not working`);

  await writer.del(key);
  await writer.del(counterKey);

  const host = new URL(url).host;
  console.log(
    `\n  ✓ Upstash reachable at ${host}\n` +
      `    write→read across two clients: ok\n` +
      `    incrby: ok · ttl: ${ttl}s · round trip: ${latency}ms\n` +
      (latency > 200
        ? `\n    ⚠ ${latency}ms is slow. The drill loop makes several calls per hand —\n` +
          `      pick the Upstash region closest to your Vercel region.\n`
        : "\n"),
  );
}

void main();
