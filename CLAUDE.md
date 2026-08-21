# SuitedPoker — working notes for Claude Code

Read this fully before touching anything.

## What this is

A GTO poker trainer for beginners. NLHE, 6-max cash, 100bb. Web app, mobile-first,
hard paywall at $24.99/mo or $119.99/yr.

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
| 7.4 Webhooks and entitlement | done — verified against live Stripe test mode |
| 7.5 Account, billing, cancellation | done — 9 e2e against real Stripe subscriptions |
| 4.4 Hand-scoped chat | done — 15 jailbreaks + 10 number probes read against live Gemini |
| 4.5 Cost guards and abuse protection | done — breaker verified, product usable with AI fully off |
| 8.2 Meta Pixel and Conversions API | done — dedup wired end to end, hash hand-verified |
| 8.3 Transactional email | done — 8 emails read, dunning schedule exact |
| 8.4 Landing page and SEO | done — Lighthouse mobile 99/100/100/100, scan clean |
| 8.5 Product assets, icons, capture | done — 6 shots, 86% smaller, clean loop seam |
| 9.1 / 9.2 Motion, mobile, PWA pass | done — CLS 0.0000 everywhere, axe clean, 4 device sizes |
| 9.3 / 9.4 Test suite, perf, launch readiness | done — 6/6 mutations caught, build gate live |
| 9.6 Compliance hardening | done — age gate, geo-block, 251-file string audit clean |
| 7.2b The demo hand | done — one hand before the wall, 2.8s added to the funnel |
| 2.10 Solver run and methodology | **DEFERRED** — pipeline verified, batch not run. See `tools/solver/README.md` |
| 4.1 Gemini integration and prompt architecture | done — **20-spot adversarial run unverified (no Gemini key)** |
| 4.2 Hint system | done — 7 hint e2e green, 50-hint leak test green |
| 4.3 Post-hand explanation | done — streaming, 36-explanation matrix green |
| 7.3 Stripe setup and checkout | done — **verified in test mode: checkout 7/7, webhooks 17/17** |
| 2.8, 2.9, 6.1 (Track C) | done — merged from `track/engine`, worktree removed |
| 7.1 Onboarding quiz | done — 20 e2e green, derivation table printed |
| 7.2 The diagnosis screen | done — 25-combo table green, 20 e2e green |
| 6.2 Table sim session play | done — leak test + 50-hand session green on both projects |
| 6.3 Post-session review | done — planted leak found, one AI call enforced |
| 5.1 Curriculum content system | done — 14 lessons, prose measured |
| 5.2 Lesson player and progress | done — server-side lock verified, 20 e2e green |
| 5.3 Dashboard | done — four data states, numbers hand-verified, LCP 128ms |
| Poker-maths quiz (`/quiz`) | done — exact odds, 7 families, 7 e2e green, migration applied to both projects |

**Every substage in `SUITEDPOKER_BUILD_PLAN.md` is now done.** Update this table
if you add one.

**What the onboarding shortening left you (Aug 2026).**

- 🔴 **THE QUIZ IS FOUR QUESTIONS NOW: pain, goal, study, leaks.** Venue,
  frequency, minutes and the chart interstitial are gone from the flow, but
  they stay on the `Answers` type as documented legacy fields — existing
  profiles carry them and the derivations still read them (venue tempers the
  skill tier, venue+frequency price the diagnosis, minutes sets the daily
  target). A NEW user's diagnosis is bb-only (no venue → `annualUsd` null),
  defaults to monthly hands and 5 min/day.
- **The ads funnel is `/start` (4 questions → scripted example hand) →
  `/signup?from=start` → `/paywall`.** The continue bridge and the api-mode
  safety net now land on /paywall, NOT /onboarding/hand — the ads funnel plays
  its hand pre-signup. Organic `/signup` → `/onboarding` still hands off to
  the real demo hand (7.2b), which is unchanged.
- 🛑 **THE EXAMPLE HAND IS AUTHORED, NOT DEALT** (`src/lib/example-hand.ts` +
  `ExampleHand.tsx`): A♠K♠ on the button, folded to hero, fold/call/raise with
  hand-written verdicts. It runs pre-auth with NO server call, so there is no
  abuse surface and nothing to leak — the copy has no frequencies and no EVs.
  It renders on the real `DrillSurface` with seats built by the real
  `seatActivity` helpers. Local (`/start`) mode only — `EXAMPLE_STEP` sits
  outside `TOTAL_STEPS` and shows no progress bar.
- **`continueAfterWelcome` now checks full completeness, not `resumeIndex`** —
  the last question's index EQUALS `TOTAL_STEPS`, so an index comparison
  cannot tell "on the last question" from "finished". This was latent before
  (minutes was both last and skippable-looking) and became live with 4 steps.
- **The comparison chart is DELETED** (ComparisonChart.tsx, onboarding-chart.ts
  and its test) — git history has it if the judgement reverses.
- **`example_hand_answered {action, correct}`** is the new analytics event —
  the last signal before the signup form.
- **The paywall's Terms/Privacy links were 404s in production** — they said
  `/terms`, the pages live at `/legal/terms`. Fixed; the site footer always
  had the right paths, so no scan caught the paywall copy of them.

**What the screenshot refresh left you.**

- **Re-run after the quiz, the sizing work and the grade fix. 5 of 6 shots
  changed.** `dashboard` is the one that MATTERED: it captures `/practice`, so
  it had been advertising a three-card hub for a product with four modes — a
  marketing image of something that did not exist.
- **`lesson` came back BYTE-IDENTICAL**, which is the determinism claim in
  `capture-screenshots.ts` proving itself rather than being asserted. The three
  that deal a live hand cannot be, by design: making them reproducible would
  mean letting the client pick the spot seed, and 3.2 exists to stop that.
- **The feedback shot now shows the grade fix**, which is a happy accident worth
  keeping: it captured "YOU CHECKED ✓ Solid" against a headline of "Bet 33%."
  on a 7% minority line. The hero marketing image is now a demonstration that
  the product distinguishes a real mixed line from the modal one.
- **It is 6 shots, not the 7 this file used to claim**, and the AVIF saving is
  86%, not 82%. Both numbers were stale; `npm run optimize:assets` prints the
  real ones (2395KB → 327KB).
- **Run BOTH commands, in order.** `npm run screenshots` writes PNGs;
  `npm run optimize:assets` produces the AVIF and WebP the pages actually
  reference. Capturing without optimising leaves the shipped images stale while
  `public/screenshots/*.png` looks current.

**What the minority-line grade fix left you.

- 🔴 **A 20% FOLD SHOWED A GREEN "✓ Best" WHILE THE PANEL ABOVE IT SAID
  "Call."** Reported from the onboarding hand (T9o in the big blind, call 80 /
  fold 20). Under the indifference rule every action in a mix is worth exactly
  the same, so `evLoss` is 0 for all of them and `bandFor(0)` returns `best` —
  the minority line got the identical badge as the modal one. That is the same
  grading-versus-display contradiction `grader.ts` was written to prevent, just
  mirrored.
- **`isBalancedAlternative` was supposed to catch this and could not.** It only
  ever UPGRADES to solid (`if (isBalancedAlternative && grade !== "best")`), and
  the grade is already `best` by the time it runs. The flag was correct — it
  read `true` on the reported hand — and the guard around it was backwards.
- 🛑 **THE FIX IS `solid`, NOT `inaccuracy`, AND THAT DISTINCTION IS THE WHOLE
  POINT.** Folding T9o one time in five is what the strategy does. Colouring it
  amber would teach that a real mixed line is a mistake, which is precisely the
  lie the EV-loss design exists to avoid. `solid` means correct poker that is
  not the headline answer. **`evLoss` is untouched at 0** — the WORD changed,
  the NUMBER did not, so rating, accuracy and the leak report are unaffected.
- **A true 50/50 is never demoted.** With equal frequencies `topAction` falls
  out of the order of `actions`, so demoting one side on a tie-break would be
  arbitrary. Guarded on `freqOf(topAction) > chosenFreq`.
- **Scale: 447 of 7,149 played preflop lines and 138 of 284 postflop.** Postflop
  is 48.6% because it is 98.5% mixed cells — and because making the postflop EV
  column indifference-consistent (which fixed 118 real contradictions) turned
  every minority postflop line into `best`. That repair widened this bug before
  anyone saw it; on preflop it predated everything.
- ⚠️ **THERE ARE THREE CLIENT-KEY ALLOWLISTS, NOT TWO.** `facingChips` was added
  to `tests/unit/drill-security.test.ts` and `tests/unit/poker/generator.test.ts`
  and MISSED in `tests/e2e/drill.spec.ts` — so it shipped to production with
  that e2e red, because **e2e is not in `npm run verify` or the commit hook**.
  Run the drill spec after touching `ClientSpot`.

**What the poker-maths quiz left you.

- 🔴 **`src/poker/odds.ts` IS THE ONLY EXACT DATA IN THE PRODUCT.** Every
  strategy file says `authored-approximation` and will until 2.10 runs; these
  are counting problems over 52 cards with one right answer. So the quiz panel
  says "counted, not estimated" and means it — it is the one screen allowed to
  state a number flatly. Exact combinatorics only: no simulation, no floats, no
  rule of four. **`ruleOfFourAndTwo` exists ONLY to be offered as a wrong
  answer**, and a test asserts it never equals the exact figure.
- 🛑 **THE QUIZ DELIBERATELY DOES NOT TOUCH ACCURACY OR THE GLICKO RATING.**
  `questions.ts` says every question type grades through the EV-loss grader so
  one accuracy number stays comparable — but a percentage is exactly right or
  wrong, and forcing it through `gradeDecision` would mean INVENTING an EV loss
  for a wrong answer. Separate table (`quiz_attempts`), separate metric, own
  section on /progress. Milan's call, made explicitly.
- ✅ **MIGRATION `0004_quiz_attempts.sql` IS APPLIED TO BOTH PROJECTS.** Verified
  by querying each database directly rather than by trusting the dashboard:
  table present, RLS on, 8 columns, the FK to `auth.users`, both indexes, and
  **exactly two policies (SELECT + INSERT) with no UPDATE or DELETE** — that
  table is insert-and-read only, because a client that can rewrite its own
  answers can manufacture a perfect record. `docs/APPLY-MIGRATION-0004.md`
  holds the paste-ready prompt, and a unit test pins its SQL to the migration
  so the copy cannot drift.
