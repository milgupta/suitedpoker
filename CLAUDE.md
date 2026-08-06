# SuitedPoker — working notes for Claude Code

Read this fully before touching anything.

## What this is

A GTO poker trainer for beginners. NLHE, 6-max cash, 100bb. Web app, mobile-first,
hard paywall at $39.99/mo or $149.99/yr.

It is built in numbered substages from `SUITEDPOKER_BUILD_PLAN.md` — **one substage
per session**. Start a fresh context for each one. Do not attempt several at once;
long contexts are where file paths get invented and earlier work gets silently
broken.

## Working in parallel

Several Claude Code instances may be running on this repo at once, each in its
own git worktree on its own branch. **If you are in a worktree, read
`PARALLEL.md` and stay inside your track's `owns` list.** Writing outside your
lane is how three agents produce one unmergeable mess.

**Every session, first thing: run `git branch -a` and `git worktree list`.**
If any branch other than `main` exists, there is unmerged work outstanding —
name it in your opening message and point at the merge-back procedure at the top
of `PARALLEL.md`. An unmerged branch that nobody mentions is how a week of engine
work quietly rots on a stale base.

## How a session works

1. Milan names a substage (e.g. "run 0.2").
2. **Read that substage in `SUITEDPOKER_BUILD_PLAN.md` first.** Its `▶ PROMPT`
   block is the spec. Its `✅ Done when` list is the acceptance criteria.
2b. **If the substage touches anything visual, read `DESIGN.md` too.** It is the
   source of truth for every color, radius, spacing value, type size, and motion
   token. Never invent one.
3. **Ask your questions now, before writing code.** See below.
4. Build it.
5. Run `npm run verify`.
6. Work through the `✅ Done when` list and report a **pass/fail table**. If
   anything fails, fix it and re-run. Never report a partial pass as done.
7. Commit with a message that names the substage.

## Ask before you build — this is expected of you

You are not being asked to execute a script. You are being asked to build
something good, and the plan is a strong default rather than scripture.

**Ask when:**

- A requirement is genuinely ambiguous. Do not pick an interpretation and hope —
  pick nothing and ask.
- A decision has a real trade-off Milan should own: a schema shape that is hard to
  change later, a UX choice that affects conversion, anything that costs money.
- The substage assumes something about the product that is not written down.

**Push back when:**

- You think the plan is wrong. Say so **before** building, explain what you would
  do instead and why, and let Milan decide. A plan written in advance cannot know
  what you learn while implementing.
- A substage's approach would create a problem two stages later.
- The acceptance criteria would not catch a shortcut you are tempted to take.
  Name the shortcut rather than taking it quietly.
- Something in the existing code is wrong. Do not build carefully on top of a bug.

**Do NOT ask when:**

- The answer is in `SUITEDPOKER_BUILD_PLAN.md`. Read it first.
- The answer is in the codebase. Go look.
- It is a normal engineering judgement call within the spec. Make it, and note
  what you chose in your summary.

**Batch your questions.** Ask everything at the start of a session in one message,
not a trickle of one-liners. Milan is usually doing something else between
sessions.

## Rules that are not negotiable

1. **`src/poker/**` is PURE TypeScript.** No React, no DB, no `next/*`, no network,
   no filesystem. Enforced by ESLint — it will fail the build. If a task seems to
   need a DB client in there, pass the data in as an argument. The design is
   wrong, not the rule.

2. **The AI never determines poker strategy.** Every solution — frequencies, EVs,
   the best action — is precomputed and stored. A model's only job is to explain
   ground truth it was handed. If model output ever contradicts the supplied data,
   that is a bug, not a style issue.

3. **Grading is server-side, always.** The client must never receive the strategy,
   the EV table, the correct action, or the node reference before the user acts.
   There are explicit tests for this. Do not weaken them.

4. **Mobile first.** Design at 390x844, then scale up. Minimum 44px touch targets.
   Most users arrive on a phone from an ad.

5. **No dollar-denominated results claims anywhere.** Not "won $X", not "+226%".
   bb/100 and accuracy only. This is an ad-account and compliance boundary, not a
   copy preference.

