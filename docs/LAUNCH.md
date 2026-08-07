# Launch checklist

Ordered so that nothing on the list can silently undo something above it. Work
top to bottom; do not skip the verification column.

## 0. The thing that blocks everything else

- [ ] 🛑 **Decide what to say about the solver.** All 51 solution files carry
      `authored-approximation`. `/methodology` says so plainly, and the landing
      page derives its copy from the data — so if 2.8–2.10 land real solve
      output, both change on their own. **Do not hand-edit that copy to claim a
      solver.** It is the one claim a numerate audience will check, and the one
      the competitor cannot answer.

## 1. Stripe — live mode

| Step | Verify |
|---|---|
| Create the two products in **Live** mode | Price IDs differ from test mode. They are NOT interchangeable. |
| Set `STRIPE_SECRET_KEY` = `sk_live_…` | The build refuses `sk_test_` in production — see §6 |
| Set `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` to the LIVE ids | `/paywall` shows $39.99 and $119.99 |
| Add the webhook endpoint: `https://suitedpoker.com/api/stripe/webhook` | Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed` |
| Set `STRIPE_WEBHOOK_SECRET` from that endpoint | **The single most dangerous variable to get wrong**: payments succeed and access is never granted |
| Recreate the **billing portal configuration** in Live mode | Plan switching OFF. The monthly→yearly upgrade is `/api/stripe/switch-plan`, so 7.5's save offer stays measurable |
| Make one real purchase with a real card, then refund it | The webhook lands, `/welcome` admits within seconds, the receipt email arrives |

Full detail: [`docs/STRIPE-SETUP.md`](./STRIPE-SETUP.md).

## 1b. Upstash Redis — a launch blocker

Without it the app uses an in-memory store, and on serverless each invocation
has its own memory: `/api/drills/next` writes the spot seed into one instance
and `/api/drills/answer` reads from another. **The drill loop returns
`spot_not_found` for everyone.** It also disables rate limiting, the AI budget
circuit breaker, and the AI cache.

```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

`npm run check:redis` proves it works rather than that it is set. Full steps and
the capacity arithmetic: [`docs/REDIS-SETUP.md`](./REDIS-SETUP.md).

## 2. Domain and DNS

- [ ] `suitedpoker.com` and `www` both resolve to Vercel; www redirects to apex
- [ ] `NEXT_PUBLIC_SITE_URL=https://suitedpoker.com` — **no trailing slash**
- [ ] Resend domain verified: SPF, DKIM, and MX all green
- [ ] DMARC at `p=none` and reports arriving. Do not start at `p=reject` — see
      [`docs/EMAIL-SETUP.md`](./EMAIL-SETUP.md)
- [ ] `help@suitedpoker.com` is a real inbox a person reads

## 3. Meta

- [ ] `NEXT_PUBLIC_META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN` set
- [ ] 🔴 **`META_TEST_EVENT_CODE` REMOVED.** With it set, every conversion goes
      to the test panel and none is reported. The build refuses it in production
- [ ] Walk the funnel and confirm each event in Events Manager
- [ ] **Purchase appears ONCE with both "Browser" and "Server" against it.** Two
      separate rows means the event ids did not match and every CAC is half real
- [ ] Diary note: **check Event Match Quality is at least "Good" 72 hours after
      first spend.** It cannot be verified before launch

Full detail: [`docs/META-SETUP.md`](./META-SETUP.md).

## 4. Crons

Add to `vercel.json`, and set `CRON_SECRET`:

```json
{
  "crons": [
    { "path": "/api/daily/generate", "schedule": "0 0 * * *" },
    { "path": "/api/email/dunning", "schedule": "0 15 * * *" },
    { "path": "/api/meta/retry", "schedule": "*/15 * * * *" }
  ]
}
```

All three fail closed without `CRON_SECRET`.

## 5. Monitoring

- [ ] Uptime monitor on `https://suitedpoker.com/` (expect 200)
- [ ] Uptime monitor on `https://suitedpoker.com/api/health` — **it returns 503
      when the database or Stripe is unreachable**, so alert on non-200 rather
      than on a body match
- [ ] Stripe dashboard → Webhooks → alert on delivery failures
- [ ] Supabase point-in-time recovery ON
- [ ] `ALERT_WEBHOOK_URL` set, so the AI budget breaker can reach you at 80%
      and 100% of `AI_DAILY_BUDGET_USD`

## 5b. The complete Vercel environment

`.env.local` never leaves the laptop — it is gitignored, and Vercel builds from
GitHub. Every secret needs a second copy in the Vercel dashboard
(Settings → Environment Variables), set for **Production**, **Preview** and
**Development**. Vercel does not rebuild on an env change, so redeploy after.