- 🔴 **THE PERSISTENCE TEST COULD NOT EXIST BEFORE THE MIGRATION, AND THAT IS
  THE INTERESTING PART.** The insert is best-effort and LOGS rather than
  throwing, so while the table was missing the ENTIRE quiz loop went green with
  nothing being written — right failure mode for a user, exactly wrong one for
  a suite. `tests/e2e/quiz.spec.ts` now asserts on the ROW: family, chosen
  index, timing, the stored payload, and that `correct` equals the verdict the
  user was shown. If those two can disagree, the /progress breakdown is fiction.
- **`npm run test:rls` passes but proves nothing about this table** — that suite
  predates it. The direct database check above is what verified it.
- **The distractors are the teaching, and they are designed.** Each wrong option
  is a nameable mistake: the one-card figure when two cards are coming, the
  streets added without removing the overlap, "12 outs" read as 12%. A test
  enforces a 7-point minimum gap between options — three answers reading 31, 34
  and 35 are one answer and two typos.
- 🔴 **THE DRAW SCENARIOS ARE HELD AGAINST THE REAL CLASSIFIER.** A prompt
  saying "you flopped the open-ender" over a hand that is not one is the same
  defect as the coach describing a board it never saw. `9h8h on 7h 5c 2h` was
  authored as a combo draw and is only a gutshot plus a flush draw; the test
  caught it, not me.
- **`tests/unit/rls-policy.test.ts` now scans EVERY migration**, not just 0001.
  It assumed all user-scoped tables were created there, which stopped being true
  the moment one was added later.
- ⚠️ **AD 3's "67%" IS WRONG.** `AK misses the flop` is 67.571%, which rounds to
  **68**. The ad offers 41/55/67, so its own correct answer disagrees with the
  app. `STATIC-AD-PROMPTS.md` rule 5 says every number in an ad must be true —
  fix the creative, not the maths.
- **Three of the five ad creatives advertise this mode**, which did not exist
  when they were written. It does now; the message match is real.

**What the content-depth pass left you.

- 🔴 **POSTFLOP WAS 130 ANSWERS AND IS NOW KEYED ON THE COMBO.**
  `gradePostflop` graded `(template, handClass)` and nothing else, so `AhKh` on
  `Ah 7d 2c` and `AcKs` on `As 8h 3d` were the SAME CELL — blockers, the kicker
  inside the class, the backdoor draw and which of the four boards you were
  dealt all collapsed. `src/poker/refine.ts` re-keys it on
  `(template, handClass, comboFeatures)`: **108 reachable cells → 259**.
  Bounded to ±0.20 frequency and it can only redistribute inside the support the
  template already authors, so it can never invent a line or drop one.
- 🛑 **118 OF 130 POSTFLOP CELLS PRICED A LINE THEY RECOMMENDED AS A MISTAKE.**
  `top_pair_weak_kicker` in `river-facing-large-bet-after-two-calls` folded 65%
  and called 35% with the call at **-0.23**. This is the exact bug
  `repair-preflop.ts` was written to fix preflop, still live postflop through
  every substage that touched it. EV is now DERIVED from the frequencies under
  the indifference rule rather than carried beside them — one source of truth,
  so a refinement cannot desynchronise the two. **0 violations.**
- 🔴 **`config.difficulty` WAS NEVER READ IN `generatePostflop`.** It computed a
  difficulty onto the OUTPUT and never took one as INPUT, so the entire 3.3
  adaptive loop was inert on every postflop hand — a 1400-rated player and a
  700-rated one drew from an identical pool for eleven substages. Nothing caught
  it because the returned spot always carried a plausible-looking number. The
  only way to see it is to ask for two targets and compare, which
  `refine-sizing.test.ts` now does. **Both new tests were mutation-checked: they
  fail when the bug is reintroduced.**
- 🔴 **SEVEN SERVED NODES SHARED AN EV COLUMN, IN THREE GROUPS**, and the
  byte-identical-STRATEGY invariant passed the whole time. The cause is worth
  remembering because it will recur: **`deriveEv` is a function of the strategy's
  SUPPORT — which hands continue and with which actions — not of its weights.**
  Two nodes can differ in every frequency and still price identically to the last
  decimal. Differentiating a pairing means changing WHICH HANDS are in the range.
  A new invariant fails the build on a duplicate EV column.
- **Raise sizing varies, in whole chips: opens 5/6/7, 3bets 22/26/30, 4bets
  44/52/60** (`src/poker/sizing.ts`). Chips are already the display unit, so
  those ARE 2.5/3/3.5bb with no decimal anywhere on screen. Weighted 50/30/20
  toward the baseline because 2.5x is what a real game mostly deals.
