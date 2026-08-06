# Upstash Redis — setup

**This is a launch blocker, not an optimisation.** Without it the app falls back
to an in-memory store, and on Vercel each serverless invocation has its own
memory — so `/api/drills/next` writes the spot seed into one instance and
`/api/drills/answer` reads from another, finds nothing, and returns
`spot_not_found`. **The drill loop does not work.** Nothing logs an error,
because the fallback is a real implementation that succeeds locally.

It also backs rate limiting, the AI budget circuit breaker, the AI response
cache (~60% of the AI bill), the entitlement cache, and the Meta CAPI retry
queue.

## 1. Create the database

1. [console.upstash.com](https://console.upstash.com) → sign in → **Create
   Database**.
2. Name: `suitedpoker`.
3. Type: **Regional**. Global costs more and replicates data you do not need
   replicated — every key here is short-lived session state.
4. **Region: match your Vercel region.** Vercel's default is `iad1`
   (Washington, D.C.), so pick `us-east-1`. This matters more than it sounds:
   the drill loop makes several round trips per hand, and a cross-continent
   database adds latency to every one of them.
5. TLS: on (the default).

## 2. Copy the REST credentials — not the other ones

On the database page, scroll to **REST API** and copy:

```
UPSTASH_REDIS_REST_URL=https://<something>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<long token>
```

⚠️ **Upstash shows two sets of credentials.** There is also a `redis://…`
connection string for TCP clients. This codebase uses the REST client
(`@upstash/redis`), and the TCP URL fails at *request* time rather than at
startup — so it looks configured, behaves exactly like the broken fallback, and
gives you no clue. `npm run check:redis` catches this specifically.

## 3. Local

Fill the two empty lines already in `.env.local`:

```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

Then:

```bash
npm run check:redis
```

It writes a key, reads it back **through a second client**, exercises `incrby`
and a TTL, and reports round-trip latency. Reading through the same client
would also pass against the in-memory store, which is the whole thing being
ruled out.

## 4. Vercel

Project → Settings → Environment Variables. Add both to **Production**,
**Preview** and **Development**.

Redeploy after adding them — Vercel does not re-run a build on an env change.

## 5. Confirm in production

```bash
curl -s https://suitedpoker.com/api/health | jq
```

The `redis` check must say `"ok"`. If it says `"not_configured"` the variables
did not reach the deployment; if it says `"down"` the credentials are wrong or
the database is unreachable.

## Capacity — read this before launch

The free tier has a daily command limit. The drill loop uses roughly **8 Redis
commands per hand** (spot write, spot read, the burn-on-answer write, plus two
or three rate-limit operations and an entitlement cache read).

So the arithmetic is:

```
daily command limit ÷ 8 ≈ hands per day, across ALL users
```

At Upstash's free 10,000/day that is about **1,250 hands a day in total** —
roughly 25 users doing a 50-hand session. You will pass that on the first day of
ad spend. Check the current limit on the pricing page and move to
pay-as-you-go before you launch; it is inexpensive, and the failure mode when
you hit the cap is the drill loop breaking for everyone at once.

## Why not Vercel KV

Vercel KV *is* Upstash underneath, and going direct means one bill, one
console, and no coupling to the hosting provider. If you would rather have it
in the Vercel dashboard, the KV integration sets `KV_REST_API_URL` and
`KV_REST_API_TOKEN` — you would need to alias those to the two names above, or
change `src/lib/env.server.ts`. Not worth it.
