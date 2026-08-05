# The solver scenario matrix

This guide is for a poker consultant reviewing or editing what we solve. You do
not need to write code to read it, and most of the review work is reading, not
typing.

> **Where this file lives.** The build plan asks for `docs/SCENARIO-MATRIX.md`.
> It is here instead, beside the matrix it describes, matching the same call
> made for `solutions/AUTHORING.md`. One `git mv` if you want it elsewhere.

---

## What this is, and what it is not

We are **not** writing a solver. [TexasSolver](https://github.com/bupticybee/TexasSolver)
is an open-source CFR implementation that does the actual work. This matrix is
the list of questions we hand it.

It is the only step in the whole pipeline that needs poker judgment. Everything
downstream is mechanical. **A mistake here does not produce an error — it
produces a confident, precise, wrong answer**, because the solver will happily
return a perfect strategy for a spot that never occurs at a real table.

## The one command

```bash
npx vitest run tests/unit/poker/solver-matrix.test.ts
```

It validates every scenario, checks the pot arithmetic, confirms every range
parses and survives card removal on every board, and prints the solve budget.

---

## Current shape of the matrix

| | |
|---|---|
| Scenarios | 46 |
| Boards per scenario | 5 |
| **Total solves** | **230** |
| Split | 140 single-raised, 90 three-bet · 130 flop, 100 turn |
| Stack depth | 100bb effective |
| Rake | 5%, capped at 3bb |
| Accuracy target | 0.3% of pot exploitability |

---

## How to read a scenario

```json
{
  "id": "srp-btn-vs-bb-flop-pfr",
  "label": "Single-raised pot: BTN vs BB, flop, hero as the preflop raiser",
  "rationale": "The single most common postflop configuration in 6-max...",
  "potType": "srp",
  "heroPos": "BTN",
  "villainPos": "BB",
  "street": "flop",
  "actionHistory": [
    { "actor": "SB",  "action": "post",  "toBb": 0.5 },
    { "actor": "BB",  "action": "post",  "toBb": 1 },
    { "actor": "BTN", "action": "raise", "toBb": 2.5 },
    { "actor": "BB",  "action": "call",  "toBb": 2.5 }
  ],
  "potBb": 5.5,
  "heroRange": "22+,A2s+,...",
  "heroRangeRef": "BTN:rfi#raise",
  "villainRangeRef": "BB:vs_rfi_BTN#call",
  "boards": ["Ah 7d 2c", "..."],
  "betTree": { "flop": [0.33, 0.75], "turn": [0.5, 1], "river": [0.5, 1.25],
               "raiseSizes": [2.5], "allowAllIn": true },
  "rake": { "percent": 0.05, "capBb": 3 },
  "accuracyTargetPctPot": 0.3
}
```

**`toBb` is a running total, not an increment.** In the history above the big
blind posts 1 and then calls *to* 2.5 — it does not put in another 2.5. The pot
is the sum of each actor's final commitment: 0.5 + 2.5 + 2.5 = 5.5.

**`potBb` is checked against `actionHistory` automatically.** You cannot ship a
scenario whose pot disagrees with the action that created it; the schema
rejects it and names the discrepancy.

**`heroRangeRef` is the important field.** `BTN:rfi#raise` means "the hands
`BTN:rfi` raises, at the frequencies it raises them". The ranges are **imported**
from the preflop solution set, never retyped here, and a test asserts each one
still reproduces exactly from its recorded node. **If you want to change a
range, change the preflop solution file, not this matrix** — otherwise the two
drift and the drift test fails.

---

## The flop subset rule

There are exactly **1,755 strategically distinct flops** — `Ah 7d 2c` and
`As 7c 2d` are the same problem, because relabelling suits turns one into the
other. Solving all of them would multiply compute by roughly 350x per scenario.

We solve **5 flops per scenario**, selected in two phases:

1. **Coverage first.** Greedily take flops until every texture tag is present —
   dry, wet, paired, monotone, two-tone, rainbow, ace-high, connected, low,
   broadway — preferring the most *common* flop that adds a new tag.
2. **Frequency second.** Any remaining slots go to strata in proportion to how
   often that texture really occurs.

**Why not just sample proportionally?** Because it does not work at this size,
and this was found by the test rather than by argument: a purely proportional
subset of 5 comes out entirely high, dry and disconnected, since that is what
most flops are. Monotone and paired boards never get solved — and those are
precisely the textures a beginner plays worst.

Selection is deterministic. The same `n` and seed always give the same flops,
which matters because the solve cache is keyed on them.

**Known limitation, stated plainly:** turn and river cards are *not* stratified
the way flops are. They alternate between a blank and a scare card so that "what
to do when the flush comes in" is covered, but they are not frequency-weighted.
If turn play turns out to matter more than expected, this is the first thing to
improve.

---

## The bet tree

Two sizes per street, one raise size, all-in allowed:

```
flop  33%  75%
turn  50%  100%
river 50%  125%
```

**This is deliberately small.** The solver output is bucketed into ~12 hand
classes downstream, so a six-size tree produces precision that the bucketing
immediately discards — at roughly ten times the compute. It is a choice, not an
oversight, and it should be stated that way publicly.

If you think a specific spot genuinely needs a size that is missing (a small
river block bet, say), that is a good reason to add one **to that scenario**.
It is not a good reason to widen the tree everywhere.

## Rake

**5%, capped at 3bb, on every scenario. It is never zero, and the schema
rejects a scenario that sets it to zero.**

Rake-free solves systematically overstate how wide you should play. That is
exactly the mistake a beginner product must not teach, and it is the most
common way published charts mislead people.

---

## REVIEW CHECKLIST

The six things most likely to be wrong, in the order I would check them.

### 1. Are the ranges right for the position?

Read `heroRangeRef` and `villainRangeRef` first. If the reference is wrong, the
range is wrong no matter how good it looks. A BTN opening range appearing in a
UTG scenario is the failure mode.

Then sanity-check the width. UTG opens ~14%, MP ~20%, CO ~28%, BTN ~48%,
SB ~39%. A range noticeably outside that is a bug in the preflop set, not here.

### 2. Is the pot consistent with the action history?

The schema checks the arithmetic, but not the *story*. A 22.5bb pot labelled
"single-raised" is arithmetically fine and strategically nonsense. Check that
`potType` matches what `actionHistory` actually describes.

### 3. Does the bet tree include the size this spot needs?

Some spots have a size that carries most of the strategy — a 25% stab on a
paired board, a big river overbet. If the tree omits it, the solve is answering
a different question than the one the spot poses.

### 4. Is rake set?

Never zero. See above.

### 5. Is the stack depth right for the pot type?

`effStackBb` is what remains *behind* after the preflop action, not the starting
stack. A 3-bet pot at 100bb behind is wrong — the players already put ~11bb in
each. Wrong stack depth changes the strategy more than almost anything else on
this list.

### 6. Are hero and villain the right way round?

Every matchup is solved from both seats, and the two are one word apart in the
id (`-pfr` versus `-caller`). Check `heroPos` against the label. The schema
catches hero and villain being the *same* seat, but not them being swapped.

---

## Adding a scenario

Scenarios are generated from a matchup table in `matrix.ts` rather than written
out one by one, so that ranges cannot drift and pot arithmetic cannot be typed
wrong. To add one, add a matchup:

```ts
{
  opener: "CO",
  responder: "SB",
  potType: "srp",
  openTo: 2.5,
  rationale: "Why this earns a solver slot — one sentence, specific.",
}
```

Every matchup is automatically solved on the flop and turn, from both seats.
The ranges are looked up from the preflop set, the pot is derived from the
action history, and the boards are selected by the subset rule.

If the matchup references a solution node that does not exist, the build
**throws** rather than skipping it quietly.

## What is NOT decided here

- **Which sizings the solver explores within a size** — that is TexasSolver's
  own tree config in 2.9.
- **How the output is bucketed into hand classes** — that is 2.9 and 2.5.
- **Whether the result replaces the authored approximation** — that is 2.10,
  and it is what flips `provenance` from `authored-approximation` to
  `solver-verified` in the shipped data.
