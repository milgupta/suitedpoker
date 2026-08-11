# The solve pipeline — operations

Turns the 2.8 scenario matrix into solved postflop data. Three parts: **run**,
**bucket**, **explain**.

> ## 2.10 IS DEFERRED — read this before restarting it
>
> **Status: the pipeline works, the data set does not ship. Postflop stays on
> authored approximations, and `/methodology` keeps its honest wording.** That
> is a deliberate decision, not an unfinished task.
>
> ### What the smoke run established (2026-08-06, TexasSolver `42313c9c`)
>
> One `--smoke` solve of `srp-btn-vs-bb-flop-pfr--AcKdTh`:
>
> - ✅ **`parseSolverOutput` is VERIFIED.** It read 355 hero combos with
>   plausible non-round frequencies — 0.3713 check / 0.6282 bet_66 / 0.0005
>   allin. This was the one component with no test, by design, and the format
>   guess was right.
> - ❌ **`evs` is empty for every combo**, and `bucket.ts` correctly refused to
>   emit a template rather than stamp `solver-verified` on data the grader would
>   read as all-actions-equal.
> - ⚠️ **15.75% exploitability after 31 iterations**, stopping on the iteration
>   cap against a 0.3% target.
> - ⏱ **273 seconds** for those 31 iterations.
>
> ### What the tuning pass established (2026-08-10, same solver commit)
>
> **ONE SOLVE HAS NOW CONVERGED, MEASURED.** `srp-btn-vs-bb-flop-pfr--AcKdTh`
> (BTN c-bet vs BB defence, single-raised pot, flop Ac Kd Th, pot 5.5bb, stacks
> 97.25bb) reached **0.4861% of pot against a 0.5% target at iteration 201,
> in 3,099s wall** — 15.4s/iteration on 10 threads of an Apple M3 Pro (arm64
> image, no emulation), inside a Docker VM capped at 7.75GiB. Tree build was
> ~6s; the wall time is CFR plus a best-response evaluation every 10
> iterations. The dump round-tripped through `parseSolverOutput` (455 combos,
> plausible non-round frequencies), re-proving the parse path on a full-size
> output. Run it yourself with:
>
> ```bash
> npx tsx tools/solver/tune.ts --sizes=0.66 --raise=1.0 \
>   --accuracy=0.5 --iterations=400 --threads=10
> ```
>
> **The config that converged** (everything else as `buildSolverInput` emits):
> one bet size per street (66% pot) plus all-in, raise size 100% of pot,
> `set_allin_threshold 0.67`, isomorphism on, accuracy 0.5% of pot, iteration
> cap 400.
>
> The measured trajectory, for calibrating future changes — a clean geometric
> decay, roughly ×0.91 per 10 iterations late-phase:
>
> | iter | 0 | 11 | 41 | 101 | 141 | 191 | 201 |
> |---|---|---|---|---|---|---|---|
> | % of pot | 310.7 | 66.5 | 12.9 | 2.09 | 1.03 | 0.53 | **0.486** |
>
> Extrapolating that decay, the scenario files' current 0.3% target needs
> ~255 iterations (~65 min here) — reachable, just ~25% dearer. 0.5% is the
> better trade for data that is immediately bucketed into ~12 hand classes.
>
> **What the smoke run's 15.75% actually was: not a stall.** The trajectory
> above passes ~21% at iteration 31, which is where the smoke run's
> 40-iteration cap stopped it. The diagnosis in the earlier note — that
> raising the cap "is unlikely to close a fifty-fold gap" — was WRONG:
> the cap alone was the whole problem. Convergence needs ~200 iterations,
> the smoke cap allowed 40, and `DEFAULT_MAX_ITERATIONS` was 200 — which
> this measured solve would have missed by exactly one iteration. The
> default is now 600 (a safety net, not a budget; the accuracy stop is
> what should end a solve).
>
> **The FULL batch tree has never run one iteration on this machine.** Two
> sizes per street + raise + all-in (the `DEFAULT_BET_TREE` in
> `src/content/solver/matrix.ts`) was OOM-killed (exit 137) during iteration 0
> in the 7.75GiB Docker VM. It may fit on the 32GB target box — nobody has
> shown that. The 1-size tree above is the only configuration proven end to
> end, and for a beginner product whose output is bucketed to ~12 rows per
> spot, it is arguably the right tree, not a compromise.
>
> **Two configuration bugs found by reading the generated input against the
> solver's own sample:**
>
> - **`raiseSizes: [2.5]` emits `set_bet_sizes …,raise,250` — a 2.5×-POT
>   raise.** TexasSolver raise sizes are percent of pot (its sample input uses
>   `60`), so the matrix has been asking for absurd raises at every node. The
>   converged run used `raise,100` (pot-size). Fixing `DEFAULT_BET_TREE` is a
>   `src/content/solver/matrix.ts` change — outside this directory — and it
>   changes every input hash, correctly forcing re-solves.
> - **Rake is recorded but never applied.** `buildSolverInput` hashes
>   `job.rake` and emits no rake command — because the console solver HAS no
>   rake command (verified against the binary's command strings: `set_accuracy`
>   … `set_use_isomorphism`, nothing rake-shaped). Every solve is rake-free,
>   while the schema refuses a zero rake on the grounds that rake-free solves
>   overstate how wide to play. Decide before the batch: accept and document
>   the caveat on `/methodology`, or find a solver that models rake. Do NOT
>   quietly leave the schema implying something the solver never did.
>
> ### Batch cost, extrapolated from the ONE measured solve
>
> All numbers assume the validated 1-size tree at 0.5% — the only measured
> configuration — and are extrapolations, not measurements:
>
> - Flop solve: **0.86h** (measured, once). Turn solves (100 of 230) have a
>   4-card board and one fewer street of subtrees; **assume ~half**, unmeasured.
> - Batch: 130 flop × 0.86h + 100 turn × 0.43h ≈ **155 machine-hours** at
>   M3-Pro-ish pace.
> - On one rented 32-core box (~$0.50/hr, 64GB so three concurrent 10-thread
>   solves fit — this solve peaked under ~7GB): wall ≈ 155h ÷ 3, padded for
>   cloud cores being slower than M3 cores, call it **~3 days and $35–50**.
>   Two boxes halve the wall time for the same dollars; the solves share
>   nothing.
> - Disk: the raw dump was **74MB per solve** at `set_dump_rounds 2`, so the
>   working directory wants ~20GB, not the ~5GB estimated below.
>
> ### The two things that must still be true before a batch is worth running
>
> **1. EVs must be computed HERE, in a second pass.** TexasSolver's console
> `dump_result` emits strategy only — there is no EV flag, and the GUI computes
> EVs client-side rather than exporting them. So the options are down to one:
> walk the solved strategy tree and compute the EV of each action ourselves.
> That is legitimate and well-defined — the strategy is the hard part and it is
> already solved — but it is real work and it needs its own tests.
>
> **Deriving EVs from frequencies is NOT an option.** A frequency is not an EV,
> and numbers nobody computed, stamped `solver-verified`, is the precise failure
> the provenance system exists to prevent.
>
> **2. The matrix must be moved onto the validated settings.** The converged
> configuration lives only in a `tune.ts` command line so far. Before a batch:
> in `src/content/solver/matrix.ts` (outside this directory), set
> `DEFAULT_BET_TREE` to one size per street + all-in with `raiseSizes: [1.0]`,
> and `ACCURACY_TARGET_PCT_POT` to 0.5 — or keep 0.3 and pay the ~25% premium,
> but decide it rather than inherit it. Settle the rake question from the
> tuning-pass note above at the same time. Every input hash changes, which is
> the resume machinery working, not breaking.
>
> ### The order to resume in
>
> 1. ~~Fix the settings until ONE solve converges to target. Measure it.~~
>    **DONE 2026-08-10** — 0.486% at iteration 201, 3,099s, config above.
> 2. Move the validated settings into the matrix (item 2 above) and decide the
>    rake caveat.
> 3. Build and test the EV pass.
> 4. Rent the hardware and run the batch — budget from the extrapolation above,
>    and re-check tree memory on the target box FIRST with one solve: the
>    2-size tree OOMed a 7.75GiB VM and has never been sized anywhere else.
> 5. Only then does `/methodology` change — and it changes because
>    `provenanceHeadline()` reads the data, not because anyone edits the copy.
>
> ### What is true in the meantime
>
> Every solution file carries `authored-approximation`, `/methodology` says so
> in those words, and the landing page derives its claim from the data. Nothing
> here is blocking launch. Do not hand-edit that copy to claim a solver.
>
> ## The original warning, kept for context
>
> `parseSolverOutput` in `run-batch.ts` is the only component here with no test,
> deliberately. The only test that could exist would assert it parses a fixture
> we wrote, which proves it matches *our guess* at TexasSolver's output format
> and nothing else.
>
> A wrong guess does not throw. It produces plausible numbers that are silently
> wrong, in templates stamped `provenance: "solver-verified"` — the exact
> failure the provenance system exists to catch.
>
> **Until `--smoke` has completed against a real solver, treat every number this
> pipeline produces as unproven.**

