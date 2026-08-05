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
| 0.4 Redis, caching, rate-limit primitives | NEXT |

Everything from 0.5 onward is untouched. Update this table when you finish a
substage.

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

## Environment

Deployed on Vercel, auto-deploying from `main` on every push. Live at
suitedpoker.com. Supabase, Stripe, Upstash, Gemini, Resend and PostHog accounts
exist but are **not yet wired up** — `.env.local` is mostly empty and
`src/lib/env.ts` treats nearly everything as optional so the app boots without
them. Substages 0.4, 1.1 and 7.3 are where those get connected.
