# Building in parallel

Three Claude Code instances can work on this repo simultaneously without stepping
on each other, because the dependency graph has three genuinely independent
tracks and each one owns a different set of directories.

This document assigns the lanes. **Read your track's "owns" list and do not write
outside it.**

---

## Setup — git worktrees

A worktree is a second checkout of the same repository on a different branch,
in a different folder. Three worktrees, three Claude Code windows, one repo.

```bash
cd ~/Desktop/Apps/suitedpoker

git worktree add ../suitedpoker-engine  -b track/engine
git worktree add ../suitedpoker-data    -b track/data
# your existing folder stays on main and is Track A
```

You now have:

```
Desktop/Apps/suitedpoker          → main        → Track A (design)
Desktop/Apps/suitedpoker-engine   → track/engine → Track C (poker)
Desktop/Apps/suitedpoker-data     → track/data   → Track B (data & infra)
```

Run `npm install` once in each. Open one Claude Code per folder.

To remove one when its track is done and merged:

```bash
git worktree remove ../suitedpoker-engine
```

---

## The three tracks

### Track A — Design · branch `main`

| Substage | |
|---|---|
| 0.2 | Design system and motion language |
| 0.3 | Core UI component library |

**Owns:** `src/app/**`, `src/components/**`, `src/lib/motion.ts`, `DESIGN.md`

**Runway:** 2 substages, then blocks — 1.2 needs 0.3, and everything visual
downstream needs both.

---

### Track B — Data & infra · branch `track/data`

| Substage | |
|---|---|
| 0.4 | Redis, caching, rate-limit primitives |
| 1.1 | Database schema and RLS |

**Owns:** `src/db/**`, `src/lib/redis.ts`, `src/lib/ratelimit.ts`,
`src/lib/sessionstore.ts`, `supabase/**`, `drizzle.config.ts`, `scripts/seed.ts`

**Runway:** 2 substages. 1.2 (auth) then needs Track A's 0.3, so B pauses and
merges before continuing.

---

### Track C — Poker engine · branch `track/engine`

| Substage | |
|---|---|
| 2.1 | Cards, deck, hand evaluator |
| 2.2 | Range model and notation parser |
| 2.3 | Game state machine |

**Owns:** `src/poker/**` and `tests/unit/**` — **exclusively**

**Runway:** 3 substages, and it is the longest fully-independent chain in the
project. `src/poker` is pure TypeScript by architectural rule — no React, no DB,
no framework — which is precisely why this track can run start to finish without
touching a single file another track cares about.

This is also the most correctness-critical code in the product. Give it the agent
you trust most and do not rush the verification.

---

## Rules for every track

1. **Never write outside your `owns` list.** If a substage seems to require it,
   stop and say so rather than reaching across lanes.

2. **`package.json` is shared and is the one real conflict risk.** If your track
   needs a new dependency, install it, and say so clearly in your summary so the
   merge is expected rather than a surprise.

3. **Rebase before you merge**, never merge main into your branch:
   ```bash
   git fetch origin && git rebase origin/main
   npm run verify
   ```

4. **`npm run verify` must pass on your branch before you open a PR.** A broken
   branch blocks two other people.

5. **Update the progress table in `CLAUDE.md` only on `main`.** Otherwise three
   tracks all edit the same table and every merge conflicts.

---

## Convergence points

After the tracks above land, the graph re-converges and parallelism drops:

- **1.2** (auth) needs Track A's 0.3 → merge A before B continues
- **2.4** (preflop solutions) needs Track B's 1.1 → merge B before C continues
- **3.1** (poker table) needs A's 0.3 and C's 2.3 → everything merges here

So: run three tracks now, merge all three, then the next wave is
**0.4→1.2→1.3** on one side and **2.4→2.5→2.6→2.7** on the other — two tracks,
not three.

Stage 2.8–2.10 (the solver pipeline) forks off again and can run alone the whole
time once 2.5 exists.

---

## The honest constraint

The model is not your bottleneck. **You are.**

Three agents means three sets of questions arriving at once, three
`✅ Done when` lists to verify, and three PRs to review. Two tracks is
comfortable. Three is work. Four would mean rubber-stamping, and rubber-stamped
substages are how you end up debugging a hand evaluator in week three.

Start with two — **Design and Poker Engine**, since they share nothing at all —
and add the third only if you are genuinely keeping up.
