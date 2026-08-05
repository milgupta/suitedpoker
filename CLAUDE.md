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

Stage 0 is complete. Update this table when you finish a substage.

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