## Style

- TypeScript strict, `noUncheckedIndexedAccess` on. Array access returns
  `T | undefined` — that friction is deliberate in a hand evaluator.
- Prettier owns formatting. Do not hand-format.
- Comments explain *why*, never *what*.
- Prefer a named function over a clever one-liner in engine code.
- All visual values come from `DESIGN.md`. Blue is interface; green-to-red is
  grading; the two never borrow each other's range.

## Progress

| Substage | Status |
|---|---|
| 0.1 Repo, tooling, quality gate | done |
| marketing landing page, terms, privacy | done (ahead of 8.4, for Stripe verification) |
| `DESIGN.md` written from reference teardowns | done |
| 0.2 Design system and motion language | done — implements `DESIGN.md` |
| 0.3 Core UI component library | done |
| 0.4 Redis, caching, rate-limit primitives | done |
| 1.1 Supabase project and schema | done — applied and verified against live Supabase |
| 1.2 Auth flows | done — verified against live Supabase, Google OAuth live |
| 1.3 Entitlement scaffold and route gating | done — four gating states verified live |
| 2.1–2.3 Poker engine (Track C) | done — merged from `track/engine` |
| 2.5–2.7 Hand classes, spot generator, grading | done |
| 3.1 The poker table component | done |
| 8.1 PostHog and product analytics | done — schema + proxy shipped, **live stream unverified (no key)** |
| 3.2 Drill player: the core loop | done |
| 3.3 Rating system and adaptive difficulty | done |
| 3.4 Daily challenge, streaks, leaderboard | done |
| 3.5 Range grid viewer | done |
| 3.6 Hand-history format and question types | done |
| 4.1 Gemini integration and prompt architecture | done — **20-spot adversarial run unverified (no Gemini key)** |
| 4.2 Hint system | done — 7 hint e2e green, 50-hint leak test green |
| 4.3 Post-hand explanation | done — streaming, 36-explanation matrix green |
| 7.3 Stripe setup and checkout | code + paywall done — ⚠️ **every Stripe-touching test is BLOCKED: `.env.local` holds LIVE keys** |
| 2.8, 2.9, 6.1 (Track C) | done — merged from `track/engine`, worktree removed |
| 7.1 Onboarding quiz | done — 20 e2e green, derivation table printed |
| 7.2 The diagnosis screen | done — 25-combo table green, 20 e2e green |

Stage 0 is complete. Update this table when you finish a substage.

**What 7.2 left you.**

- **`src/lib/diagnosis.ts` is pure and owns the cost model.** `BB_VALUE_USD`,
  `HANDS_PER_YEAR`, `LEAK_BB100` are the only inputs; the tooltip prints the
  same arithmetic the headline used, and a test recomputes one from the other.
- **The dollar figure is a COST estimate, never a winning** — the plan draws
  this line explicitly, and it is the line that keeps the Meta ad account
  alive. A regex test runs every venue × pain × goal combination over every
  rendered string and fails on winnings framing. Do not add copy to the
  diagnosis without extending that scan.
- **Play-money and just-starting users NEVER see dollars** — `annualUsd` is
  null and the screen prints big blinds per year. Their `BB_VALUE_USD` is 0 on
  purpose; a fabricated $340 for a play-money user loses a numerate audience
  permanently.
- **Every one of the eight quiz answers moves the diagnosis**, and there is a
  per-question test asserting it. Q6 required adding `alsoFixing` (their own
  leak picks reflected back, primary excluded) — if you add a question to the
  quiz, wire it into the diagnosis or the test names it as dead weight.
- **The projection is "where the material sits", not a promised rating.**
  `CURRICULUM_CEILING_RATING = 1133` is difficulty 5 on the rating scale, and
  the caption on screen says exactly that.
- **The reveal is stage-delayed opacity, ~2.4s total.** Playwright counts
  `opacity: 0` as visible, so the e2e polls computed opacity — remember that
  when testing anything staged.
- **The paywall now pulls `leakBb100`/`leakLabel` from the profile** via
  `LEAK_BB100`/`LEAK_HEADLINE`, so the loss framing appears once a diagnosis
  exists (bb/100, never dollars, per rule 5).