| Variable | Where it comes from | Status |
|---|---|---|
| `DATABASE_URL` | Supabase → Settings → Database | have it |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | have it |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | have it |
| `SUPABASE_SERVICE_ROLE_KEY` | same | have it |
| `NEXT_PUBLIC_SITE_URL` | `https://suitedpoker.com`, no trailing slash | have it |
| `UPSTASH_REDIS_REST_URL` | Upstash → REST API | have it |
| `UPSTASH_REDIS_REST_TOKEN` | same | have it |
| `CRON_SECRET` | `openssl rand -hex 32` | **generate** |
| `STRIPE_SECRET_KEY` | Stripe **live** mode | **live mode** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe live mode | **live mode** |
| `STRIPE_WEBHOOK_SECRET` | the live webhook endpoint | **live mode** |
| `STRIPE_PRICE_MONTHLY` / `_ANNUAL` | the live products | **live mode** |
| `RESEND_API_KEY` | Resend, after domain verification | **needed** |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project | **needed** |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Events Manager | **needed** |
| `META_CAPI_ACCESS_TOKEN` | same, system user token | **needed** |
| `ADMIN_EMAILS` | your email — empty means /admin/costs 404s for everyone | **needed** |
| `AI_DAILY_BUDGET_USD` | optional, defaults to 25 | optional |
| `ALERT_WEBHOOK_URL` | Slack/Discord, for the budget breaker | optional |

**Do NOT set** `META_TEST_EVENT_CODE` or `DEV_BYPASS_ENTITLEMENT=true` in
production — the build refuses both.

Faster than the dashboard for a batch, once `vercel link` has been run:

```bash
vercel env add UPSTASH_REDIS_REST_URL production
```

**Production deploys stay red until Stripe live mode is done**, because the gate
rejects test keys. Preview deploys are unaffected — use a preview URL to verify
everything else first.

## 6. The build gate

`next.config.ts` refuses a **production** deploy that is missing any of:

`DATABASE_URL` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` ·
`SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_SITE_URL` · `STRIPE_SECRET_KEY` ·
`STRIPE_WEBHOOK_SECRET` · `STRIPE_PRICE_MONTHLY` · `STRIPE_PRICE_ANNUAL` ·
`CRON_SECRET`

…or that still carries a test-mode Stripe key, a Meta test event code, or
`DEV_BYPASS_ENTITLEMENT=true`. Preview deploys are unaffected.

Verify it works before you rely on it:

```bash
VERCEL_ENV=production npm run build
```

## 6b. Upstash — upgrade BEFORE the first ad, not after traction

Staying on the free tier during beta is fine and correct: a handful of users
will not come close to the daily command limit.

The trap is the timing. The drill loop uses roughly **8 Redis commands per
hand**, so a 10,000/day allowance is about **1,250 hands a day across all
users** — say 25 people doing a 50-hand session. Traction and the cap arrive on
the *same day*, and the failure mode is not a slow page: `getSession` returns
null, `/api/drills/answer` returns `spot_not_found`, and **every user loses the
ability to answer a hand at once.**

- [ ] Upstash moved off Free Tier **before** the first dollar of ad spend
- [ ] Uptime monitor on `/api/health` — it reports `redis: "down"` when the
      quota is exhausted, which is the only warning you will get

## 7. The last checks before you spend a dollar

- [ ] `npm run verify` green
- [ ] `npm run mutation` — **6/6 caught.** Proves the suite fails when the
      entitlement boundary is broken, rather than merely passing
- [ ] `npx playwright test` green at both viewports
- [ ] `npm run test:stripe` against **test** keys (never live)
- [ ] `npm run test:chat` — read the 25 exchanges, do not just check the tick
- [ ] Lighthouse mobile on the landing page: 90+ on all four
- [ ] Move e2e to a **second Supabase project**. Test users currently land in
      the production auth table and will corrupt every signup metric you are
      about to pay for

## Rollback

1. **Vercel → Deployments → the previous build → Promote to Production.** Takes
   about thirty seconds and is always the first move.
2. If the bad deploy took payments, do **not** roll back the database —
   subscriptions written by the webhook are correct regardless of app version.
3. If a migration is implicated: Supabase → Database → point-in-time recovery.
   Restore to a moment BEFORE the migration, then re-promote.
4. If Stripe is the problem, disable the webhook endpoint in the Stripe
   dashboard rather than deleting it. Stripe retries for 3 days, so re-enabling
   it replays what was missed.
5. Tell anyone who paid during the window. A refund offered before it is asked
   for is a customer kept.
