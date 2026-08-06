# The solve pipeline — operations

Turns the 2.8 scenario matrix into solved postflop data. Three parts: **run**,
**bucket**, **explain**.

> ## ⚠️ The parser is unverified until a real solve has run
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

# 4. The full batch, resumable.
npx tsx tools/solver/run-batch.ts --resume
```

Everything lands in `tools/solver/out/` — `solves/` (one JSON per solve),
`templates/` (2.5-schema postflop templates), and `manifest.json`.

## Target machine

| | |
|---|---|
| RAM | 32GB. A single flop solve with two bet sizes fits comfortably; the turn nodes are the memory-hungry ones. |
| Cores | 8+. `set_thread_num` is 8 in the generated input; raise it with the box. |
| Disk | ~5GB for a full batch of 230 solves plus working files. |
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
solves**. Multiply the smoke solve's wall time by 230 for a first estimate,
then add margin: the smoke run uses one bet size and a 2% accuracy target,
while the real batch uses two sizes and 0.3%, which is materially more work per
solve.

Turn nodes cost more than flop nodes. The matrix is 130 flop and 100 turn.