- **iCloud vs `.next`:** deleting `.next` in place loses a race with iCloud
  sync recreating `name 2` duplicates mid-delete. `mv .next .next-trash-$$ &&
  rm -rf` in the background wins it; eslint/prettier now ignore
  `.next-trash-*`.

**What 7.1 left you.**

- **`src/lib/onboarding.ts` is pure and owns everything**: the eight questions,
  the option copy, the echo strings, and every derivation. The client renders
  it, the API route derives from it, the tests assert on it. Do not put quiz
  copy in the component.
- **Derivation is SERVER-side, on `complete: true`.** The client posts raw
  answers only. A client that could post its own skill tier and rating could
  post itself a rating it never earned, and difficulty targeting reads that
  number.
- **The skill-tier cap is one-directional** (`play_money` caps at `videos`,
  `starting` caps at `never`, nothing caps upward). Wrong-low costs a few easy
  spots the rating fixes in twenty hands; wrong-high makes a beginner's first
  session impossible and they don't return.
- **The study answers ARE the `SkillTier` values** (`never|videos|charts|solver`)
  — same vocabulary as `ExperienceAnswer` in rating.ts and the coach's tiers.
  The rating comes from `initialRatingFromOnboarding`, never a second table.
- **Progress is `index / TOTAL_STEPS` and nothing else.** Every competitor's bar
  skips or runs backwards because it was computed from something cleverer.
- **`ECHO_POINTS` enumerates every answer-echo**, and a test renders each one
  with and without its source answer. A missing echo silently degrades into
  "at your stakes" phrasing.
- **Q8 (`hand`, free text, max 500 chars) is stored for 4.x** — feed it into the
  coach's context for the user's first session. Nothing consumes it yet.
- **`--app-shell-py` in globals.css is the (app) layout's vertical padding.**
  The quiz fills `100dvh - 2*var(--app-shell-py)` to fit exactly one viewport;
  a hardcoded padding in two places is a scrollbar the day one changes.
- **Fixed in passing — the arena was CRASHING on every load.** `Card` is a
  branded number; `SpotView` stringified each one and fed it back through
  `cardsFromString`, which threw `not a card: "36"` and blanked the page into
  the error boundary. The security e2e passed the whole time because a crashed
  page contains no solution data. There is now a test asserting a hand actually
  renders. When testing a page, assert the SUCCESS state exists, not only that
  the failure state doesn't.
- **Login redirects in e2e get `timeout: 30_000`.** Under parallel workers the
  login→gate→render chain regularly takes ten seconds; the 5s default made real
  passes look like product failures.
- `/diagnosis` is a placeholder — 7.2 replaces it.

**What 7.3 left you.**

- 🛑 **`.env.local` contains LIVE Stripe keys** (`sk_live_`, `pk_live_`), not test
  keys. `tests/e2e/checkout.spec.ts` refuses to run on anything but `sk_test_`
  and skips with a loud message, because those tests complete real purchases and
  open real subscriptions. Nothing in 7.3 has been verified against Stripe. Swap
  in test-mode keys AND test-mode price ids — price ids differ between modes —
  then run `npx playwright test tests/e2e/checkout.spec.ts`.
- **Price ids are server-only** (`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`).
  The old `NEXT_PUBLIC_STRIPE_PRICE_*` vars are gone. The client sends
  `plan: "monthly" | "annual"` and the server picks the price; a client that can
  name its own price can name a cheap one. A test asserts no `PRICE` key reaches
  `clientEnv`.
- **The plan vocabulary is `monthly | annual` everywhere** — the Stripe products,
  the env vars, `PlanId`, and the analytics `Plan` type, which was `yearly`.
  One vocabulary, because two is how a funnel ends up split across two labels.
- **`ensureCustomer()` searches Stripe by `metadata.userId` before creating.**
  The database lookup is first, but if that row is ever lost, creating a fresh
  customer would give one person two — which splits billing history and breaks
  the portal. The row is written BEFORE checkout with no status, which the
  entitlement rule reads as "not entitled", so it cannot let anyone in early.
