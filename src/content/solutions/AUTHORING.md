# Authoring solution data

This guide is for a poker consultant writing strategy data for SuitedPoker. You
do not need to write or read any code. You edit JSON files in this folder and
run one command to check your work.

> **Where this file lives.** The build plan asks for `docs/AUTHORING.md`. It is
> here instead because it sits next to the data it describes and because the
> engine lane owns `src/content/solutions/**` but not `docs/`. Moving it is one
> `git mv` if you would rather it lived with the other docs.

---

## The one command you need

```bash
npx tsx scripts/import-solutions.ts --check
```

This validates every file and writes nothing. If it prints `✓`, your work is
valid. If it prints `✗`, it tells you the exact file, the exact hand, and the
exact rule you broke. Run it every time you save.

---

## What you are writing

Two kinds of file.

**Preflop nodes** (`preflop/`) — one file per decision point. "I am on the
button, everyone folded to me, what do I do with each of the 169 hands?"

**Postflop templates** (`postflop/`) — one file per scenario. "Button opened,
big blind called, the flop is ace-high and dry, big blind checked. What does
the button do with each *kind* of hand?"

The difference matters. Preflop you write a strategy for every one of the 169
starting hands. Postflop you write a strategy for each **hand class** — "top
pair good kicker", "flush draw" — because no beginner internalises a
1,326-combo strategy, and because 50 templates × 12 classes is authorable by
one person where a full solver tree is not.

---

## Rules that are enforced

The checker will reject your file if any of these are broken.

1. **Every preflop file has all 169 hands.** Both in `strategy` and in `ev`.
2. **Frequencies sum to 1.0** for every hand, within ±0.001.
3. **Every frequency is between 0 and 1.**
4. **`ev` covers every action in `actions`** — not just the ones you play.
   This one catches people out. If a hand folds 100%, you must still say what
   raising would have been worth, because the app grades users who raise it.
5. **`provenance` is present.** See below.
6. **Every rationale is at least 20 characters.** Write a real sentence.

---

## Provenance — read this before you write anything

Every file declares where its numbers came from:

```json
"provenance": "authored-approximation"
```

- `authored-approximation` — ranges derived from published charts and
  experience. Honest, useful, and **not** solver output.
- `solver-verified` — produced by an actual solver run.

**Use `authored-approximation` unless you personally ran a solver.** The app
labels what the user sees based on this field. Claiming solver-verified data
you do not have is the single fastest way to lose credibility with poker
players, who will notice.

---

## Confidence — where should someone spend review time?

Every file also carries a confidence block:

```json
"confidence": {
  "rangeShape": "high",
  "frequencies": "low",
  "ev": "low",
  "note": "The hand SET is standard and I would defend it. The mixed weights on the small pairs are the least certain numbers here — solvers disagree by 20-30 points depending on rake."
}
```

Three axes, each `high` / `medium` / `low`:

- **rangeShape** — would you defend *which hands* are in the range?
- **frequencies** — would you defend the *mixes*, the 0.65s and 0.4s?
- **ev** — would you defend the EV numbers?

**Do not write "everything is approximate" in the note.** That is true of the
whole file and helps nobody. Write which twenty numbers you would check first.
A good note names a specific hand, class, or family. A bad note is generic.

---

## A worked example: a preflop node

`preflop/BTN.rfi.json` — the button, folded to, deciding whether to open.

```json
{
  "solutionSet": "suitedpoker-6max-100bb-v1",
  "provenance": "authored-approximation",
  "heroPos": "BTN",
  "actionSeq": "rfi",
  "potBb": 1.5,
  "effStackBb": 100,
  "actions": ["fold", "raise"],
  "confidence": { "...": "as above" },
  "notes": "Opening range for BTN, folded to hero. Open size 2.5bb.",
  "strategy": {
    "AA": { "raise": 1 },
    "A5o": { "raise": 1 },
    "A4o": { "raise": 0.5, "fold": 0.5 },
    "72o": { "fold": 1 }
  },
  "ev": {
    "AA": { "fold": 0, "raise": 5.5 },
    "A5o": { "fold": 0, "raise": 0.61 },
    "A4o": { "fold": 0, "raise": 0 },
    "72o": { "fold": 0, "raise": -1.42 }
  }
}
```

Read the four hands:

- **AA** raises 100%. Raising is worth 5.5bb more than folding. Nobody folds aces.
- **A5o** raises 100%, but only just — raising is worth 0.61bb. It is near the
  bottom of the range.
- **A4o** is a coin flip: half raise, half fold. Look at its EV — raising is
  worth **0**, exactly the same as folding.
- **72o** folds. Raising it would cost 1.42bb.

### The rule that makes the numbers hang together

