# Funnel check — prompt for a browser AI

Paste the block below into a browser-based AI agent (Comet, Claude in Chrome,
an Operator-style tool). It walks the paid-ads funnel as a real user and reports
where the drop-offs are.

## Before you run it

- **Use a REAL browser, not a headless one.** PostHog's SDK blocks captures from
  automated browsers, so a Playwright/Puppeteer run produces zero events and
  reads as a totally dead funnel. Verified: identical page, real browser →
  events land; headless → nothing. This is a property of PostHog, not a bug in
  the app.
- **Events flush on NAVIGATION, not on capture.** posthog-js queues them. If you
  stop on the paywall and immediately check PostHog you will see nothing — click
  through to one more page, or close the tab, then wait ~30 seconds.
- Use a **fresh incognito window** each run, or the quiz resumes from
  localStorage and the funnel starts halfway through.
- Every run creates a real account. Use a disposable address you can find again.

---

## The prompt

```
You are testing the signup funnel of a poker training web app. Walk it end to
end as a first-time user arriving from a Facebook ad, and report exactly where a
real person would get confused, stuck, or bored enough to leave.

START HERE (this exact URL, including the query string):
https://suitedpoker.com/start?utm_source=meta&utm_medium=paid&utm_campaign=funnel-audit

Use a fresh incognito window. When asked to create an account, use:
  email:    <PUT A DISPOSABLE EMAIL HERE>
  password: <PUT A PASSWORD HERE>

THE PATH YOU SHOULD SEE — flag any deviation as a bug:

  1. /start          A headline, then 4 questions, one per screen.
                     Q1-Q3 are single-choice and should ADVANCE BY
                     THEMSELVES after one tap — no Continue button.
                     Q4 is multi-select and DOES have a Continue button.
                     A progress bar reads 1/4 … 4/4 and must never skip or
                     go backwards.
  2. Still on /start: "Try one hand." — a poker table with ace-king suited
                     on the button and Fold / Call / Raise. Whatever you tap
                     gets an instant written verdict and a Continue button.
                     There is no progress bar on this screen.
  3. /signup?from=start   Email + password. No other fields.
  4. /paywall        Your personalised plan, then Yearly / Monthly pricing.

DO ALL OF THIS:

  A. Walk 1 → 4 choosing "I call too much and lose" and any answers after
     that. At the example hand, press CALL and read the verdict.
  C. Stop at the paywall. DO NOT enter card details or complete a purchase.
  D. Then go back and run it a SECOND time in a new incognito window, but this
     time press RAISE on the example hand. Confirm the verdict says it is
     right and you still reach signup and the paywall.

REPORT, in this order:

  1. A numbered list of every screen you saw, with the URL and how many seconds
     you spent on it.
  2. DROP-OFF RISK: for each screen, rate 1-5 how likely a real beginner is to
     quit there, and say why in one sentence. Be blunt.
  3. Any screen where you did not know what to do next, or had to re-read
     something to understand it.
  4. Any number, word, or claim that seemed wrong, confusing, or unbelievable.
     Amounts are shown as plain numbers (chips) — "Pot 26", "opens 5", stacks of
     200. Flag anywhere a unit is missing in a way that made you pause, or
     anywhere you saw "bb" or "big blinds" still used as a unit.
  5. Anything that looked visually broken: text cut off, overlapping, a control
     too small to tap, a heading sitting much lower or higher than on the
     screens either side of it.
  6. Whether the four suggested questions were the ones YOU actually wanted to
     ask, and whether the answers satisfied you.
  7. The single change you would make to increase the number of people who
     reach the paywall.

Do not complete a purchase. Do not enter payment details.
```

---

## Reading the drop-offs in PostHog afterwards

Project: **Suited Poker** (`546559`). There are three projects on the account
and the other two belong to different apps — pick the right one or you will read
a healthy funnel as dead.

Build the funnel from these events, in order:

| # | Event | Fires when |
|---|---|---|
| 1 | `$pageview` | any route, captured manually per navigation |
| 2 | `onboarding_started` | the quiz mounts (`entry: "start"` for ads, `"app"` for organic) |
| 3 | `onboarding_question_answered` | **per question** — `index` 1-8. This is the drop-off instrument |
| 4 | `signup_started` / `signup_completed` | the account form |
| 5 | `$identify` | the anonymous quiz session merges with the new user |
| 6 | `onboarding_completed` | answers committed to the profile |
| 7 | `demo_hand_shown` / `demo_hand_answered` | the hand |
| 8 | `demo_hand_question_asked` | a mini-chat question (`source: chip｜typed`) |
| 9 | `demo_hand_completed` | leaving the hand screen (`secondsAdded`) |
| 10 | `paywall_viewed` → `checkout_started` → `purchase_completed` | the wall |

**Break `onboarding_question_answered` down by `index`** — that is the per-question
drop-off curve, and it is the one number that tells you which question is losing
people. Break the whole funnel by `utm_source` / `utm_campaign` to separate ad
traffic from everything else.

`$identify` at step 5 is load-bearing: without it the anonymous quiz and the
signed-up user are two different people and any funnel spanning both reads 0%.
It is wired and firing.

## Known gaps

- **PostHog is not environment-gated.** Local dev, e2e runs and
  `npm run screenshots` all write into this same project. Filter your funnel to
  the production host, or gate on `VERCEL_ENV` first — the Meta pixel already
  does exactly that in `src/lib/meta.ts`.
- `checkout_abandoned` has never fired; it needs someone to press back on
  Stripe's own page.
