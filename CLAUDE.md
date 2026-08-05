# SuitedPoker — working notes for Claude Code

Read this before touching anything.

## What this is

A GTO poker trainer for beginners. NLHE, 6-max cash, 100bb. Built in numbered
substages from `SUITEDPOKER_BUILD_PLAN.md` — **one substage per session**. Start a
fresh context for each. Do not attempt several at once; long contexts are where
file paths get invented and earlier work gets silently broken.

## Rules that are not negotiable

1. **`src/poker/**` is PURE TypeScript.** No React, no DB, no `next/*`, no network,
   no filesystem. Enforced by ESLint. If a task seems to need a DB client in
   there, pass the data in as an argument instead — the design is wrong, not the
   rule.

2. **The AI never determines poker strategy.** Every solution — frequencies, EVs,
   the best action — is precomputed and stored. The model's only job is to
   explain ground truth it was handed. If a model output ever contradicts the
   supplied data, that is a bug, not a style issue.

3. **Grading is server-side, always.** The client must never receive the strategy,
   the EV table, the correct action, or the node reference before the user acts.
   There are explicit tests for this; do not weaken them.

4. **Mobile first.** Design at 390×844, then scale up. Minimum 44px touch targets.
   Most users arrive on a phone from an ad.

5. **No dollar-denominated results claims anywhere.** Not "won $X", not "+226%".
   bb/100 and accuracy only. This is an ad-account and compliance boundary, not a
   copy preference.

## Before saying a substage is done

Run `npm run verify`. Then work through that substage's **✅ Done when** list and
report a pass/fail table. If anything fails, fix it and re-run — do not report a
partial pass as done.

## Style

- TypeScript strict, `noUncheckedIndexedAccess` on.
- Prettier owns formatting. Do not hand-format.
- Comments explain *why*, never *what*.
- Prefer a named function over a clever one-liner in engine code.