**A hand that mixes must be nearly indifferent.** That is *why* it mixes. If
you write `{"raise": 0.5, "fold": 0.5}` then raising and folding must be worth
close to the same, or the frequencies are lying about the EVs.

Concretely:

| Frequencies | What the EVs must look like |
|---|---|
| 100% raise | raise EV clearly above fold EV |
| 62% raise / 38% fold | raise EV slightly above 0 — around 0.2bb |
| 50/50 | both about 0 |
| 100% fold | raise EV clearly negative |

The existing files were built this way, and the checker's poker-sanity tests
assume it. If you write a hand that raises 90% of the time but has a raise EV
of 0.01bb, something is wrong with one of the two numbers.

**Fold EV is always exactly 0.** It is the baseline everything else is measured
against. Never write anything else.

---

## A worked example: a postflop template

```json
{
  "id": "srp-btn-cbet-ace-high-dry",
  "provenance": "authored-approximation",
  "label": "BTN opens, BB calls; BB checks a dry ace-high flop",
  "street": "flop",
  "heroPos": "BTN",
  "villainPos": "BB",
  "potBb": 5.5,
  "effStackBb": 97.5,
  "heroRange": "22+,A2s+,K2s+,...",
  "villainRange": "22-88,A2s-A9s:0.7,...",
  "boardTags": ["dry", "ace-high", "rainbow"],
  "exampleBoards": ["Ah 7d 2c", "As 8h 3d", "Ad 6c 2h"],
  "actionHistory": ["BTN opens 2.5bb", "BB calls", "BB checks"],
  "actions": ["check", "bet_33", "bet_66", "bet_100"],
  "strategies": [
    {
      "handClass": "top_pair_good_kicker",
      "strategy": { "bet_33": 0.85, "check": 0.15 },
      "ev": { "check": 2.4, "bet_33": 2.72, "bet_66": 2.42, "bet_100": 2.12 },
      "rationale": "Top pair with a real kicker is a clear value bet, but a small check frequency protects the checking range."
    }
  ]
}
```

**`exampleBoards`** must be 3 to 5 boards that genuinely match `boardTags`. The
spot generator picks one at random, so a board that does not fit the tags will
produce a drill where the advice is wrong.

**`rationale`** is shown to the user and is fed to the AI coach as ground
truth. Write the sentence you would say to a student. One or two sentences,
plain English, no jargon a beginner would not know.

### Hand classes

Strongest to weakest. Use these exact strings:

```
straight_flush  quads  full_house  flush  straight  set  two_pair  overpair
top_pair_good_kicker  top_pair_weak_kicker  middle_pair  combo_draw
bottom_pair  pocket_pair_below_top  flush_draw  open_ended  ace_high
gutshot  overcards_bdfd  overcards  air
```

A few that trip people up:

- **`set`** covers both a set (pocket pair plus a board card) and trips (one
  hole card plus a paired board). There is no separate `trips`.
- **`combo_draw`** is a draw plus a pair, or two draws at once. It sits below
  middle pair on purpose — a hand with top pair *and* a flush draw is filed
  under top pair, not combo draw.
- **"good kicker"** means a ten or better.
- **`overcards_bdfd`** is two overcards plus a backdoor flush draw.

Cover every class that actually occurs in your spot. You do not need to write
an entry for `quads` on a board where quads is impossible.

### Postflop actions

```
check  bet_33  bet_66  bet_100  fold  call  raise_small  raise_pot  allin
```

`bet_33` means one third of the pot. Use the action set that matches the spot:
a hero first to act has `check` and the bet sizes; a hero facing a bet has
`fold`, `call`, and the raise sizes.

---

## Poker sanity checks the test suite runs

These are not style rules. If you break one, the data is wrong.

1. **Among made hands only, EV rises with strength.** A set must be worth more
   than top pair in the same template.

   This is deliberately restricted to made hands. Do **not** expect EV to fall
   monotonically across every class — draws routinely have higher EV than weak
   made hands, because semi-bluffing is profitable. That is the whole point of
   a draw.

2. **The strongest made hand in a template never folds** as its top action.

3. **`air` never has a value bet as its highest-EV action at a river node.**
   There is nothing left to draw to.

4. **Preflop:** AA opens 100% from every position. 72o folds 100% from UTG.
   Opening ranges widen from UTG through to the button, and each earlier
   position's range is contained in the next one's.

---

---

## THE REVIEW QUEUE — start here

The data currently in this folder is an `authored-approximation`. The list
below is the known scope of work, worst first. It is not a vague "check
everything" — each item names the specific defect.

### 1. `vs_3bet` — 15 nodes · **highest priority**

