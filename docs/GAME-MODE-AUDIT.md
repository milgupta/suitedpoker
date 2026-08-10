# Game mode audit report

**Scope:** Five training loops + Ranges (reference). Code/architecture audit against
the plan’s stated jobs. Updated after the **advanced retention layer** (authored
expansion + Arena mix + leak wiring + `playing-harder-spots`).

**Shared content ceiling (affects every drill mode):**

- **~32** servable preflop nodes (11/43 still quarantined — remaining unrepaired
  `vs_3bet` / `vs_4bet` copies). Was 24 before retention work.
- **14** postflop templates (was 8; adds monotone, high-paired, wet-connected,
  turn barrel, thin river, check-raise).
- **100%** `authored-approximation` (solver batch deferred)
- Live drills use **action + SpotTable only** — `hand_choice` / `sizing` /
  history presentation exist in code but are not wired into Arena/Daily/Demo
  clients
- Curriculum: **18** lessons / **5** modules (includes `playing-harder-spots`)
- Default Arena: rating-gated postflop mix; leak chip filters spots for real

## Rating keys (1–5)

| Axis | Meaning |
|---|---|
| **Intent fit** | Does the mode do the job the plan assigned it? |
| **Variance** | How different are consecutive questions (nodes, hands, streets, bet shapes, opponents)? |
| **Correctness boundary** | Grading / no-leak strategy / server authority hold? |
| **Depth** | How far past “one discrete preflop decision” does it go? |
| **Beginner clarity** | Can a new player understand what to do without rebuilding the table in their head? |

---

## 1. Onboarding (quiz → demo hand → diagnosis → paywall)

| | |
|---|---|
| **Routes** | `/onboarding` → `/onboarding/hand` → `/diagnosis` → `/paywall` |
| **Plan job** | Diagnose a leak, prove we can fix it, take the card |
| **Intent fit** | **5** — Funnel is complete: tier + rating seed, one real mixed hand, cost framed in bb/100 (not dollars), then hard wall |
| **Variance** | **1** — One hand per user; seed from `userId` (refresh = same); shortlist by skill tier; must be genuinely mixed (`topFreq ≤ 0.8`) |
| **Correctness** | **5** — Demo answer refuses non-demo spots; `withAuth` not entitlement; already_played / rate limit |
| **Depth** | **2** — Single preflop decision + frequency capsules |
| **Beginner clarity** | **5** — Positions spelled out; capsules prove “mixed, not right/wrong” |

**Works as intended?** Yes. Deliberately low variance. Beginner acquisition unchanged by retention work.

**Watch:** Demo shortlist still must stay dealable after quarantine changes. Quiz Q8 free-text is stored but not yet fed to the coach.

---

## 2. Curriculum (`/learn`)

| | |
|---|---|
| **Routes** | `/learn`, `/learn/[module]/[lesson]` → Arena practice (`length: 10`) |
| **Plan job** | Tell the beginner what to learn next; retention module after fundamentals |
| **Intent fit** | **4–5** — 18 lessons / 5 modules, sequential locks, MDX + checkpoints, practice pass ≥60% or 3-attempt override. Advanced module unlocks at 80% of prior |
| **Variance** | **3–4** — Per-lesson `drillFilter` including 3bet / 4bet / wet-connected / river. Practice reuses Arena generator |
| **Correctness** | **5** — Completion server-judged; locks on write path; client cannot assert `completed` |
| **Depth** | **3–4** — Reading + range embeds + 10 filtered spots; advanced lessons push difficulty 6–8 |
| **Beginner clarity** | **4** — Fundamentals path unchanged; advanced module is opt-in via Learn + Practice hub |

**Works as intended?** Mostly. Practice sessions still **update Glicko** (same Arena answer path).

---

## 3. Daily Challenge (`/daily`)

| | |
|---|---|
| **Plan job** | Habit — 5 spots, one shot, streak, leaderboard |
| **Intent fit** | **5** — Exact shape: date seed, difficulties `[3,5,6,7,8]`, unique `nodeRef`s, streak + freeze announce, spoiler-free share |
| **Variance** | **2 within day / 3 across days** — Same five for every user that calendar day (by design). **Preflop only** (unchanged). Five distinct nodes from the ~32-node pool |
| **Correctness** | **5** — DB unique one-attempt; concurrent double-submit covered; `ClientSpot` boundary |
| **Depth** | **2** — Five discrete preflop decisions; no hints/coach; does **not** update Glicko |
| **Beginner clarity** | **4** — SpotTable; no AI coaching in this loop |

**Works as intended?** Yes for habit/competition. Not a breadth tour of the product (no postflop).

---

## 4. Rated Arena (`/arena`)

