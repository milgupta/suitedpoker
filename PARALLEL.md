# Building in parallel

> ## ⚠️ OPEN BRANCHES — CHECK THIS EVERY SESSION
>
> **Run `git branch -a` and `git worktree list` at the start of every session.**
> If any branch other than `main` exists, it is unfinished work that still has to
> be merged back. Say so out loud in your first message — do not let it sit.
>
> | Branch | Track | Substages | State |
> |---|---|---|---|
> | `track/engine` | C — poker engine | 2.1, 2.2, 2.3 | **merged into `main`** at `5fed6bf` |
> | `track/engine` | C — poker engine | 2.4 → 2.7 | in flight, worktree kept |
>
> `track/data` was never created — 0.4 and 1.1 were both built on `main`, so
> Track B is done. The `track/engine` worktree is **kept** after the 2.1–2.3
> merge rather than removed: Track C's lane was widened (see below) so 2.4–2.7
> run there while `main` runs 1.2/1.3 auth. The two sets of files do not
> intersect.
>
> **Merge-back procedure** (from inside the worktree, once its substages pass):
>
> ```bash
> git fetch origin && git rebase origin/main
> npm install                    # main may have added deps
> npm run verify                 # must pass on the rebased branch
> git -C ~/Desktop/Apps/suitedpoker merge --ff-only track/engine
> git -C ~/Desktop/Apps/suitedpoker push
> ```
>
> `--ff-only` failing means step 1 was skipped. That is the check working, not a
> problem. Rebase onto main — never merge main into the branch. Tick the table
> above once a merge has landed, and only delete the row when the worktree is
> actually removed.

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

### Track A — `main`

| Substage | |
|---|---|
| 0.2 | Design system and motion language — **done** |
| 0.3 | Core UI component library — **done** |
| 1.2 | Auth flows — in flight |
| 1.3 | Entitlement scaffold and route gating |

**Owns:** everything except Track C's lane. In practice that is `src/app/**`,
`src/components/**`, `src/lib/**`, `src/db/**`, `supabase/**`, `scripts/*`
except `import-solutions.ts`, `docs/**`, and the root docs.

**Runway:** 1.2 → 1.3, then converges with Track C at 3.1.

---

### Track B — Data & infra · branch `track/data`

| Substage | |
|---|---|
| 0.4 | Redis, caching, rate-limit primitives — **done, on `main`** |
| 1.1 | Database schema and RLS — **done, on `main`** |

> Both were built sequentially on `main` rather than on `track/data`, which was
> never created. This track has nothing left in it.

**Owns:** `src/db/**`, `src/lib/redis.ts`, `src/lib/ratelimit.ts`,
`src/lib/sessionstore.ts`, `supabase/**`, `drizzle.config.ts`, `scripts/seed.ts`

**Runway:** 2 substages. 1.2 (auth) then needs Track A's 0.3, so B pauses and
merges before continuing.

---

### Track C — Poker engine · branch `track/engine`

| Substage | |
|---|---|
| 2.1 | Cards, deck, hand evaluator — **done, merged** |
| 2.2 | Range model and notation parser — **done, merged** |
| 2.3 | Game state machine — **done, merged** |
| 2.4 | Solution data model, loader, preflop set |
| 2.5 | Hand classification and postflop templates |
| 2.6 | Spot generator |
| 2.7 | Grading engine |

**Owns — exclusively:**

```
src/poker/**
src/content/solutions/**
scripts/import-solutions.ts
tests/unit/poker/**
```

> Widened after the 2.1–2.3 merge. The original lane was `src/poker/**` plus
> `tests/unit/**`, which was wrong in both directions: it claimed all of
> `tests/unit` (Track B legitimately needed `redis`, `ratelimit`, `rls`,
> `sessionstore` there) while not claiming the solution data and importer that
> 2.4 onward cannot be built without.

**Runway:** 4 substages. Still fully independent of `main`'s 1.2/1.3 auth work.
`src/poker` is pure TypeScript by architectural rule — no React, no DB, no
framework — and `src/content/solutions/**` is inert JSON, so neither can collide
with an auth flow.

This is also the most correctness-critical code in the product. Give it the agent
you trust most and do not rush the verification.

**Known cross-lane dependency:** 2.4 adds a `provenance` field to the solution
format. The matching `preflop_nodes.provenance` column lives in `src/db/schema.ts`
and needs a migration — both Track A's. Track C cannot add it and must not try.

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

6. **Tests are owned per area, not per directory.** `tests/unit/` is shared
   ground: a track puts its tests in the subdirectory matching what it owns
   (`tests/unit/poker/**` for Track C) or names them after the module under
   test (`tests/unit/redis.test.ts`). Nobody owns `tests/unit/**` wholesale —
   that claim was in this document once and it was already being violated by
   the time anyone read it.

---

## Convergence points

After the tracks above land, the graph re-converges and parallelism drops:

- ~~**1.2** (auth) needs Track A's 0.3~~ — satisfied, 0.3 is on `main`
- ~~**2.4** (preflop solutions) needs Track B's 1.1~~ — satisfied, 1.1 is on `main`
- **3.1** (poker table) needs A's 0.3 and C's 2.3 → everything merges here

Both blockers cleared, so the current wave is **1.2→1.3** on `main` and
**2.4→2.5→2.6→2.7** on `track/engine` — two tracks, not three. They meet at 3.1.

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
