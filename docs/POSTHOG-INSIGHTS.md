# PostHog insights

> **The funnel and feature dashboard are now built by
> `npm run posthog:setup`, not by hand.**
>
> The script owns the "Funnel & feature usage" dashboard and its six insights.
> It matches by name and PATCHes, so it is safe to re-run, and a hand-edit in
> the PostHog UI is overwritten on the next run — change the script instead.
> Every event it references is checked against `EVENT_NAMES` before any request
> is sent, so renaming an event in `analytics.ts` fails the script loudly rather
> than leaving a chart that silently reads zero.
>
>     npm run posthog:setup           create or update everything
>     npm run posthog:setup -- --dry  print the plan, write nothing
>
> Needs `POSTHOG_PERSONAL_API_KEY` in `.env.local` with `insight:write`,
> `dashboard:write` and `query:read`. The project is resolved by matching
> `NEXT_PUBLIC_POSTHOG_KEY`, never a hardcoded id — the organisation has three
> projects and two of them are other products.
>
> The sections below are the ORIGINAL 8.1 hand-build specification, kept as the
> reasoning behind each insight. Where they disagree with the script, the script
> is what exists.

## Three things that made the funnel read zero

Found by executing the funnel rather than by looking at the event list, where
every one of these looks perfectly healthy:

1. **The client was never identified as the Supabase user.** Client captures
   carried PostHog's device id, `captureServer` carried the user id, and nothing
   merged them — so `paywall_viewed` and the `purchase_completed` it led to
   belonged to two different PERSONS and no funnel containing both could ever
   complete. `identify()` was called only in the login form, so anyone who
   signed up and bought in one session was anonymous throughout.
   `AnalyticsIdentity` in the `(app)` layout fixes it, on the same "first
   authenticated render" hook as `captureAttributionOnce`.
2. **`signup_completed` had never fired, once.** `signInWithOAuth` navigates the
   browser away mid-call, so the capture after it in `google-button.tsx` is
   unreachable. It fires from `/auth/callback` now, server-side, gated on the
   Google provider — an email confirmation lands on that same route and would
   otherwise be double-counted against the form's own capture.
3. **`checkout_abandoned` was in the schema and wired nowhere.** It fires on
   Stripe's return now, and the plan rides back on `cancel_url`. It only ever
   catches the BACK BUTTON — a closed tab never returns — so read it alongside
   `checkout_started`, not on its own.

Setup first: **Project settings → Toolbar/Authorized URLs** must include
`https://suitedpoker.com` and `http://localhost:3000`, or session replay and the
toolbar will not attach.

All events are captured through `/ingest` on our own origin — if you ever see
volume drop sharply with no product change, check the rewrite in
`next.config.ts` before you believe the drop.

**Verifying the stream.** `tests/e2e/analytics.spec.ts` reads what actually
reaches `/ingest`. It must run HEADED — posthog-js's `_is_bot()` drops every
capture when the user agent says "HeadlessChrome" — and the spec masks
`navigator.webdriver`, which is set under Playwright either way:

    PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 PWHEADED=1 \
      npx playwright test tests/e2e/analytics.spec.ts --headed

8/8 on desktop-chrome and 8/8 on mobile-safari.

---

## 1. Acquisition funnel

**Type:** Funnel · **Insight name:** `Acquisition funnel`

| Step | Event |
|---|---|
| 1 | `landing_viewed` |
| 2 | `signup_started` |
| 3 | `signup_completed` |
| 4 | `onboarding_completed` |
| 5 | `paywall_viewed` |
| 6 | `purchase_completed` |

- **Conversion window:** 7 days
- **Order:** Sequential
- **Step order:** Strict — `landing_viewed` → `signup_started` must not be
  satisfied by someone who signed up first and browsed later.
- **Breakdown:** `$initial_utm_source`
- **Chart:** Steps, with "Show conversion time" on

Watch step 4→5 hardest. Anyone who completes onboarding and never sees the
paywall is a routing bug, not a drop-off.

---

## 2. Onboarding drop-off by question

**Type:** Funnel · **Insight name:** `Onboarding drop-off by question`

| Step | Event | Filter |
|---|---|---|
| 1 | `onboarding_started` | — |
| 2 | `onboarding_question_answered` | `index` = 0 |
| 3 | `onboarding_question_answered` | `index` = 1 |
| 4 | `onboarding_question_answered` | `index` = 2 |
| 5 | `onboarding_question_answered` | `index` = 3 |
| 6 | `onboarding_question_answered` | `index` = 4 |
| 7 | `onboarding_completed` | — |

- **Conversion window:** 1 hour — onboarding is one sitting; a 7-day window
  would hide a user who bounced and came back, which is a different behaviour.
- **Breakdown:** `question`

This is the insight most likely to pay for itself. A single question losing 30%
is worth more to fix than anything downstream of it.

---

## 3. D1 / D7 / D30 retention

**Type:** Retention · **Insight name:** `Retention by signup cohort`

- **Cohortising event:** `signup_completed` (First time)
- **Returning event:** `drill_answered` (Recurring)
- **Retention type:** Recurring, not "first time" — the question is whether they
  keep coming back, not whether they ever returned once.
- **Period:** Day, 30 periods
- **Breakdown:** none at first; add `skillTier` once volume allows

Use `drill_answered` rather than `$pageview` as the returning event. A user who
opens the app and does nothing has not retained, and counting them makes the
number flattering and useless.

---

## 4. Retention correlated with early behaviour

**Type:** Retention, one per hypothesis · **Insight names:**
`Retention — completed first lesson`, `Retention — 3+ dailies`,
`Retention — rating gain wk1`

Build the three cohorts first, under **Cohorts → New cohort**:

| Cohort | Definition |
|---|---|
| `Completed first lesson` | Performed `lesson_completed` ≥ 1 time in the first 7 days after `signup_completed` |
| `Played 3+ dailies` | Performed `daily_completed` ≥ 3 times in the first 7 days |
| `Rating gain week 1` | Performed `rating_tier_changed` ≥ 1 time in the first 7 days |

Then, for each: the retention insight from §3 with **Filter → Cohort =** that
cohort, and compare against the unfiltered baseline.

**This is the one that tells you what to build.** If "played 3+ dailies" retains
at double the baseline, the daily challenge is the product and everything else
is supporting it. Do not average these together — the point is the gap between
them.

---

## 5. Revenue by acquisition source

**Type:** Trends · **Insight name:** `Revenue by source`

- **Series:** `purchase_completed`
- **Measure:** Property value → `revenue` → Sum
- **Breakdown:** `$initial_utm_source`
- **Interval:** Week
- **Chart:** Bar

Add a second series with **Measure = Total count**, breakdown the same, so
revenue and purchase count sit side by side. A source with high revenue and low
count is selling yearly plans; that is a different channel strategy from one
selling monthly.

> `purchase_completed` is captured **server-side** from the Stripe webhook, with
> the user's id as the distinct id. If it ever appears attributed to an
> anonymous id, revenue-by-source is silently wrong — check
> `captureServer()` in `src/lib/analytics-server.ts` before trusting this chart.