| | |
|---|---|
| **Plan job** | Infinite grind, live rating, adaptive difficulty |
| **Intent fit** | **4** — Endless feed + Glicko + difficulty adapt. Leak filters and rating-gated postflop mix close the old intent gaps for default grind |
| **Variance** | **3–4 default / 4 with presets** — Below 1000: preflop only. 1000–1199: ~20% easy flop. ≥1200: ~35% flop/turn (river ≥1400). Hub presets for postflop / 3-bet focus |
| **Correctness** | **5** — Seed server-side; burn-after-answer; no strategy/`nodeRef` on wire; grading server-side |
| **Depth** | **2–3** — Discrete decisions; coach (hint/explain/chat) is the depth layer |
| **Beginner clarity** | **4** — Table UI; anti-tilt (−150 after 3 wrong); optional length + summary |

**Works as intended?** Yes for the retention-layer goals. Beginners below Rec still get the preflop-only grind.

**Remaining gaps:**

1. **`hand_choice` / `sizing` never selected** in live clients despite 3.6 infrastructure.
2. Strategy authenticity ceiling (all authored) — caps trust for advanced users more than beginners.

---

## 5. Table Sim (`/table` → play → review)

| | |
|---|---|
| **Plan job** | Full hands vs bots — knowledge → skill |
| **Intent fit** | **4** — Real 6-max engine play, 4 presets, 25/50/100 lengths, post-session review with one AI summary + drill links |
| **Variance** | **5** — Highest in the product: deals, button rotate, multi-street, continuous sizing, 5 bot archetypes × 4 table mixes |
| **Correctness** | **5** — `toClientSimState` strips deck/villain cards; version 409; grade only when a served preflop node matches |
| **Depth** | **5** — Only mode that is a full hand, not a snapshot decision |
| **Beginner clarity** | **3** — More cognitive load; presets teach a clear lesson each |

**Works as intended?** Yes as a transfer loop.

**Watch:** Graded coverage improved with dequarantined vs_3bet / vs_4bet nodes; remaining quarantined lines still play out **ungraded**. Bots fall back to archetype widths off-tree. Strategy under bots is still authored approximation.

---

## 6. Ranges (`/ranges`) — reference, not a game

| | |
|---|---|
| **Plan job** | Look up strategy; launch practice |
| **Intent fit** | **5** — Entitled reference; strategy+EV returned by design; “practise this” → Arena preset |
| **Variance** | N/A (browser, not a quiz) — mirrors the servable preflop set (~32) |
| **Correctness** | **5** — Different contract from drills (intentional) |

---

## Cross-product scorecard

| Mode | Intent | Variance | Correctness | Depth | Clarity | Overall health |
|---|---:|---:|---:|---:|---:|---|
| Onboarding / demo | 5 | 1 | 5 | 2 | 5 | Strong |
| Curriculum | 4–5 | 3–4 | 5 | 3–4 | 4 | Strong |
| Daily | 5 | 2–3 | 5 | 2 | 4 | Strong |
| Arena | 4 | 3–4 | 5 | 2–3 | 4 | Strong (was Soft) |
| Table sim | 4 | 5 | 5 | 5 | 3 | Strong |
| Ranges | 5 | — | 5 | — | 5 | Strong |

---

## What “works correctly” means here

**Holding well (product DNA):**

- Server-side grading; client never gets the answer before acting
- SpotTable presentation for drills (beginner-readable)
- Daily sameness + uniqueness constraints
- Sim security boundary and review recomputation from histories
- Curriculum lock/completion server authority
- No dollar results claims on graded surfaces
- Leak → `SpotConfig` map + Arena mix lottery (pure helpers + tests)

**Intentionally constrained (honest, not bugs):**

- Quarantine still holds unrepaired duplicate charts
- Authored approximations + deferred solver → methodology stays honest
- Demo / daily low personal variance by design
- Beginners below 1000 stay on preflop-only Arena

**Still open (not this layer):**

1. Question-type variety built in 3.6 but unused in live loops
2. Strategy authenticity ceiling (all authored) — TexasSolver deferred
3. Remaining quarantined vs_3bet / vs_4bet copies

---

## Variance at a glance

| Mode | What actually varies hand-to-hand |
|---|---|
| Demo | Almost nothing (fixed per user) |
| Daily | Node + hand within 5 preflop slots; identical for all users that day |
| Arena default (&lt;1000) | Preflop among ~32 + instructive hand + difficulty band |
| Arena default (≥1000) | Above + rating-gated postflop share / street / tags |
| Arena via lesson/preset / Go deeper | Explicit filters (3bet, postflop textures, …) |
| Curriculum reading | Fixed content; practice = filtered Arena |
| Sim | Full deal tree + villain mix + streets + sizes |

---

## Not covered by this audit

A **live smoke playthrough** (or targeted Playwright against each loop) to catch
UX failures the architecture audit cannot see — broken CTAs, empty states, CLS
on spot arrival, coach degradation without Gemini. That is separate from this
correctness-of-design report.