- **The narrowing needed TWO weights and one was not enough.** `resistance`
  (from the hand's EV) alone folded AKo 20% to a bigger 4bet, because EV is
  relative WITHIN a node and the bottom of a 4bet-calling range scores the same
  as the bottom of a blind defence — and one of those bottoms is AKo. Scaling on
  extra BIG BLINDS rather than relative price made it worse still (22→30bb is
  eight big blinds). It is `priceRatio × resistance × widthFactor` now: measured
  **BB vs a button open 40.4% → 31.4%** across 2.5x→3.5x, against a published
  ~40%→~30%, with a 4bet node moving 3% and AA/KK/QQ untouched.
- ⚠️ **THE SCRIPTED SURFACES MUST PIN THEIR SIZE.** The demo hand is
  `BB:vs_rfi_BTN` and its copy states the open in prose ("the button only raised
  to 5") and quotes the node's frequencies, so a dealt 7-chip open contradicts
  its own explanation. `forceFacingChips` exists for exactly this and the demo
  route and the landing showcase both use it. Any new scripted spot must too.
- **7 multiway nodes: 4 squeeze (`vs_open_call_X_Y`) and 3 limped
  (`vs_limp_X`).** Before them EVERY node in the tree resolved to hero against
  exactly one opponent — no multiway pot existed anywhere in the product, for an
  audience whose games are mostly multiway. `seatActivity` already handled the
  histories with no change (it walks the betting order rather than comparing seat
  indices), and `tests/unit/action-legality.test.ts` replays all 7 through the
  REAL engine, so the spots are provably reachable game states.
- 🔴 **THE PREMIUM-FOLD INVARIANT CAUGHT MY OWN RANGES.** Four of the squeeze
  nodes folded AKs/AKo up to 40% because the specs put the non-raise share
  nowhere. AK does not fold at 100bb; the remainder belongs in CALL. Authored
  ranges get the same invariant treatment as inherited ones for this reason.
- **`facingChips` is on `ClientSpot` deliberately** and was added to both
  client-key allowlists with the reason recorded. It is already printed verbatim
  in `actionHistory` and says nothing about strategy, but the grader prices
  against it so it must travel and come back.
- ✅ **`npm run mutation` IS 6/6 AGAIN.** It read 5/6 for a long time: "the API
  guard stops checking entitlement" survived because it was pointed at
  `api-route-audit`, which is a STATIC scan. Deleting the check inside
  `withEntitlement` leaves every file that scan reads untouched, so the audit
  stayed green while the paywall was open to everyone. **A test that cannot
  fail is not a check.** `tests/unit/api-guard-runtime.test.ts` now calls the
  wrapper directly with `createClient` and `hasActiveSubscription` stubbed —
  runs in half a second, needs no credentials, and asserts the handler is NEVER
  reached by an unsubscribed caller. The runtime proof used to exist only in
  `tests/e2e/entitlement.spec.ts`, which is in neither `npm run verify` nor the
  mutation run.
- ✅ **`npm run screenshots` HAS been re-run** (see the screenshot-refresh note
  above).

**What the first live Stripe test-mode run left you.**

- 🛑 **`DATABASE_URL` WAS POINTING AT SUPABASE'S SESSION-MODE POOLER (port
  5432), NOT TRANSACTION MODE (6543).** Session mode caps at 15 clients and
  holds one per connection, so `getDb()` threw `EMAXCONNSESSION` under any real
  concurrency. `src/db/index.ts` has always been configured for transaction mode
  — `prepare: false` exists specifically for it — so the URL and the client
  disagreed. **Check this in Vercel as well; a local fix does not fix
  production.**
- 🔴 **A BARE `catch {}` HID THAT FOR THE WHOLE OF 7.3.** `rememberCustomer`
  swallowed every failure, so the subscriptions row was NEVER written, so
  `findCustomerId` always missed, so **every checkout minted a fresh Stripe
  customer**. Nothing in the logs, nothing in the tests. It caught the moment
  the suite could finally run against `sk_test_`. The catch logs now.
- **`customers.create` carries `idempotencyKey: customer:<userId>`.** Neither
  existing guard is watertight: the DB write can fail, and Stripe's customer
  SEARCH index is eventually consistent by up to a minute, so two checkouts
  seconds apart both miss it. "Start checkout, change your mind, come back" is
  ordinary behaviour on a payment screen, not a rare race. Stripe now collapses
  the duplicate itself.
- ⚠️ **There are ~14 more `getDb()` calls inside a bare `catch`.** Each one is
  the same shape: a silent no-op under pool exhaustion. Worth a pass.
- ✅ **RESOLVED — the Stripe test-mode ANNUAL price mismatch.** It read "$149.99;
  `plans.ts` says $119.99", and two checkout tests failed on exactly that, which
  they were right to do: the paywall would have promised $119.99 while Stripe
  charged $149.99. Test mode was reconciled with a new price during 7.3, and
  live mode has since been reconciled too — see the 7.3 section below.
- **No test-mode webhook endpoint exists on the account**, and
  `STRIPE_WEBHOOK_SECRET` is still the live-mode one. Webhook verification needs
  `stripe listen --forward-to localhost:3000/api/stripe/webhook` and its
  printed `whsec_`.
- **`npm run email:test -- <address> [template]`** sends one real transactional
  email. `tests/unit/emails.test.ts` proves the HTML; only a real send proves
  the key, the domain and the `from` address.

**What the product correctness audit left you.**

- 🛑 **THE STRATEGY SET IS AN ALLOWLIST, NOT THE FILE COUNT.** (This read "24
  nodes, not 43" and was stale twice over: later repairs released nodes back,
  and the content-depth pass added 7 multiway files. It is **39 served of 50 on
  disk**, 11 quarantined — but do not trust that number either; count it with
  `loadSolutionData().preflop.length` rather than reading it here.)
  `src/poker/node-status.ts` is
  an allowlist: every quarantined node carries a WRITTEN REASON and
  `loadSolutionData()` filters it, while `loadAllSolutionData()` still returns
  everything so `/methodology` counts honestly and the deferred solver work has
  something to replace. All 8 `vs_4bet` nodes are held back because they were
  ONE FILE — a 4bet from UTG and one from the cutoff answered identically, on
  the biggest preflop pot in the tree. 12 of the 20 `vs_3bet` nodes went the
  same way; one representative of each template survives, chosen to be the
  pairing it actually describes.
- 🔴 **THE CAPSULES WERE SORTED BY FREQUENCY AND THE BUTTONS WERE NOT.** A hand
  the solver called 60% of the time printed "60%" above Fold — the screen
  stating the exact opposite of the strategy it had just graded the user
  against. `capsuleSegments()` in `src/lib/action-grid.ts` is pure and shared by
  the arena and the demo hand, so the correspondence is an assertion rather than
  something somebody notices in a screenshot. Four actions also wrapped the
  buttons to 2×2 below `sm` while the capsules stayed in one row of four, which
  is what `actionGridClass` exists for.
- 🔴 **THE EV COLUMN WAS DECORATIVE AND THE GRADER READ IT.** `EV(call) −
  EV(raise)` was `+0.11` at the mode across every node; JJ, TT, 99 and AQs all
  cost exactly `1.55bb` to 3bet on the button. `gradeDecision` derives the band,
  the Glicko delta, the leak report and the diagnosis from that number.
  `scripts/repair-preflop.ts` re-derives it under the indifference rule — an
  action played at nonzero frequency is worth the same as its alternatives to
  within a hundredth of a big blind, and folding is worth exactly zero, so a
  negative EV at a real frequency is now impossible rather than unnoticed.
- **The ranges are written in poker notation in the repair script**, not typed
  as 169 numbers, so any published chart can be held against them. BB defence
  against a button open went 25.6% → 40.4%; AKo no longer folds anywhere; the
  top of every range raises.
- 🔴 **THE AI WAS NEVER TOLD WHETHER THERE WAS A BOARD.** `buildCoachContext`
  accepted a `board` parameter and never wrote it into the prompt for four
  substages, so a preflop button-versus-UTG decision came back explained in
  terms of "the straight and flush draws you pick up on this board". Saying
  "Board: NONE" is the load-bearing half — an absent field reads to a model as a
  detail omitted for brevity, not a fact about the world, and it reconstructs
  what it thinks should have been there. The context now also names the villain,
  the seats still to act, and the actions the strategy never takes.
- **`inventsBoard()` blocks the PRESENT tense and allows the FUTURE.** "Small
  pairs are here to hit a set" is the actual reason they are in the range;
  "you have a flush draw" is fiction. A guard that blocked both would remove the
  explanation it exists to protect. Preflop-ness is derived from the node ref
  (`isPreflopNodeRef` — a colon means `POSITION:actionSeq`), because the guard is
  handed a graded decision rather than the spot that produced it.
- **`solutionSetVersion()` is in the coach AND hint cache keys**, alongside
  `grade` and `displayMode`. Explanations live for thirty days; without the hash,
  repairing a node leaves the numbers on screen coming from the new file and the
  sentence under them from the old one. `PROMPT_VERSION` is `v3`.
- 🔴 **A `vs_3bet` DRILL COULD DEAL A HAND THE HERO COULD NOT HOLD.** The spot
  puts the hero in a pot they opened themselves, so 72o at UTG is unreachable by
  construction. `reachableHands()` in the generator intersects with the opening
  range, and an invariant test asserts the data supports it at every seat.
- **`src/lib/spot-seats.ts` walks the action sequence now** instead of comparing
  seat indices. On a `vs_3bet` spot the seats between the hero and the 3-bettor
  were drawn as still to act — three opponents the player did not have.
- **The invariant suite is the point of the pass**, not the repairs.
  `solution-invariants` (no duplicate served strategy, indifference band, range
  widths against published bounds, monotonic opening widths, premiums never
  folded), `action-copy` (no identifier reaches a text node, in a scan narrow
  enough not to cry wolf, plus every template rendered), `ai-grounding` (the
  board statement and the fiction guard over a written corpus of both kinds),
  and `spot-seats` driven by every served node rather than the cases somebody
  thought to write down.
- ✅ **`npm run screenshots` HAS been re-run** (see the screenshot-refresh note
  above).

**What the RunOut pass left you.**

- 🔴 **THE TABLE IS A FILLED OVAL NOW, NOT A BARE STROKE.** DESIGN.md's rule was
  "a glowing ring, never a felt surface", and the reasoning was about GREEN
  felt — a big saturated field under a range grid genuinely destroys it. A deep
  indigo well two shades off the canvas does the opposite: it gives the ring an
  inside and an outside, so the seats read as sitting AROUND something. The rim
  is doubled, because one stroke reads as an outline and two read as an edge.
- 🔴 **THE FULL ENGLISH PIP LAYOUT WAS BUILT AND THEN DELETED.** Ten pips for a
  ten, a drawn court figure for a king, all of it correct and unit-tested — and
  all of it removed one message later for the centred rank-over-suit every poker
  app uses. It is in the git history if the judgement ever reverses. The lesson
  is the general one: *faithful to a physical card* and *good to use at 72px*
  are different targets, and this product wants the second.
- **`src/lib/bet-chip.ts` splits an action in two.** The badge under a seat says
  WHAT ("3bets"), the chip inside the rim says HOW MUCH ("11bb"). It takes the
  LAST figure in the line — "3bets to 11bb" contains a 3, and a chip reading 3bb
  in front of somebody who made it eleven misprices the call.
- **The dealer button is WHITE, not amber.** Amber is `--grade-inaccuracy`; a
  token from the grade ramp sitting next to a seat would read as a judgement
  about that seat.
- **Four actions wrap to two columns below `sm`.** A postflop node offers check
  / bet 33 / bet 66 / bet pot, and four of those across 358px gave each label
  80px — "Raise small" ran straight out of its button.
- **`npm run screenshots` has to be re-run after ANY table or card change**, or
  the landing page and the paywall keep showing the previous design. Both pull
  from `public/screenshots`.

**What the avatar and white-panel pass left you.**

- **Every seat has a face** (`SeatAvatar`), on the drill table AND the sim. It is
  deliberately anonymous and blue-family only: the villains are a solved
  strategy, not characters, and an avatar that borrowed the grade ramp would say
  a player was wrong. It sits ABOVE the pill, never inside it — at 390px the
  side seats are already at the edge of the ring, and 30px more pill width puts
  them off screen.
- 🔴 **NOTHING ON A TABLE IS SIZED FROM `matchMedia` STATE ANY MORE.** The first
  version took the ring's aspect, the avatar size and the board's card size from
  a `narrow` state set in an effect, so all three changed one frame after first
  paint — **CLS on /arena went 0.0000 → 0.0736**, on the screen this product is
  most used on. Aspect and avatar are Tailwind breakpoints now; the board, whose
  size is a NUMBER inside `PlayingCard`, is rendered twice with `sm:hidden` /
  `hidden sm:flex`. Five extra spans beat a layout shift.
- ⚠️ **/arena CLS is 0.0212, not 0.0000.** Inside the 0.1 gate and inside "good",
  but it is a regression against 9.1's clean sweep. What is left is the spot
  arriving: a hand has one to three history lines and two to four buttons, and a
  skeleton cannot match a length it does not know yet.
- 🔴 **`.panel-light` IS A TOKEN SCOPE, NOT A COMPONENT.** It re-points
  `--text-*`, `--surface-*`, `--border-*`, `--accent-bright` and `--danger-*` for
  its subtree, so every component inside the paywall renders on white without
  knowing it. The alternative is a `light` prop threaded through six components
  and forgotten on the seventh.
- 🔴 **A SCOPED OVERRIDE BROKE THE CONTRAST SUITE, SILENTLY-ISH.**
  `tests/support/tokens.ts` flattened every declaration in globals.css into one
  map, so `.panel-light`'s near-black `--text-primary` won globally and 35
  pairings started measuring black on black. `readRawTokens(scope?)` now strips
  scoped rules from the global palette and can overlay one on request — and the
  panel's pairings are measured THROUGH the remap, so a forgotten line in that
  rule fails the build.
- **`--accent-bright` is 3.1 on white** and is remapped to `--accent-700` inside
  the panel. The accent FILL is left alone: the CTA gradient and the ribbon carry
  `--on-accent` and read the same on either ground.
- 🔴 **`npm run screenshots` WAS BAKING THE NEXT DEV OVERLAY INTO THE ASSETS.**
  A red "1 Issue" pill sat in the corner of the shipped landing-page and paywall
  images. The script hides `nextjs-portal` now rather than relying on somebody
  remembering to point it at a production build.
- **The feedback shot scrolls to the grade before capturing.** The table
  redesign pushed the panel below 844px, so the shot that exists to show grading
  came back showing an unanswered table.
- **The paywall showcase uses the DRILL shot, not the feedback one.** It
  explains itself with no caption; the feedback shot needs the grade panel in
  frame to make sense and that does not survive a crop.

**What the table and card pass left you.**

- 🔴 **A DRILL IS DRAWN AS A TABLE NOW.** For eleven substages the arena, the
  daily and the demo hand each rendered a spot as a box of text — a stat row, an
  action history as one prose line, and two 52px cards. No poker product
  anywhere presents a hand that way, because it makes the reader rebuild six
  seats in their head before they can start on the question, and that
  reconstruction is the exact thing a beginner is worst at. `SpotTable` uses the
  same ring, seats and cards as the sim: a drill and a hand at the table are the
  same game and must not look like two products.
- **`PokerTable` could not be reused directly and should not have been.** A
  drill has no `GameState` — the client is deliberately handed a spot with no
  deck, no villain cards and no nodeRef, and that boundary is not worth widening
  for a layout. `SpotTable` shares `TableRing` and `seatLayout` instead.
- **Who folded is INFERRED, in `src/lib/spot-seats.ts`, and it is a claim.**
  Nothing tells us; the seats in front of the hero that said nothing are out,
  the seats behind have not spoken. Pure and unit-tested, because a table that
  dims the wrong chair tells the player somebody is out of the hand when they
  are not.
- 🔴 **THE DECK IS TWO-COLOUR NOW, NOT FOUR.** Blue diamonds and green clubs are
  what a poker room gives its regulars; to somebody whose only reference is a
  physical deck a blue diamond reads as the app being broken. Reversing it is
  two values in `globals.css` if that judgement ever changes.
- **Cards roughly doubled and gained a corner index.** The old `lg` was 52px on
  the one object the player is asked to read and decide about.
- **The mirrored bottom-right index was built and then removed.** A rotated 9
  reads as a 6. On a physical card that never bites because you hold it and see
  one corner; on screen both are visible at once. **Found by looking at the
  screenshot, not by a failing test.**
- **`actionLabel()` exists because the buttons said `raise_small` and `allin`.**
  Snake_case identifiers were printed straight onto the one control the whole
  product runs through, on a product that claims to explain poker in plain
  English. The identifier still goes on `data-action` and to the server — only
  what is printed changed.
- **The board drops to `md` and the ring goes square below 640px.** At 390px a
  72px flop is 231px across a 390px ring and lands on top of the side seats.

**What the paywall redesign left you.**

- 🔴 **`src/content/testimonials.ts` starts EMPTY and that is the feature.**
  The FTC's rule on consumer reviews and testimonials (16 CFR Part 465) makes
  an invented testimonial a per-instance civil penalty, and a checkout page is
  where it is least defensible. Every entry needs a `source` — where the quote
  came from, specifically enough to find the person again — which is a field
  only a real quote can fill. `tests/unit/testimonials.test.ts` refuses one
  without it and `tests/e2e/paywall.spec.ts` checks the rendered page.
- **`ProofMarquee` switches on its own.** Real quotes when `TESTIMONIALS` has
  any, `PROOF_POINTS` until then — product facts that are true today. There is
  no path through the component that renders a person who does not exist. The
  fallback is guarded too: a proof point may not carry a percentage, a "7M+",
  or the shape "players say".
- **The band is slow (`--marquee-duration: 72s`) and stops on hover AND on
  focus-within.** Anything moving that carries words has to be stoppable or the
  words are decoration, and a payment screen is the wrong place to make someone
  chase a line of text.
- **The marquee animation is inside `@media (prefers-reduced-motion:
  no-preference)`, not shortened by the global backstop.** The backstop sets
  `animation-duration: 0.01ms` — a marquee under that snaps to `translateX(-50%)`
  and sits there. Under reduce the band gets `overflow-x: auto` instead, or its
  tail is unreachable behind `overflow: hidden`.
- **Each half of the track carries its own trailing gap (`gap-4 pe-4`).** The
  loop is `translateX(-50%)`; if the gap lived on the track rather than inside
  each half, -50% would land half a gap out and the wrap would visibly jump.
- **The PURCHASE column is first in the DOM, placed right by grid on `lg`.**
  There is an e2e asserting the CTA sits above 844px at 390px wide, and DOM
  order is what decides that. Grid placement moves the showcase left on a wide
  screen without moving it up on a narrow one.
- **`CARD_ORDER` is derived from `PLAN_IDS`, not typed out** — annual first so
  the ribbon has a card to sit on, but a third plan cannot fall off the page.
- **The ribbon states the saving as a NUMBER.** "Best value" alone is a
  superlative every discount banner on the internet has already spent; the 60%
  is arithmetic against the two prices directly under it. It replaced the
  struck-through annualised price that used to sit inside the card.
- **The headline price is PER MONTH (`perMonthCents`), not per week.** A
  monthly figure is the one a subscriber can check against their own bank
  statement; per-week reads smaller and is the standard trick. The honest half
  of the old hairline design survives as the `billedLabel` line — "$119.99
  billed yearly" sits directly under the plan name.
- **The check circle IS an `input[type=radio]`.** Styled with
  `appearance-none` and a sibling tick revealed by `peer-checked`, never a div
  with an onClick — an e2e counts `getByRole("radio")`, and a painted div is
  not something a keyboard can reach or a screen reader can describe.
- **Six benefit sentences became three two-word ticks in one row.** The three
  that went — daily challenge, table simulator, leak report — all appear in the
  proof band below, so nothing was lost. The ticks are `--accent-bright`, NOT
  the grade green: blue is interface, green-to-red is grading, and the two
  never borrow each other's range.
- **The paywall glow is fixed to the VIEWPORT, not sized to the content.**
  Atmosphere that scrolls away a third of the way down looks like a bug, and a
  fixed layer costs no CLS on the one page where a shifted CTA costs money.
- **`.ambient-blob` carries `z-index: -1`, so inside a `-z-10` container it
  hides behind that container's own background.** Both blobs need `z-0` — a
  utility, which wins over the components layer.
- **`tests/unit/assets.test.ts` now scans the paywall too.** A broken image on
  the landing page costs a click; a broken image on the payment screen costs
  the sale that click already paid for.

**What the icon and title pass left you.**

- 🔴 **`src/app/favicon.ico` was the stock create-next-app file for forty
  substages** — 25,931 bytes of Next's own logo, sitting in the tab of every
  browser that prefers `.ico`. It is a binary, so nothing read it and no test
  looked at it. `tests/unit/icons.test.ts` reads the icon headers now.
- **`npm run icons` regenerates every icon from the two brand SVGs.** Never
  hand-place one. `public/brand/spade-tile.svg` (rounded) feeds the tab, the
  favicon and the wordmark; `spade-square.svg` (full-bleed) feeds the surfaces
  that apply their OWN rounding — iOS and Android maskable — because shipping
  the rounded tile there double-rounds it and leaves pale corners.
- **`src/app/icon.svg` is a BYTE COPY of the brand SVG, not a re-render.** A
  test asserts they are identical, so editing the mark without re-running
  `npm run icons` fails the build rather than shipping two marks.
- **A vector favicon is what Google scales.** The `.ico` still carries a 48px
  entry because Google's guidance asks for a multiple of 48 and the old file
  topped out at 32.
- **`icon.tsx` and `icon.svg` satisfy the same Next file convention.** Both
  present emits two competing `<link rel="icon">`; the test asserts the old
  `.tsx` routes stay deleted.
- **The manifest had only a 32 and a 180, so Chrome never offered to install
  it.** 192 and 512 are the threshold. A manifest icon path is checked by
  nothing in the build — the test resolves every one against disk and against
  the size it declares.
- **The title scheme is `SuitedPoker` bare on `/`, `SuitedPoker — %s`
  everywhere else** (it was `%s · SuitedPoker`). Brand first, so a truncated
  tab still says who we are. **A page's own `title` must be the SHORT form
  with no em dash of its own** — `/methodology` read "SuitedPoker —
  Methodology — where the strategy comes from" until it was cut back to
  "Methodology".
- ⚠️ **The landing `<title>` no longer carries a keyword line.** "SuitedPoker"
  alone is what Google shows as the result link; the description carries the
  rest. A deliberate call, not an oversight — revisit it if organic CTR
  matters more than the brand reading clean.

**What 5.3 left you.**

- **`src/lib/dashboard.ts` is pure arithmetic; `dashboard-server.ts` does one
  query pass.** Every figure on the home screen is checkable against a hand
  count in a unit test. Both my hand counts were wrong the first time and the
  code was right — which is the entire argument for writing them down.
- **`[data-fold]` reserves the first viewport** at `calc(100dvh -
  var(--app-shell-py))` — only the shell's TOP padding sits above it, and
  subtracting both ends it a gap short, which is exactly how the rating card
  crept above the fold. An e2e enumerates what is above 844px.
- **A brand-new user never sees a zero.** `totalHands === 0` swaps the whole
  statistics block for a three-step path, and an e2e asserts no `0%` appears
  anywhere on a new dashboard. Zeros on day one read as "empty", and that is a
  refund.
- **An untouched street reports zero ATTEMPTS, not zero accuracy** — never tell
  someone they are bad at something they have not tried.
- **`bb/100 lost` is a positive cost.** "You lose 4.2bb/100" reads
  unambiguously; a negative number invites "negative loss, so… good?". The tile
  carries `higherIsBetter: false`.
- **There is no `street` column on `drill_attempts`** — street is derived from
  the stored board string (0/3/4/5 cards).
- **The greeting broke the layout.** Falling back to the email's local part
  produced unbroken strings like `christopherjohnson1985`, which overflowed the
  heading and pushed the page sideways at 390px. `displayNameFor()` caps at 18
  characters and the heading is `break-words`. When an overflow test fails with
  no element wider than the viewport, look for a text node that cannot wrap.

**What 5.2 left you.**

- 🔴 **Lessons compile at BUILD time, through Next's own MDX pipeline.** Runtime
  MDX was tried twice and failed twice: `next-mdx-remote/rsc` renders client
  components WITHOUT their props (every `<Checkpoint options={[…]}/>` arrived
  empty), and its legacy client path dies under React 19 with a null `useState`.
  `next.config.ts` wires `@next/mdx` + `remark-frontmatter`; without the latter,
  MDX parses the frontmatter's `{ "type": … }` as JSX and dies in acorn.
- **`src/content/curriculum/registry.ts` maps slug → `import()`.** Explicit, not
  globbed — a dynamic `import(variable)` cannot be statically analysed. A test
  asserts the registry and the files on disk match exactly.
- **`src/lib/curriculum-modules.ts` exists so clients can read the module list**
  without dragging `node:fs` into a browser chunk. Turbopack's error for that
  ("does not support external modules") points at the chunker, not the import.
- **Lesson components are SERVER components except `Checkpoint` and
  `RangeGridEmbed`.** A reading page should not ship a bundle to render a card.
  Every prop is optional with a default: MDX is authored content, and a typo
  must degrade one figure, not blank the lesson.
- **`/api/ranges` returns the WHOLE node list**, not a single node — there is no
  `?node=` param. `RangeGridEmbed` finds its node client-side. Getting this
  wrong crashed the entire lesson through the error boundary.
- **`saveProgress` UPSERTS.** Opening a lesson fires two writes at once
  ("reading" from mount, a scroll position from the first scroll); both read an
  empty row and both inserted, racing the unique index. The database settles it.
- **The scroll restore retries until the document is tall enough.** A single
  `scrollTo` lands while MDX is still laying out and the browser clamps it to 0.
  Saving is suppressed until the restore finishes, or the restore's own
  intermediate positions overwrite the place it was restoring to.
- **Completion is server-judged.** `status: "completed"` from a client is a 403;
  it is reached only through a graded practice set or the 3-attempt override.
  The lock is checked on the write path too, so a locked lesson cannot be
  completed without being opened.
- **`text-display-sm` never existed.** Tailwind silently drops an unresolvable
  utility, so four headings rendered at body size across three substages.
  `tests/unit/type-scale.test.ts` is now the counterpart to the colour-literal
  guard — it scans class attributes only, because prose legitimately contains
  phrases like "text-sized".

**What 6.3 left you.**

- **`src/lib/sim-review.ts` recomputes everything from stored events.** VPIP,
  PFR, replays and leak attempts all derive from `sim_hands.hand_history` — no
  second running tally during play, so a stat bug can be fixed and re-run over
  old sessions. VPIP/PFR are verified against an independent count in the test.
- **ONE Gemini call per review, whatever the hand count** — enforced by a test
  that counts mock calls over a 50-hand session, and cached per session in
  Redis so re-opening the page is free. Per-hand explanations at 50 hands would
  be fifty times the cost of a review most users skim once.
- **The summary guard is `contentViolation()`** (new export in redact.ts): the
  session summary grounds in aggregate stats, not one graded decision, so the
  contradiction check does not apply but the money/site/solver rules do.
- **`templateSummary()` is specific with no model** — it names the top leak or
  the worst hand with its numbers. "You played fine" is a failure state.
- **The grader's leak verbs are `overfolds`/`overaggressive`/`overcalls`** —
  `describeLeak()` matched a verb that did not exist ("overfolding") and the
  planted-leak test caught it. Match the grader's vocabulary, not a guess at it.
- **Mucked cards stay mucked, even post-session.** Replay steps carry hero
  cards only; what showdown revealed is already in the event text. The e2e
  scans the review payload.
- **Replay steps are a fold over the engine's events** — pot and board at each
  step are the engine's numbers, never re-derived arithmetic (the 3.6 lesson).
  `event.amount` is the TO-amount; the fold pays deltas.
- Every leak row carries a `drillLink` via `buildArenaLink` targeting that
  exact position + actionSeq.

**What 6.2 left you.**

- **`toClientSimState()` in `src/lib/sim.ts` is the security boundary.** It is
  built by explicit construction, never by spreading GameState and deleting
  fields — the state holds every villain's cards AND the remaining deck, and a
  client with the deck can read the runout. `FORBIDDEN_IN_CLIENT_PAYLOAD` names
  the keys; the e2e scans every raw response of whole hands.
- **Villain cards reveal ONLY at a showdown they reached unfolded** — a hand
  ending in folds reveals nothing, `mayReveal()` is the single rule.
- **The engine deals in INTEGER chips, 2 per bb** (SB 1, BB 2). Every bb figure
  converts at the boundary; legal-action amounts stay in CHIPS on the wire so
  neither side multiplies by two in only one direction.
- **`awardPot` is explicit in the engine** — a complete hand has a pot and no
  payouts until it runs. `sim-server` settles in both the hero path and the bot
  loop; forget one and chips vanish (the conservation test catches it).
- **The bot loop is synchronous; "thinking" delays are client animation** over
  the returned `BotMove[]`. A server that sleeps between bot actions blocks the
  hero's next input.
- **`version` is the double-submit defence.** Client echoes the state version it
  acted on; mismatch → 409 carrying the current state, which the client adopts.
  The rating-relevant one: a double-tapped Raise commits chips once.
- **Walkover hands settle inside `dealNextHand`** — every bot folds before the
  hero acts, and waiting for hero input that never comes is how a 50-hand
  session ends with 47 records. `pendingGrade` lives on the session because the
  hand usually ends several actions after the graded decision.
- **DB row first, sessionstore second** (`sim-store.ts`). A cache that outlives
  a failed durable write rolls the session back when the cache expires.
- **`RULES.SIM_ACTION` (600/min, open)** exists because a fast folder legally
  exceeds the drill rule's 120/min.
- **`PokerTable` gained `actionsOverride`** — the sim client can never compute
  legality (it lacks the authoritative state, by design), so the server's legal
  list is passed through.
- Hands persist to `sim_hands` with full histories; 6.3 reads them.

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

- ✅ **Verified against Stripe test mode.** `tests/e2e/checkout.spec.ts` 7/7
  (including real settled charges on both plans, a declined card and a 3DS
  card) and `npm run test:stripe` 17/17. The suites still refuse to run on
  anything but `sk_test_`, because they complete real purchases.
- ✅ **The live annual price mismatch is RESOLVED** — Milan confirmed
  `STRIPE_PRICE_ANNUAL` in Vercel points at the correct price, not the old
  $149.99 one. This note read "THE LIVE ANNUAL PRICE IS STILL $149.99"; it is
  kept as a ✅ rather than deleted because it was the loudest warning in this
  file and a silent disappearance reads as an oversight. **Nothing in the build
  checks this** — the price id lives only in Vercel, so the check is a human
  opening the Stripe dashboard and comparing against `perMonthCents` and
  `billedLabel` in `plans.ts`.
- **Price ids differ between modes**, so the env var must differ per environment.
  This is exactly how the mismatch above happened.
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
- **The deck has its own tokens** (`--color-suit-*`). They are NOT the
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
- ✅ **RESOLVED — the key is set and the stream is live.** This read
  "`NEXT_PUBLIC_POSTHOG_KEY` is empty, so the client never initialises". It
  points at the **Suited Poker** project (`546559`, token `phc_wbkyGSzV…`) and
  **26 of 26 event types have received data** — verified 2026-08-13 against the
  PostHog API. The whole ads funnel fires: `$pageview` → `onboarding_started` →
  `onboarding_question_answered` → `signup_*` → `$identify` → `demo_hand_*` →
  `paywall_viewed` → `checkout_started` → `purchase_completed`.
- **There are THREE projects on the account** — `Default project`, `Hootly` and
  `Suited Poker`. `Default project` belongs to a different app (a stretching
  product) and is full of its events. Anything querying the API must name the
  project id; taking `results[0]` reads the wrong one and reports a healthy
  funnel as completely dead.
- ⚠️ **Only `demo_hand_question_asked` and `checkout_abandoned` have never
  fired.** The first is new (the scripted demo coach); the second needs someone
  to press back on Stripe's own page. Neither is a fault.
- 🔴 **POSTHOG IS NOT ENVIRONMENT-GATED, unlike Meta.** `initAnalytics()` checks
  only that the key is non-empty, so **every local dev page load, e2e run and
  `npm run screenshots` writes into the same project the ad funnel is measured
  from** — the exact contamination `metaDelivery()` exists to prevent for the
  pixel (see the Meta environment-gate section). It has not cost anything yet
  because there is no ad traffic to dilute; it will the day there is. The fix is
  the same shape: gate on `VERCEL_ENV`, fail closed.
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

**What 7.4 left you.**

- **`current_period_end` lives on the subscription ITEM**, not the subscription.
  It moved in API 2025-03-31 and reading the old location returns `undefined`
  rather than throwing — which writes a null period end, which `isEntitled`
  reads as "not entitled". A paying customer locked out with every log green.
  `periodEndOf()` is the only place that reads it.
- **Every webhook path re-fetches the subscription from Stripe** rather than
  applying the event payload. Stripe does not guarantee delivery order, so
  applying payloads as they arrive eventually writes a stale status.
- **The `stripe_events` INSERT is the idempotency lock**, not a preceding
  "have I seen this?" check. An application-level check passes a sequential
  replay test and loses the concurrent one — there is a test that fires five
  simultaneous deliveries.
- **A failed handler releases its claim and returns 500** so Stripe retries.
  Acknowledging an event we failed to process drops it forever.
- **The webhook does its work INLINE, contrary to the plan's "return 200 first".**
  On serverless, work after the response is not reliably executed, and a payment
  silently never synced is worse than a retry.
- **`past_due` gets a 3-day grace, measured from `past_due_since`** — which is
  preserved across retries, never re-stamped, or a card that never succeeds
  keeps access forever.
- **Entitlement is `some(rows)`, not the row with the latest period end.** A
  past_due row's period end is in the PAST, so ordering by it ranks a dead
  cancelled row above the live one.
- **`/welcome` polls `/api/entitlement/status` and is exempt from the gate.**
  Verified live: admitted 920ms after the webhook landed. At 20s it stops
  polling and lets them through anyway rather than spinning forever.
- **`npm run test:stripe`** runs the live suite (real customers, real test
  clock, real signatures). Not in `npm run verify` — it needs credentials CI
  does not have and takes 40s.
- **`tests/unit/api-route-audit.test.ts` enumerates every API route** and fails
  the build on a new unguarded one. Exemptions must carry a written reason.

**What 7.5 left you.**

- **Settings live at `/account`, not `/settings`.** The plan said `/settings/*`,
  but `/account` was already the entitlement-exempt prefix and already the
  Stripe portal's `return_url` from 7.3. Moving it would have meant changing
  both for no gain.
- **`/account` MUST stay entitlement-exempt.** The people who most need billing
  are the ones whose card just failed. Gating it means the only users who can
  fix a payment problem are the ones who do not have one.
- **The offer depends on the PLAN as well as the reason.** An annual subscriber
  saying "too expensive" gets no offer — being told to "switch to yearly and
  save" reads as an unread form letter and confirms they were right to leave.
- **Declining the offer goes straight to confirm and it never reappears.** A
  looping save offer does not retain anyone; it converts cancellations into
  chargebacks, which cost the fee plus the dispute.
- **Deleting an account cancels Stripe FIRST and only then deletes the user.**
  The other order leaves a subscription billing someone who cannot log in and
  cannot cancel. If Stripe fails, the delete is refused outright.
- **Deletion cancels IMMEDIATELY; an ordinary cancellation never does.** They
  paid for the period, so cancelling takes effect at period end — but there is
  no account left to bill after a deletion.
- **A save is recorded too** (`/api/account/cancel/record`, `offer_accepted =
  true`, no Stripe change). Without it you see the reasons of everyone who left
  and nothing about the offer that worked.
- **The timezone field is not cosmetic** — `localDay()` reads it for both the
  daily challenge and the streak. An invalid zone is rejected rather than
  stored. The e2e proves Kiritimati and Niue sit on different calendar dates.
- **Run e2e on port 3100** when another project holds 3000:
  `PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test`.
  `reuseExistingServer` will otherwise happily test someone else's app.

**What 4.4 / 4.5 left you.**

- **The chat guard is NOT `redact()`.** The explanation guard rejects any
  prescriptive sentence naming a non-best action — correct for explaining a
  decision, wrong here, because "what if I had a flush draw?" is answered by
  describing a different action in a hand the user does not hold. `redactChat`
  keeps the content rules and the no-invented-numbers rule and drops the rest.
- **`inventedNumber` matches spelled-out figures too.** Found by READING the
  live probes: asked how often AQ flops a pair, the model answered "about 30
  percent of the time" — a real statistic nothing in the data computed — and a
  `%`-only regex let it through. Reading the 25 exchanges is the test.
- **The explanation writes `role: "explanation"`, not `"assistant"`.** Both live
  in `coach_messages`; as "assistant" an explanation would be replayed as
  conversation and counted against the 10-turn cap.
- **The turn cap is checked BEFORE the spot lookup** — it is the cheapest
  rejection available and must not depend on another lookup succeeding.
- **The breaker degrades by FEATURE, never by user.** Under a hard paywall
  every user is paying, so there is no free tier to shed. Soft (80%) templates
  the cheap paths — hints, and explanations of CORRECT decisions. Hard (100%)
  stops everything. An explanation of a mistake is the product and goes last.
- **Spend is counted in micro-dollars.** One explanation costs ~$0.00009;
  rounding to cents records every one of them as zero while the real bill climbs.
- **`AI_DAILY_BUDGET_USD` defaults to 25, and a zero or negative value is HARD**,
  never unlimited. A misconfigured env var must fail toward spending nothing.
- **One alert per threshold per day.** An alert on every request past 80% gets
  muted, and then the hard cap arrives with no warning.
- **`/admin/*` is its own route group outside `(app)`** — inside it, the
  entitlement middleware redirects an unsubscribed admin to /paywall, so the
  cost page would be unreachable exactly when you need it. An empty
  `ADMIN_EMAILS` means NOBODY, and a non-admin gets 404, not 403.
- **`tests/e2e/explain.spec.ts` measures FIRST-TOKEN in the browser now.** The
  old test buffered the whole response and called it first-token; it went red at
  ~2.0s when the model got slower, with user-visible latency unchanged. Real
  numbers: first sentence **1196ms**, whole explanation 2373ms.
- **`npm run test:chat`** runs the jailbreak suite. Read the output — a green
  tick nobody read is not evidence.

**What the Meta environment-gate pass left you.**

- 🛑 **THE PIXEL AND CAPI WERE UNGATED FOR THE WHOLE OF 8.2 — ~1.5K EVENTS
  REACHED THE LIVE DATASET FROM LOCALHOST.** `.env.local` carries a real
  `NEXT_PUBLIC_META_PIXEL_ID` and a real `META_CAPI_ACCESS_TOKEN`, so every dev
  page load fired a PageView and every dev checkout an InitiateCheckout into the
  one dataset the ad account optimises against. It cannot be cleaned, only
  diluted. **Those events are still in there — treat pre-gate Meta reporting as
  contaminated, and do not read cost-per-acquisition off it.**
- **`metaDelivery(vercelEnv, testEventCode)` in `src/lib/meta.ts` is the single
  predicate**, pure and shared by both halves. `production` → `send`;
  non-production with `META_TEST_EVENT_CODE` → `test`; everything else → `log`.
  **VERCEL_ENV, never NODE_ENV** — a preview build is also
  `NODE_ENV=production`, which is exactly the case a NODE_ENV check waves
  through.
- **FAILS CLOSED.** No `VERCEL_ENV` at all — a laptop, CI, any non-Vercel host —
  means log. Being wrong that way costs a dev log line; being wrong the other way
  is permanent.
- 🔴 **THE PIXEL SCRIPT IS NOT INJECTED OUTSIDE PRODUCTION, and that is the
  point.** `fbq('init')` fires a PageView the instant it runs, so gating only our
  own `track` calls would still have shipped every dev page load. `MetaPixel`
  returns null; `trackPixel` logs what it would have sent.
- **Two independent force-offs on the server**, same shape as the entitlement
  bypass: `sendEvent` short-circuits before the retry loop, and `postOnce` — the
  one place a request leaves for Meta — gates again. The second one is what
  covers `drainQueue`, which can drain a queue written by a different process.
- **`SendResult.delivery` is `sent | test | logged | skipped`.** `ok` alone
  cannot express it — a suppressed event did not fail and must not be retried,
  but reporting it as sent makes a dev run indistinguishable from a live one.
  `/api/meta/capi` returns `sent: false, delivery: "logged"` in dev.
- **`META_TEST_EVENT_CODE` is the deliberate opt-out of the console**, and only
  outside production. Meta excludes test-coded events from reporting and
  optimisation, so they cannot dilute anything. **Production ignores the variable
  entirely** — a runtime backstop under the existing `FORBIDDEN_IN_PRODUCTION`
  build refusal, because a test-coded Purchase is a Purchase Meta never counts.
- **The PIXEL half has no test-events branch and cannot have one.**
  `test_event_code` is a field on the server API's payload; `fbq` has no
  equivalent, and a `NEXT_PUBLIC` copy of the code would ship it to every
  visitor. Outside production the pixel always logs and the CAPI half feeds the
  panel — same event id, same custom data, so what lands there is what the pixel
  would have sent.
- **`NEXT_PUBLIC_VERCEL_ENV` is derived in `next.config.ts` from `VERCEL_ENV`,
  not taken from Vercel.** Vercel only exposes the `NEXT_PUBLIC_` copy when
  "Automatically expose System Environment Variables" is on; absent, it reads as
  "not production" and would turn the PRODUCTION pixel off with nothing to show
  for it. `VERCEL_ENV` is always present in a Vercel build.
- ⚠️ **Verify after the next production deploy that events are still arriving.**
  The gate's fail-closed direction means a misconfiguration presents as silence,
  not as an error.
- **fbc coverage, three holes closed.** `/api/meta/capi` read attribution from
  the PROFILE ROW only, and the profile is not reliably populated when a browser
  event fires — `captureAttributionOnce` runs from the (app) layout, so a Lead
  during onboarding races it, and its body is inside a `catch` by design.
  `effectiveAttribution()` merges the request cookie under the stored row;
  first-touch merge means it can only ever ADD. `withDerivedFbc()` rebuilds an
  fbc from a stored fbclid that has none. `fbclid` is now capped at 500 chars
  like the UTMs always were — it was an unbounded query param going into a
  cookie and a DB column.
- **Verified in the browser with the pixel fully configured**: no `fbevents.js`,
  `fbq` undefined, zero requests to any facebook host, `SUPPRESSED` logged per
  route, and `?fbclid=` still reconstructed into `fb.1.<ms>.<id>`.
- ⚠️ **8 of 12 `auth.spec.ts` tests and 3 of `attribution.spec.ts` fail on
  mobile-safari, before and after this change** — `fill()` does not commit to the
  email input on WebKit, so login submits with an empty field. Unrelated to Meta;
  worth its own pass.

**What 8.2 / 8.3 left you.**

- **Attribution is captured in the PROXY, on the landing hit.** `?fbclid=` and
  the UTMs do not survive to /signup — several navigations later the query
  string is gone. Capturing at signup captures nothing.
- **FIRST touch wins.** Someone who arrives from an ad and returns via Google a
  week later was acquired by the ad; overwriting credits the channel that
  closed rather than the one that paid.
- **The cookie is moved onto the profile from the `(app)` LAYOUT**, not one
  route. There is no single entry point — /onboarding, /paywall and /welcome
  are each somebody's first page — and a buyer who never finished onboarding
  still needs it before the Stripe webhook reads it. Guarded by a 24h Redis
  marker; a user with no cookie costs zero queries.
- **The Purchase dedup id is minted at CHECKOUT**, stored in `localStorage`,
  sent to Stripe as metadata, and fired from both /welcome and the webhook.
  Two different ids report two sales for one payment.
- **`fbp`/`fbc` are NOT hashed** — Meta matches them verbatim, and hashing them
  produces a payload that is accepted and matches nobody. Only `em` is hashed,
  and the pinned hash in the test was computed outside this codebase.
- **The attribution cookie was double-encoded** (encoded by us AND by the
  cookie layer) and `/api/meta/capi` checked configuration before validating
  the body — so an unconfigured pixel answered a forged Purchase with a 200.
  Both found by the e2e.
- **`src/emails/theme.ts` is the only file besides globals.css allowed a colour
  literal**, because email clients cannot resolve a CSS variable and Gmail
  strips `:root`. `tests/unit/emails.test.ts` asserts every value still equals
  its token, so the duplication cannot drift. A literal anywhere else under
  `src/emails/` is still a build failure.
- **`textSecondary` is opaque, not the token's `rgba()`** — Outlook has no
  alpha channel and renders it black on near-black.
- **Dunning is scheduled off `past_due_since`, never off a send log.** A log
  that fails to write once sends the same email forever. A recovered
  subscription is no longer past_due, so it simply is not in the result set —
  that IS the "stop on payment" mechanism, and there is nothing to cancel.
- **`stageDueOn` fires only on the EXACT day.** "Day 3 or later" re-sends every
  day and turns dunning into a spam complaint.
- **The final email's date is `accessEndsAt()`**, the same arithmetic the
  entitlement rule enforces. Saying the 9th and cutting off on the 8th is a
  chargeback.
- **`npx vitest run --project unit tests/unit/emails.test.ts --reporter=verbose`**
  prints all eight rendered emails. Read them.
- Setup: `docs/META-SETUP.md` and `docs/EMAIL-SETUP.md`.

**What the email logo pass left you.**

- 🔴 **THE SIGNUP AND RESET EMAILS DO NOT GO THROUGH `sendTransactional`.**
  Supabase Auth sends both, because it mints the one-time token in the link —
  so the first email a new user ever receives is Supabase's stock unbranded
  template, and no amount of work in `src/emails/` changes that on its own.
  `npm run emails:supabase` renders our two into `docs/supabase-emails/` to be
  pasted into the dashboard, with the URL left as `{{ .ConfirmationURL }}`.
  **A copy the build cannot check, so it WILL drift** — re-run and re-paste
  after touching `src/emails/`.
- **The lockup's wordmark is LIVE TEXT and the mark is a separate image.**
  Outlook and Gmail block remote images until the reader trusts the sender,
  which is exactly the state a first email arrives in; a lockup baked entirely
  into one PNG makes that first impression a grey box. The plain-text render is
  the test — it drops every image, and `SUITEDPOKER` still has to be in it.
- **It is a `<table>`, not a flex row**, for the same reason `CtaButton` is:
  Outlook's Word rendering engine implements no flexbox, and its fallback
  stacks the mark above the name.
- **The mark is `icon-email-80.png`, generated by `npm run icons` at exactly 2x
  its 40px display size.** Not the brand SVG — Gmail strips an `<img>` with an
  SVG source outright. Not `icon-192.png` either: Outlook downscales 192→40
  badly enough to look like a compression artefact.
- **`width`/`height` ATTRIBUTES, not just the style** — Outlook sizes from the
  attributes and would otherwise render the mark at its intrinsic 80px.
- **`SUBJECTS` moved to `src/emails/subjects.ts`** so a plain script can read
  them; `src/lib/email.ts` is `server-only` for the Resend client and throws
  outside Next. It re-exports them, so no call site changed.

**What 8.4 left you.**

- 🛑 **THE STRATEGY DATA IS NOT SOLVER-VERIFIED.** All 51 solution files carry
  `authored-approximation`. The plan's 8.4 asks for "the solver used, the solve
  count, and the exploitability threshold" inline on the landing page — there is
  no solver run, so `/methodology` states exactly that instead. Claiming
  otherwise would be the same false claim the plan criticises the competitor for.
  `provenanceHeadline()` switches copy automatically when the DATA changes.
- **`methodologyFacts()` counts from the files.** A methodology page with typed
  numbers is the same failure as one that 404s, just slower to notice.
- **`tests/e2e/landing.spec.ts` is the ad-account guard.** It scans the RENDERED
  text, because copy arrives from three modules and a string that is fine alone
  can read as a winnings claim once assembled. "Gambling" is allowed only inside
  a denial, checked by looking at the surrounding 200 characters.
- **The legal pages are scanned with negation allowed** — they exist to DISCLAIM
  what the landing page must never claim, and "No guarantee of results" is the
  sentence that protects us.
- **Geist Sans was downloading 68KB on every page load and rendering nothing.**
  It sat behind Inter in `--font-sans`, and Inter always wins. Removed.
- **Inter now loads through `next/font/local`, not the fontsource CSS import.**
  The import shipped a plain stylesheet, so the woff2 was discovered only after
  CSS parse and layout: FCP 1.2s → 0.8s from the preload alone.
- ⚠️ **Lighthouse's SIMULATED throttling reports LCP 3.6-3.8s; every real
  measurement says otherwise.** Real throttling: 1.6s. A direct
  PerformanceObserver run under Slow-4G + 4× CPU: **856ms**. The simulated
  number is a lantern estimate, not a measurement — do not chase it.
- **Final mobile Lighthouse (devtools throttling): perf 99, a11y 100, best
  practices 100, SEO 100, CLS 0.** The last a11y point was a missing `<main>`
  landmark on the landing page.
- **`src/emails/theme.ts` is now the palette for next/og as well as email** —
  both rasterise without a document. Still the only file outside globals.css
  allowed a colour literal.

**What 8.5 left you.**

- **`npm run screenshots` is the deliverable, not the images.** It reseeds a
  fixed fixture account and recaptures all seven at 2x/390px. When the UI
  changes, re-run it — never hand-edit a PNG.
- **Shot ORDER matters.** The drill and sim shots play real hands and write
  attempt rows; captured before the dashboard they moved its counts and no two
  runs matched. Read-only screens go first.
- **4/7 are byte-identical across runs. The other three cannot be, correctly.**
  Making a dealt hand reproducible would mean letting the client choose the
  spot seed, and 3.2's whole design is that the seed is server-side — a client
  that picks the seed can pick a spot it knows the answer to. Not worth a hole
  in the grading boundary for a screenshot.
- **The loop seam is MEASURED, in pixels.** The first version scraped a PSNR
  line out of ffmpeg's stderr and reported "unknown" when the filter chain was
  wrong — a check that cannot fail is not a check. Decoding both frames caught
  a real 23/255 jump.
- **The seam is a fade, because "Next hand" deals a DIFFERENT hand** — the last
  frame can never match the first by construction. Fading both ends to the
  canvas colour gets it to 0.74/255 and reads as deliberate.
- **The poster comes from the MIDDLE of the clip**, since frame 0 is now
  deliberately black.
- **`npm run optimize:assets`: 1485KB → 265KB AVIF (82% smaller).** UI
  screenshots are flat colour on a dark ground, which is AVIF's best case.
- **`src/emails/theme.ts` now also feeds `next/og` AND the PWA manifest** —
  three renderers that resolve no CSS variable. Still the only file outside
  globals.css allowed a colour literal.
- **The icon is two unequal frequency-bar segments, never a card or a chip.**
  A card reads as gambling to Meta's reviewers and the App Store — the two
  gatekeepers this product must pass — and says nothing about what it does.
- **`tests/unit/assets.test.ts` fails the build on a referenced-but-missing
  asset.** Next does not check a string `src`, and neither does TypeScript.
- Hooks added for capture, in the existing `data-*` convention: `data-action`
  on the arena's action buttons, `data-cell` on range-grid cells,
  `data-testid="start-session"` on the table setup.

**What 9.1 / 9.2 left you.**

- 🔴 **THE CARD ROUND-TRIP BUG SHIPPED TWICE.** 7.1 found the arena blank
  behind its error boundary (`not a card: "36"`); 9.1 found the identical line
  in the DAILY CHALLENGE (`not a card: "43"`), which had been blanking that
  whole page. `Card` is a branded number and arrives already typed — render it
  directly, never `cardsFromString(cards.map(String).join(" "))`.
  `tests/unit/card-round-trip.test.ts` now fails the build on the shape.
  Both times every surrounding test passed, because a crashed page renders
  nothing and nothing contains no leaked solution data.
- **An error must never be an eternal skeleton.** `/daily` checked
  `today === null` and returned a Shimmer BEFORE it reached the error branch,
  so a failed load showed a grey box forever. Error state first, always.
- **`aria-label` is prohibited on a bare `<span>`** — axe rates it serious, and
  a screen reader ignores it, so `AnimatedNumber` announced nothing at all
  (its digits are aria-hidden while they roll). It carries `role="img"` now.
- **A `role="grid"` needs `role="row"` between it and its gridcells.** All 169
  range-grid cells were an aria-required-parent violation. Fixed with row
  wrappers at `display: contents`, so the CSS grid lays out identically.
- **`tests/e2e/sweep.spec.ts` is the whole 9.1/9.2 acceptance in one file:**
  four device sizes × 13 routes for overflow, CLS per route, axe, reduced
  motion, and 44px targets. **CLS is 0.0000 on all 13 routes.**
- **The overflow check treats `overflow: hidden` as clipping**, not just
  `auto`/`scroll` — the first version flagged the shimmer sweep, a gradient
  deliberately animating past the edge of a box that clips it.
- **The range grid is exempt from 44px, honestly.** 169 cells across 375px is
  26px by arithmetic; it is a visualisation you read, and tapping opens a
  detail panel whose controls are full-size.
- Safe-area insets, `user-select: none` on cards and action buttons, and
  `overscroll-behavior` are in `globals.css`. Inputs were already 16px on
  mobile (no iOS zoom) and nothing used `100vh`.

**What 9.3 / 9.4 left you.**

- **`npm run mutation` is the answer to "are the tests real?"** It breaks the
  entitlement rule, the API guard, the chat number guard and the hint guard one
  at a time and asserts the suite FAILS each time. **6/6 caught.** A green suite
  proves the tests pass; this proves they would notice. It restores every file
  in a `finally`, and refuses to run stale — if a mutated line no longer exists
  it errors rather than reporting a false pass.
- **`next.config.ts` refuses a PRODUCTION deploy that cannot take money.** Ten
  required vars, plus four forbidden values (a test-mode Stripe key, a lingering
  `META_TEST_EVENT_CODE`, `DEV_BYPASS_ENTITLEMENT=true`). Gated on
  `VERCEL_ENV === "production"` — NODE_ENV cannot tell production from preview,
  and failing previews would block the branch that fixes the missing variable.
  Verified: `VERCEL_ENV=production npm run build` exits 1.
- **`/api/health` returns 503, not 200-with-a-body, when a dependency is down.**
  Verified both ways against a real broken DATABASE_URL. It checks rather than
  reports liveness — a check that only proves Node is running goes green through
  a total outage. Redis is probed with a write AND a read, because `get` alone
  succeeds against a read-only Redis, which is not a healthy rate limiter.
- **`tests/unit/bundle.test.ts` walks the import graph and STOPS at
  `server-only`.** The first version flagged the whole engine as "in the
  marketing bundle" because the landing page reads three numbers off
  `methodology-server.ts` at render — a false alarm, and a check that cries wolf
  gets deleted. A module importing `server-only` cannot reach a browser.
- **`src/poker` coverage: 92.27% statements, 94.97% lines** — above the 90% bar.
- **`docs/LAUNCH.md`** is ordered so nothing on it can silently undo something
  above it, and leads with the solver-claim decision.

**What 2.10 left you (DEFERRED, deliberately).**

- **Postflop stays on authored approximations and `/methodology` keeps its
  honest wording.** A decision, not an unfinished task. Do not hand-edit that
  copy to claim a solver — it is derived from the data and will change itself.
- ✅ **`parseSolverOutput` is verified** against real output from TexasSolver
  `42313c9c`: 355 combos, plausible non-round frequencies. That was the one
  untested component in the pipeline.
- ❌ **TexasSolver's console `dump_result` emits strategy ONLY — there is no EV
  flag, the GUI computes EVs client-side.** So EVs have to be computed here, in
  a second pass over the solved tree. Legitimate work, well-defined, not yet
  done. Deriving them from frequencies is never an option.
- ⚠️ **The solve settings are wrong**: 15.75% exploitability after 31 iterations
  against a 0.3% target. A batch at today's settings would produce 230
  unconverged solves and burn the hardware budget proving it. Fix the settings
  until ONE solve converges before extrapolating anything.
- ⏱ **Rented hardware, measured in days** — 273s bought 31 iterations, so a
  converged 230-solve batch is 100+ hours on one machine, optimistically.
- The full resume plan, in order, is in `tools/solver/README.md`.

**What 7.2b left you.**

- **The quiz now hands off to `/onboarding/hand`, not `/diagnosis`.** The hand
  is the evidence; the questionnaire is the context, and the diagnosis opens
  with the hand when one exists.
- 🔴 **`displayMode === "preferred"` DOES NOT MEAN the frequencies are split.**
  `displayModeFor` returns "preferred" for a 100%-frequency spot whose EV gap
  is small — correct for the grader, catastrophic for the demo. The first
  version trusted it and shipped a screen reading "a solver raises it 100% of
  the time", which demonstrates the right/wrong app this feature exists to
  disprove. `isDemoWorthy` now checks `topFreq <= 0.8` directly.
  **Found by reading the e2e output, not by a failing assertion.**
- **"that fold costs", not "that folded costs".** Same read-the-output catch.
- **Positions are spelled out** — "from the button", never "from the BTN". The
  audience knows the rules and nothing after them.
- **The abuse surface is bounded three ways**: the seed is derived from the user
  id so a refresh deals the identical hand, the profile record refuses a second
  deal, and there is a rate limit on top. `withAuth`, never `withEntitlement` —
  nobody here has paid, and that is the point.
- **The answer route refuses a spot that is not a demo spot**, or the unpaid
  route becomes a free grader for the whole product.
- **A `useRef(Date.now())` initialiser is impure** — React's compiler rejects
  it, correctly, because a ref initialiser runs during render. Timing uses
  `performance.now()` set in an effect.
- Measured: **2.8s added to the funnel** against a 45s budget.

**What the e2e isolation pass left you.**

- ✅ **RESOLVED — THE SECOND SUPABASE PROJECT EXISTS AND THE GUARD IS LIVE.**
  This read "THE SECOND SUPABASE PROJECT STILL DOES NOT EXIST" and was stale.
  `E2E_SUPABASE_URL` points at `shsbbpmexbwdingtgqsh`; production is
  `mavyvyhytbdutdfpjnvm`. Verified the only way that means anything: a dev
  server started from `.env.local` was left running on 3100, and
  `tests/e2e/global-setup.ts` REFUSED the run — naming both refs and pointing at
  `docs/E2E-DATABASE.md` — rather than quietly seeding production. Kept as a ✅
  rather than deleted because it was a loud warning, and a silent disappearance
  reads as an oversight.
- ⚠️ **`reuseExistingServer` IS STILL THE TRAP IT ALWAYS WAS.** A server already
  on the port is used exactly as it was started, so a dev server you left
  running is a PRODUCTION-pointed server under test. The guard catches it; the
  fix is to stop the server and let Playwright start its own.
- ⚠️ **EVERY NEW MIGRATION MUST BE APPLIED TO BOTH PROJECTS.** Two databases now,
  and nothing in the build checks either one. A migration applied only to
  production passes every test and then fails the e2e suite; applied only to
  e2e, it passes CI and breaks live.
- 🔴 **ISOLATING `adminClient()` WAS ONLY HALF OF IT, AND THE OTHER HALF WAS
  MISSING.** `playwright.config.ts` had no `webServer.env`, so the server under
  test read `.env.local` and pointed at production no matter what the `E2E_*`
  vars said. Following the doc as it stood would have failed the whole suite
  (users created in project B, logins attempted against project A) — and
  `auth.spec.ts` and `analytics.spec.ts` drive the REAL SIGNUP FORM, so those
  users would have kept landing in production while `isolated` read true and the
  warning stopped printing. **A false all-clear was one env var away.**
- **All four variables or none**, `E2E_DATABASE_URL` included. The Supabase
  three isolate `auth.users` and nothing else; `profiles`, `drill_attempts`,
  `sim_hands` and `subscriptions` go through drizzle over `DATABASE_URL`. The
  doc used to call it "only needed for setup:e2e-db", which was wrong.
- 🔴 **`reuseExistingServer` DEFEATS `webServer.env` ENTIRELY AND SILENTLY.** A
  server already on the port is used as it was started. So
  `tests/e2e/global-setup.ts` asks the RUNNING server instead of trusting the
  config: it submits the login form once and reads the hostname of the auth
  request the browser makes (login goes through the browser Supabase client, so
  the destination is observable from outside). The request is **aborted** —
  nothing is sent and the check creates no user anywhere.
- **It fails CLOSED.** An unreadable destination aborts the run. Verified all
  three paths against a live server: the probe read the real production ref off
  :3000 and refused, a partial set refuses without launching a browser, and an
  unset set proceeds with the existing per-run warning.
- **`NEXT_PUBLIC_SITE_URL` is `localhost` locally, so `assertNotProduction()`
  never fires here.** Until the project exists, a printed warning is the only
  thing between a local run and the production auth table.

**What the full e2e passes left you.**

- **`npm run smoke` before any long run.** 28 routes, two seconds. A confirming
  suite was invalidated by an incomplete build — `rm -rf .next-trash-*` was
  BACKGROUNDED and still running when `next build` started, `/styleguide/table`
  shipped without its client reference manifest and returned 500, and six
  failures across three files all looked like product bugs. **Always remove
  `.next` synchronously.**
- 🔴 **The first version of that smoke check could not fail.** It enumerated
  routes from `.next/server/app` — the artifact it exists to validate — so a
  deleted route vanished from the list and it reported "all 27 routes answered"
  while curl got a 500 from the 28th. It reads `src/app` now. Proved by removing
  a built route: exit 1, `/styleguide/table 500 ← BROKEN`.
- **Playwright's expect timeout is 15s, not the 5s default.** Every assertion
  waits on a real server, a real Postgres round-trip and a real Supabase auth
  call; the login → gate → redirect chain regularly takes ten seconds under
  parallel workers. Two daily tests failed a full pass and passed in isolation
  on exactly that. `daily.spec.ts` also carries a 90s per-test budget.
- **12 of the 14 skips are `NEXT_PUBLIC_POSTHOG_KEY` being empty** — the whole
  8.1 event-stream verification has never run. One is the Supabase SMTP budget
  (self-healing), one is Tab navigation on iOS Safari (a real platform limit).

**What the first full e2e pass left you.**

- 🔴 **THE HINT GUARD WAS NARROWER THAN ITS PROMISE FOR FOUR SUBSTAGES.**
  `redactHint` iterated only the spot's LEGAL actions, so any action word that
  was not legal there went untested — a level-1 hint shipped reading "when your
  opponent makes a massive four-bet, look at the strength required to play back
  against them". The design has always said "levels 1 and 2 may not name ANY
  action". It now tests the full vocabulary.
- **`tests/e2e` was excluded from `tsc`.** That is how a missing import reached
  a run and aborted the whole suite at collection. Nothing required the
  exclusion; typecheck passes with the specs in.
- 🔴 **`stripe-webhook-live` and `chat-live` were running inside every
  `npm run verify`** — real Stripe customers and real Gemini calls per commit,
  and a guaranteed failure whenever Playwright touched the same Stripe account.
  Only `coach-live` had been excluded. The exclude is now `*-live.test.ts`, and
  verify went from 40s to 8s.
- **A site-wide footer is not free.** The 9.6 disclaimer in the ROOT layout
  pushed the onboarding quiz — sized to `100dvh - 2*var(--app-shell-py)` — 56px
  into a scroll on every question. It lives on the public surface and /paywall
  now, and moving it means each new public page must opt in (/methodology was
  missed once already).
- **`tests/unit/e2e-selectors.test.ts` scans all 66 `getByRole(name)`
  assertions against src/.** Two stale ones cost a full-suite discovery each
  this session, and one of them — a red test nobody had run — was the only
  thing pointing at there being NO sign-out control for a subscribed user.
- **13 iCloud sync duplicates were on disk**, 6 under `tests/`. Gitignored, so
  never committed, but Playwright and Vitest discover and RUN them. Both
  runners now ignore `* [0-9].*`.
- **Run e2e on port 3100.** Another project holds 3000, and
  `reuseExistingServer` will happily test it instead.

**What 9.6 left you.**

- 🔴 **A CARELESS EDIT SILENTLY BROKE PASSWORD RESET.** Adding `ageConfirmed`
  anchored on a line that appears in BOTH `signupSchema` and `resetSchema`, so
  a `str.replace()` without a count put it in both. The reset form renders no
  checkbox, so validation failed with nowhere to show an error: the button spun
  forever and nobody resetting a password could get in. `npm run verify` was
  green throughout — only the e2e caught it. **A schema must never require a
  field its form does not render**, and `tests/unit/compliance.test.ts` now
  checks that behaviourally for reset and forgot.
- **Sign-out existed ONLY on /paywall**, so a subscribed user had no way to log
  out anywhere in the product. Now on /account. Found by an auth e2e whose own
  assertion had been stale since 5.3 replaced the dashboard header with the
  greeting — a broken test hiding a real gap.
- **`tests/e2e/auth.spec.ts` had three assertions on a heading named
  "Dashboard"** that 5.3 removed. They now match `[data-section='greeting']`.
- **The signup e2e drivers need `page.getByTestId("age-confirm").check()`** —
  auth.spec.ts and analytics.spec.ts both create accounts through the form.

- **The table-sim preset was literally named `casino`** and rendered as "The
  Casino". Renamed to `cardroom` / "The Cardroom" — the same table to a player,
  and what a poker room is actually called, but "casino" is a word Meta's ad
  review and Stripe's risk team both score.
- **Two curriculum lessons had genuine copy problems**: "count the saved barrel
  as winnings" and "picking the 5 costs real money". Both rewritten in bb.
- **`payouts` is NOT forbidden** — `awardPot` returning payouts is the engine
  describing itself. Chips, pot, bet, stack and blind all stay. What goes is
  anything implying money MOVES.
- **The string audit is denial-aware, with a 300-character window.** The FAQ
  asks "Is this gambling?" in one string and denies it in the next; flagging the
  question would push the copy toward not addressing it at all, which is worse.
  Same shape as the landing-page scan.
- **`ageConfirmed` is a refined boolean, not `z.literal(true)`.** The literal
  narrows the OUTPUT type to `true`, which makes an unchecked default a type
  error and forces the whole form to be typed twice. The refinement rejects
  `false` just as firmly.
- **Geo-blocking is in the PROXY**, so a blocked visitor cannot reach signup,
  checkout or the API — one place to audit rather than one per route. A missing
  `x-vercel-ip-country` reads as NOT blocked; failing closed would block every
  developer and every non-Vercel deploy.
- **`BLOCKED_COUNTRIES` is one constant.** Change the list, not the routing.
- **The disclaimer renders from the ROOT layout**, so it cannot be missed on a
  page someone forgot.

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