---

## Quick reference

```bash
# 1. Build the solver image (once). Records the real commit it cloned.
docker build --build-arg TEXASSOLVER_REF=master \
  -t suitedpoker/texassolver:pinned tools/solver

# 2. See the plan without running anything.
npx tsx tools/solver/run-batch.ts --dry-run

# 3. ONE solve, loose target, minutes not hours. Do this first, always.
npx tsx tools/solver/run-batch.ts --smoke

# 4. ONE solve with overridden settings, stdout streamed to a log so the
#    convergence CURVE is visible while it runs. This is how the validated
#    configuration was found; results land in out/tune/, never out/solves/.
npx tsx tools/solver/tune.ts --sizes=0.66 --raise=1.0 --accuracy=0.5 \
  --iterations=400 --threads=10

# 5. The full batch, resumable.
npx tsx tools/solver/run-batch.ts --resume
```

Everything lands in `tools/solver/out/` — `solves/` (one JSON per solve),
`templates/` (2.5-schema postflop templates), and `manifest.json`.

## Target machine

| | |
|---|---|
| RAM | 32GB. **The two-size flop tree OOMed a 7.75GiB Docker VM at iteration 0 (exit 137)** — "fits comfortably" was a guess, so size ONE solve on the target box before committing to the batch. The validated one-size tree peaked under ~7GB. |
| Cores | 8+. `set_thread_num` is 8 in the generated input; raise it with the box. |
| Disk | ~20GB working space: one dump at `set_dump_rounds 2` measured **74MB**, × 230 solves, before the parsed results and templates. |
| OS | Anything that runs Docker. |

