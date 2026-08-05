# PostHog insights

Exact configuration for the five insights 8.1 specifies. Build them in the
PostHog UI; each heading is the insight name to use.

Setup first: **Project settings → Toolbar/Authorized URLs** must include
`https://suitedpoker.com` and `http://localhost:3000`, or session replay and the
toolbar will not attach.

All events are captured through `/ingest` on our own origin — if you ever see
volume drop sharply with no product change, check the rewrite in
`next.config.ts` before you believe the drop.

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