- **Checkout and portal use `withAuth`, NOT `withEntitlement`.** The person
  hitting them is by definition unsubscribed, or has a failed card.
- **Plan switching is disabled in the Stripe portal on purpose.** The only
  plan-change path is `/api/stripe/switch-plan`, monthly→annual only, because
  7.5 uses it as a save offer and its conversion has to be measurable.
- **The plan's "$340 a year leak" loss framing was NOT implemented as written.**
  A dollar figure attached to a poker result violates the non-negotiable rule 5
  and the AI content rules. The paywall states the leak in bb/100 instead, and an
  e2e asserts no dollar-denominated results claim appears on the page. Prices in
  dollars are fine — those are prices, not results.
- **The diagnosis scrim is a slot** (`PaywallClient`'s `diagnosis` prop). 7.2
  fills it; until then the page opens on the benefits rather than an empty box.
- **Do not put `.tap-target` on a large control.** Its `::before` overlay sits on
  top of the element's own children — on the plan card it intercepted clicks to
  the radio inside it. The class is for controls smaller than 44px.
- Dashboard checklist: `docs/STRIPE-SETUP.md`.

**What 4.3 left you.**

- **The stream is SENTENCE-GATED, and that is a correctness decision.** A
  sentence is held until it is complete, checked by `redact()` against the ground
  truth, and only then emitted. Token-by-token streaming would put a wrong claim
  on screen and retract it 200ms later — worse than not streaming at all in a
  product whose whole claim is accuracy. Do not "optimise" this to per-token.
- **The wire format is NDJSON with three event kinds:** `text`, `reset`, `done`.
  `reset` means discard everything received so far; the client must honour it or
  a redacted explanation stays on screen.
- **`shouldAutoExplain()` in `src/lib/explain-policy.ts` is where ~60% of the AI
  bill is decided.** `best` and `solid` never open a stream — they get the
  template line plus a "Why?" button. `sharp` always does. One copy, imported by
  both the client and the tests; a second copy on the server is how the bill
  quietly doubles.
- **`skillTier` is a typed union, not a string** (`never | videos | charts |
  solver`), and it is the same vocabulary as `ExperienceAnswer` in `rating.ts`.
  7.1 must write one of those four. `tierOf()` narrows anything else to `never`,
  the zero-jargon end — being wrong towards "explain everything" is the right way
  to be wrong.
- **`templateExplanation()` is tier-aware and grade-aware.** With no Gemini key
  it is not a stub, it is the product: it says "wins the most in the long run"
  rather than "highest-EV" to a beginner, praises a `sharp` specifically, and
  leads a `blunder` with the strategy rather than the criticism.
- **`PROMPT_VERSION` is now `v2`.** It is part of the cache key. Editing a prompt
  without bumping it serves stale explanations for thirty days.
- **Route-warming in `tests/e2e/explain.spec.ts` `beforeAll` is load-bearing.**
  The first hit on a route pays ~9s for Turbopack to compile it, which blows past
  the request timeout in whichever parallel test arrives first.
- ⚠️ **Two e2e tests are flaky under full-suite load** and pass in isolation:
  the 169-cell reveal timing in `ranges.spec.ts`, and the signup test in
  `auth.spec.ts` (which is supposed to skip loudly when Supabase's SMTP budget is
  gone, but times out instead). Neither is a 4.x regression. The signup skip
  detection is worth fixing when 7.3's Resend work lands.

**What 4.2 left you.**

- **`src/lib/hints.ts` is pure and holds the fallback.** With no Gemini key every
  hint comes from these templates, so they are the product, not a stub. They are
  poker-accurate on purpose: `OPENS_TIGHT` (UTG, MP) and `BEHIND` are kept as
  separate facts because CO has players behind it and still opens wide, and
  conflating them produced a fluent, wrong hint.
- **Levels 1 and 2 may not name ANY action.** `tests/unit/hints.test.ts` runs 50
  real generated spots through both the guard and an independent regex, and
  prints all 50 so they can be read. If you add a template, that test is the gate.
- **The hint level lives on the drill session, never in the request body.** The
  answer route computes the rating penalty from `stored.hints`, and the client's
  `hintsUsed` is analytics only. There is an e2e that sends `hintsUsed: 0` after
  taking three hints and asserts the server still says 3.
- **`RULES.COACH_HINT.limit` must stay strictly above `RULES.HINTS_DAILY.limit`.**
  Both were 20, so the burst guard fired first and the user got a 429 where the
  product promised "20 hints left today". There is now a test asserting the
  ordering.
- **Level repeats are free.** A re-request of a level already served comes from
  the session, costs no model call and no budget — the UI keeps all levels on
  screen, so a refresh must not be charged.
- **Playwright now runs 2 workers locally** (`playwright.config.ts`). At the
  default count Supabase's auth rate limiting refuses sign-ins and about a dozen
  unrelated tests fail in ways that look like product bugs.
- **Fixed in passing:** `tests/e2e/auth.spec.ts` had been red since 1.3 — it
  created unsubscribed users and expected `/dashboard`, which correctly redirects
  to `/paywall` now. Its users get a subscription so the file tests auth only.

**What 4.1 left you.**

- **`src/lib/ai/redact.ts` is the guarantee; the prompt is only the request.**
  Anything that consumes model output must route through `redact()` (post-
  decision) or `redactHint()` (pre-decision). A new AI surface that calls
  `generateCoached()` directly and renders the text is a bug, however good the
  prompt is.
- **`redact()` is deliberately narrow.** It trips only on a *prescriptive*
  statement naming a non-best action, and only when `displayMode === "clear"`.
  Mentioning another action is allowed — "folding is close here" is exactly what
  a mixed spot needs to say, and a guard that blocked it would gut the coach on
  the spots that matter most. Do not widen it into a keyword blocklist.
- **`redactHint()` levels 1 and 2 may not name ANY legal action.** A hint fires
  before the user acts. 4.2 builds on this; do not relax it for fluency.
- **The cache key includes `PROMPT_VERSION`.** Editing a prompt in `prompts.ts`
  without bumping the version serves stale explanations for 30 days. Bump it.
- **Only clean output is cached.** Caching a redacted explanation would serve the
  template to everyone hitting that spot for a month. There is a test.
- **`GOOGLE_GENERATIVE_AI_API_KEY` is empty in `.env.local`.** Everything
  degrades to `templateExplanation()`, which is a true (if plainer) explanation
  built from the same solution data — not an error path. The 20-spot adversarial
  run in `tests/unit/coach-live.test.ts` **has never executed**; it skips loudly
  and must be run once a key exists, before the coach is shown to a paying user.
- **Cost, from the published Flash rates:** $0.00007 per explanation
  (420 in / 70 out) → **$420/month** at 10,000 users × 50 drills/day with a 60%
  cache hit rate, $1,050 at 0%. Computed in `tests/unit/coach.test.ts` from the
  same constants the code prices with, so it cannot drift.

**What 1.1 left you.**

- **Migration applied and verified live**: 21 tables, RLS on every one, 41
  policies, 10 FKs to `auth.users`, the `handle_new_user` trigger, and the
  cross-user security test passing against real Supabase.
- **`npm run test:rls` must be re-run whenever a policy changes.** It is not in
  `npm run verify`, because it needs credentials CI does not have. The static
  audit in `tests/unit/rls-policy.test.ts` runs everywhere but only proves the
  policies were *written*.
- **`@next/env` skips `.env.local` when `NODE_ENV=test`** — which Vitest sets.
  Any test needing real credentials must call `loadLocalEnv()` from
  `tests/support/load-local-env.ts`, or it will silently skip forever.
- **`getDb()` bypasses RLS** — it connects as the database owner. Use it for
  grading, seeding and webhooks. Anything acting on behalf of a user goes
  through the Supabase client so policies apply.
- Dev user: `dev@suitedpoker.com` / `devpassword123`, onboarding complete.

**What 1.2 left you.**

- **`middleware.ts` must live in `src/`**, not the repo root, because the app
  uses a `src` directory. At the root it is silently ignored — the app still
  works because the `(app)` layout guards too, but the `?next=` redirect and
  the session refresh both vanish.
- **Auth has two callback paths.** `/auth/callback` exchanges a PKCE `?code=`
  server-side. `/auth/confirm` handles the implicit flow, where tokens arrive
  in the URL *fragment* — which the server can never see. Admin-generated links
  always take the second path.
- **Never render `<Button asChild>` with more than one child.** Radix's Slot
  needs exactly one element, and a silent crash blanks the whole page.
- **`getUser()`, never `getSession()`, on the server.** getSession trusts the
  cookie without verifying it.
- **Supabase's built-in SMTP is rate-limited to a few emails an hour.** The
  signup e2e skips loudly when that budget is gone rather than going green.
  Resend (7.3) fixes this properly.
- **Before spending on ads, move e2e to a second Supabase project.** Test users
  land in the production auth table and will corrupt signup metrics.

**What 1.3 left you.**

- **Every authenticated API route uses `withAuth` or `withEntitlement`.** No
  route rolls its own check. 401 = log in, 402 = subscribe, never 403.
- **The entitlement rule lives in `entitlement-rule.ts` and has no I/O**, so
  middleware (Edge) and the cached server path evaluate the same predicate and
  cannot drift.
- **Middleware is UX, not security.** It runs the check without the Redis cache
  because Edge cannot reach the node clients; API routes re-check server-side.
- **`/onboarding`, `/welcome`, `/paywall` and `/account` are exempt** from the
  entitlement gate. Gating onboarding traps every new signup; gating `/welcome`
  bounces a user whose Stripe webhook has not landed yet.
- **`middleware.ts` is now `src/proxy.ts`** — Next 16 deprecated the middleware
  convention.
- **Folders under `src/app` starting with `_` are never routed.** A probe route
  there silently 404s.

**What 3.1 left you.**

- **The table is a glowing elliptical RING, never a filled surface.** A felt
  oval fights every piece of data placed on it; a stroke on near-black keeps
  the board cards the brightest objects on screen.
- **Four-colour deck has its own tokens** (`--color-suit-*`). They are NOT the
  grade ramp and must never be mixed with it — a card is red because it is a
  heart, never because the play was bad.
- **Suit pips are SVG paths, not unicode.** ♠♥♦♣ get emoji-fied on Android and
  become unreadable at 24px.
- **Board layout is 3-over-2, not a row of five.** At 390px a row of five is
  either too small to read or too wide to fit. Undealt cards render as dimmed
  backs so a runout never shifts layout.
- **Seats carry `data-seat` / `data-folded`** so tests can assert on state
  without scraping class names.
- **Styleguide table states are driven by `legalActions`**, never by scripted
  action lists — a hand-written sequence goes stale and throws at build time.

**What 8.1 left you.**

- **No raw event names anywhere.** Every capture goes through the typed schema
  in `src/lib/analytics.ts`; a test fails the build on a direct `posthog.capture`
  or an unknown name.
- **PostHog is proxied through `/ingest`** on our own origin. Adblockers block
  posthog.com by hostname, and the users most likely to try a poker tool are the
  most likely to run one. If volume drops sharply with no product change, check
  the rewrite before believing the drop.
- **Pageviews are captured manually.** The App Router does not reload between
  routes, so PostHog's automatic pageview fires once and never again.
- **`purchase_completed` must be captured SERVER-side** with the user's id.
  Attributed to an anonymous id, revenue-by-source is silently wrong.
- ⚠️ **`NEXT_PUBLIC_POSTHOG_KEY` is empty**, so the client never initialises and
  the six event-stream e2e tests skip. Add the key and run
  `npx playwright test tests/e2e/analytics.spec.ts` to verify the real stream.
- Insight configurations are in `docs/POSTHOG-INSIGHTS.md`.

**What 3.2 left you.**

- **`/api/drills/next` returns a `ClientSpot` and nothing else.** No strategy,
  no EV, no `nodeRef` — without the nodeRef the client cannot even identify the
  node, so it cannot look the answer up. Structural tests enforce the key
  allowlist; do not add a field to that response without re-reading them.
- **Never grade client-side.** The seed is stored server-side, the spot is
  regenerated from it, and the nodeRef is compared before grading.
- **A spot can be answered once.** It is burned before the row is written, so a
  resubmit loses rather than double-counting.
- **`CLEAR_GAP` is derived from `INACCURACY_FROM`**, never set independently.
  They were 0.3 and 0.5, which made the panel print a definitive "Fold." while
  grading the alternative "Solid" — a contradiction a beginner cannot
  reconcile. `tests/unit/drill-display.test.ts` guards it across 1,000 spots.
- **`buildArenaLink()` is the only way to build an /arena URL.** 3.3, 3.5, 5.2
  and 5.3 all launch pre-configured sessions; an invalid preset falls back to
  the endless session rather than erroring, because that value arrives in a
  shared URL.
- **FrequencyBar takes every colour from `evColor()`.** Width is frequency,
  colour is EV loss — a hardcoded colour there decouples the bar from the
  grading language.

**What 3.3 left you.**

- **`initialRatingFromOnboarding()` is imported by 7.1, never duplicated.** Two
  copies of a placement table is how a first session gets calibrated against a
  number nothing else agrees with.
- **`sharp` scores the same as `best`.** It is recognition, not rating —
  inflating from a cosmetic grade would quietly break difficulty targeting,
  which is what the rating actually drives.
- **Anti-tilt: three consecutive wrong answers drop the target 150.** Beginners
  quit when they feel stupid, and beginners are the whole audience.
- **Leak targeting fires ~30% of the time and the UI must say so.** Silently
  feeding someone their worst spot reads as the app being unfair.
- Glicko is verified against the worked example in Glickman's paper
  (1500/200 → 1464.1/151.4) and converges within ±50 over 10,000 attempts.

**What 3.4 left you.**

- **`localDay()` in `src/lib/local-day.ts` is the ONLY answer to "what day is
  it for this user".** The rate limiter and the streak both use it. Two
  implementations is how an LA user loses a streak to a UTC rollover while
  their budget resets an hour later.
- **One attempt per daily spot is a DATABASE constraint**, not an application
  check — `UNIQUE(result_id, spot_index)`. An app check loses the concurrency
  race, and there is an e2e that fires two simultaneous answers to prove it.
- **The daily is rebuilt with `buildDailySpots()`, never spot-by-spot.** It
  threads an accumulating `excludeNodeRefs` through the five, so regenerating
  one spot from its seed alone yields a different node.
- **The streak freeze must be announced.** An unannounced save teaches nothing;
  an announced one is the moment the user feels looked after.
- **The share grid is spoiler-free by construction** — grades only, no
  position, hand, action, board or EV. A test asserts each of those absent.

**What 3.5 left you.**

- **`/api/ranges` DOES return strategy and EV, deliberately.** The browser is a
  reference tool for entitled users; a player looking up their own practice hand
  is allowed to. The drill payload is a different endpoint with a different
  contract. Read the reasoning block in `0001_auth_fks_rls.sql` before
  "hardening" it.
- **`cellBands()` is pure and exported** so "fills match the frequencies" is
  arithmetic in a unit test rather than a pixel measurement.
- **The grid uses the accent ramp, never the grade ramp.** Reference data is
  not a graded decision.
- **The 169-cell reveal is capped at 300ms** via `staggerDelay`, and an e2e
  reads the real animation timings to prove it.

**What 3.6 left you.**

- **Every question type grades through the 2.7 grader.** `hand_choice` reshapes
  its candidates into a `GradeInput` and calls `gradeDecision` — there is no
  second band table. A fourth grading path would make the accuracy number
  incomparable between sessions.
- **`presentationFor()` is the ONLY place the format is decided.** Not
  conditionals in the player. A test runs it over 5,000 spots.
- **An `action` event's `amount` is the TO-amount, not the increment.** Summing
  posts and actions naively double-counts the small blind's post when they
  call. `potByStreet` tracks per-seat commitment and adds deltas.
- **Check pot arithmetic against the ENGINE, never against a re-implementation.**
  The first version of that test repeated the renderer's own mistake and passed
  while both were wrong.

**What 0.2 left you.** Anything a later substage needs to build on:

- **Tokens** are in `src/app/globals.css` and nowhere else. That is enforced —
  `tests/unit/no-hardcoded-color.test.ts` fails the build on a colour literal
  anywhere in `src/`, including inside a comment.
- **Adding or changing a colour** means adding a pairing to
  `tests/unit/contrast.test.ts`. It measures the real stylesheet, so a token
  cannot pass its check while shipping a different value.
- **`evColor(bbLoss)`** for the DOM, **`evColorRgb()`** for canvas and SVG. Both
  in `src/lib/ev-color.ts`, pinned to each other by a test. Never re-derive the
  ramp anywhere else.
- **Motion** presets are functions of `reduced`, and the reduced branch returns
  variants with no transform key at all. Keep that shape — it is what makes the
  guarantee hold without every component remembering to check.
- **`--accent` fails AA for body text** (4.37). Use `--accent-bright` for accent
  text and links, and `--on-accent` for a label on an accent fill.
- Tailwind's default `text-*` sizes and `rounded-2xl` still exist. They are off
  the system — use the named scale steps.

**What 0.3 left you.**

- **`shadcn add` output is not ready to use.** shadcn ships its own colour
  vocabulary (`bg-primary`, `text-muted-foreground`) and its `accent` is a hover
  surface, which collides with our brand azure. Every generated component was
  rewritten onto our tokens; rewrite any new one the same way before using it.
  `scripts`-free reference: the mapping is documented in the 0.3 commit.
- **`dark:` is unconditional** (`@custom-variant dark (&)`), because the app is
  dark-only and the stock variant keys off an OS preference we ignore.
- **Button** is white by default (`primary`), `accent` is the lit treatment and
  is one per screen, and `action` is the poker decision bar. Every size clears
  44px — that is why shadcn's `xs`/`sm` are gone.
- **Small controls carry their hit area on `.tap-target`'s `::before`.** A
  checkbox is 20px visually and 44px to a thumb, so measuring the target means
  measuring the pseudo-element, not the element box.
- **Blue is data and state, white is action.** Progress bars, checked
  checkboxes, radios and switches are accent, not white. That distinction is
  easy to lose when adding a component.
- **Glossary content** is typed TS in `src/content/glossary/`. `StatInfoSheet`
  only touches `getGlossaryEntry`, so the MDX swap later is one file.

**What 0.4 left you.**

- **Nothing in `src/lib/redis.ts` throws.** `cacheGet` returns null for a miss,
  malformed JSON and a Redis outage alike; the caller cannot tell and should
  not need to. `withCache` is the exception on purpose: an error from the
  loader propagates, or a broken query renders as a silently empty page.
- **There is always an implementation.** With no Upstash credentials the
  in-memory store takes over, so dev and CI run the same code path. It does not
  survive a restart and is not shared between instances — fine for a cache,
  not fine as a source of truth.
- **Rules carry their own fail mode.** Open for anything costing only latency,
  closed for anything costing money, and `AUTH_ATTEMPT` is closed despite being
  free because it guards credentials. Add new rules to `RULES`, never inline
  numbers at a call site.
- **`AI_TOKENS_DAILY` is a calendar-day budget, not a rolling window**, charged
  by `cost` so a 1500-token call is not one 20-token call. A sliding window can
  never truthfully say "resets at midnight".
- **`getSession` verifies ownership and that is a security boundary.** Do not
  optimise the `userId` argument away; there is an explicit test for it, and
  3.2 and 6.2 depend on it.
- **The Upstash client is built with `automaticDeserialization: false`.** With
  the SDK's default parsing a stored string `"123"` and a stored number `123`
  come back identical.

## Environment

Deployed on Vercel, auto-deploying from `main` on every push. Live at
suitedpoker.com. Supabase, Stripe, Upstash, Gemini, Resend and PostHog accounts
exist but are **not yet wired up** — `.env.local` is mostly empty and
`src/lib/env.ts` treats nearly everything as optional so the app boots without
them. Substages 0.4, 1.1 and 7.3 are where those get connected.