Any cloud provider works. This is embarrassingly parallel across solves — if
one machine is too slow, split the matrix by scenario across several boxes and
merge the `out/solves/` directories, since each solve is a self-contained file
keyed by its input hash.

```bash
# Provision, run, pull results.
ssh box 'git clone <repo> && cd suitedpoker && npm install'
ssh box 'docker build -t suitedpoker/texassolver:pinned tools/solver'
ssh box 'cd suitedpoker && npx tsx tools/solver/run-batch.ts --resume' | tee solve.log
rsync -av box:suitedpoker/tools/solver/out/ ./tools/solver/out/
```

## Resuming

The whole batch is one command with `--resume`. A solve is considered done when
its output file exists **and** records the same input hash — so re-running skips
finished work, but editing a bet tree, a range or an accuracy target re-solves
the affected jobs instead of silently reusing stale output.

A crash costs exactly one solve. Every result is written to disk the moment it
completes, before anything else happens.

## What gets recorded, and why

`manifest.json` carries the provenance you will publish:

- **`solverCommit`** — read from `/solver-commit.txt` inside the image, which
  the Dockerfile writes from the actual clone. Never hand-typed.
- **`exploitability`** per solve, as a percentage of the pot.
- **`stopReason`** — `exploitability` (converged) or `iteration-cap` (**did
  not**). A capped solve is marked `suspect: true`, and its template's
  confidence block says so in words. Non-convergence is never silently
  included.
- **`wallMs`** and **`memoryHighWaterMb`** per solve.
- **`inputHash`** — what resume compares against.

## Bucketing: 1,326 combos → ~12 rows

`bucket.ts` classifies every combo with **`classifyHand` imported from 2.5** —
never reimplemented. If the two diverged, the product would grade against a
strategy describing different hands than the ones it names, and nothing would
fail loudly. There is a test asserting `bucket.ts` contains no classifier of
its own.

The number worth reading is not the average, it is the **within-bucket
variance**. If the solver plays combos inside one hand class very differently,
the average describes neither half. Any row whose top-action standard deviation
exceeds **0.15** is flagged, listed in the run output, and named in the
template's confidence note. **Those are the rows a human must look at.**

Frequencies round to 2dp and EVs to 3dp, with the residue placed on the largest
entry so the sum stays exactly 1.0 (the 2.5 schema rejects anything else).
Values are deliberately **not** snapped to clean fractions — irregular numbers
like 0.63/0.37 are the visible evidence that this is real solve output.

## Rationales

Drafted from the computed numbers only. The model explains ground truth; it
never determines it — the same rule as the runtime coach.

Every draft is checked against its own data: if the prose names an action other
than the computed best one, or recommends an action the solver never takes, it
is regenerated once and then replaced by a deterministic rationale built from
the numbers. The fallback cannot contradict the data because it is generated
from it, so a missing API key or a model having a bad day degrades to something
*correct* rather than something wrong.

**Everything ships `reviewed: false`.** 2.10 flips it.

## Cost planning

`--dry-run` prints the plan. The matrix is **46 scenarios × 5 boards = 230
solves** — 130 flop and 100 turn.

The one MEASURED data point (2026-08-10, deferral note above): a flop solve on
the validated one-size tree converged at **0.486% of pot in 3,099s** on 10
threads of an M3 Pro. From that, the extrapolation in the deferral note:
~155 machine-hours for the batch, roughly **3 days and $35–50 on one rented
32-core box** running three solves in parallel. Do NOT multiply the old
273s smoke number by anything — that run was capped at 40 iterations and
proves only that the path executes.

A turn solve starts one street later and should cost materially less than a
flop solve; that ratio is assumed (½), not measured. The first hour of a real
batch will say whether the estimate holds — check it before leaving the box
to run.