**The defect:** these 15 nodes were not authored per pairing. They are generated
from three templates keyed on (a) the 3bettor's position tier — early, late, or
blind — and (b) whether the original opener has position for the rest of the
hand. That means **two different openers facing the same tier of 3bettor get
byte-identical ranges**, which no solver would ever produce. `UTG:vs_3bet_BTN`
and `MP:vs_3bet_BTN` are the same file with a different name.

**What to do:** author each of the 15 pairings separately. Expect UTG's
continuing range against a 3bet to be much tighter and more 4bet-heavy than
CO's, because UTG's opening range is stronger and more concentrated.

**Also uncertain within these nodes:** the 4bet-bluff frequencies (the A5s/A4s
weights) are a guess even within the template.

Files: `preflop/{UTG,MP,CO,BTN,SB}.vs_3bet_*.json`

### 2. `vs_4bet` — 8 nodes

**The defect:** all eight nodes share **one** template and **do not vary by the
4bettor's position at all**. A 4bet from UTG is far tighter than a 4bet from
CO, and hero should fold materially more against it — as written, hero plays
identically against both.

**Why it is still second:** these are the lowest-frequency nodes in the app, so
the damage per unit of error is smaller. It is also the family where published
charts disagree most with each other, being the most sensitive to stack depth,
4bet sizing and rake.

**What to do:** at minimum split into three tiers by 4bettor position. Do not
present these to a user as authoritative until that is done.

Files: `preflop/{BB,SB,BTN,CO}.vs_4bet_*.json`

### 3. `vs_rfi` — 15 nodes · specifically the BB ones

**The defect:** the 3bet *value* ranges are standard and defensible. Two things
are not:

- **Bluff selection.** Which specific hands 3bet as bluffs is close to
  arbitrary at these frequencies. Solvers rotate them freely.
- **The BB defending ranges are rake-sensitive and too wide.** A rake-free
  solver defends the big blind much wider than is correct at real online rake,
  and these ranges sit near the rake-free end. If you change one thing in the
  vs-RFI family, trim the bottom of the BB calling ranges — the offsuit
  broadways and the weakest suited gappers.

Files: `preflop/*.vs_rfi_*.json`, BB first

### 4. `rfi` — 5 nodes · lowest priority

The hand sets are standard and I would defend them. Two specific caveats:

- **`SB.rfi.json` collapses a real limp/raise strategy into raise-or-fold.**
  Solvers at 100bb do limp from the small blind. This is a deliberate product
  simplification, not an oversight — treat the bottom of the range as the part
  that would actually be limped.
- The mixed weights on the small pairs and the suited wheel aces are where
  solvers disagree by 20–30 points depending on rake and open size.

### 5. `postflop/river-facing-large-bet-after-two-calls.json`

The lowest-confidence template. Its `villainRange` is a preflop range narrowed
by judgement, **not** derived from the actual betting line — it does not model
which combos would really have barrelled three streets. The SHAPE is right
(hero is capped by calling twice and must fold a lot); the specific frequencies
are not authoritative.

### What is NOT on this list

Every EV number in every file. All of them are modelled from the frequencies
rather than solved — see the indifference rule above. They are internally
consistent and correctly *ordered*, but their magnitudes are not solver output.
Reviewing them individually is not a good use of your time; fixing the ranges
and frequencies is, because the EVs are derived from those.

---

## Workflow

1. Copy the closest existing file.
2. Change the ranges and frequencies.
3. Rewrite every rationale. Do not leave a rationale describing a different spot.
4. Set `confidence` honestly, with a specific note.
5. Run `npx tsx scripts/import-solutions.ts --check`.
6. Fix whatever it names. Repeat until it prints `✓`.

If the checker reports something you believe is a false alarm, say so rather
than working around it — the rule is probably protecting something.


## Attaching questions to a template (3.6)

A postflop template may carry an optional `questions` array so a hand can ask
something other than "what do you do?". Three types exist, and **all three grade
through the same 2.7 grader on EV loss** — never add a fourth grading path, or
the accuracy number stops being comparable between sessions.

```jsonc
{
  "questions": [
    {
      "type": "hand_choice",
      "prompt": "Which hand is the better bluff here?",
      "action": "raise",
      // Exactly four. Graded on the EV gap between the chosen hand's EV for
      // `action` and the best candidate's.
      "candidates": ["A5s", "KQo", "76s", "T9s"]
    },
    {
      "type": "sizing",
      "prompt": "Which sizing is best?",
      // Action names that exist in the node. Graded identically to `action`.
      "options": ["raise", "allin"]
    }
  ]
}
```

Omitting `questions` leaves the template asking the default `action` question.

`presentationFor()` in `src/poker/questions.ts` decides the format: anything
other than an `action` question renders as a hand history, because the graphical
table can only ever ask which action to take.
