# SuitedPoker

A GTO poker trainer for beginners. Web app, mobile-first, hard paywall.

NLHE, 6-max cash, 100bb. Drills graded on EV loss rather than right/wrong, an AI
coach that explains but never decides, a guided curriculum, a rated arena, a daily
challenge, and a table simulator against archetype bots.

Built in stages — see `SUITEDPOKER_BUILD_PLAN.md`. This repo is the output of
Substage 0.1.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in what you have; most is optional in dev
npm run dev
```

Only `NEXT_PUBLIC_SITE_URL` is required to boot. Everything else is validated as
optional so the app runs before Stripe, Supabase, and Redis exist.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI gate) |
| `npm run test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run test:e2e` | Playwright, desktop + mobile |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run verify` | typecheck → lint → format → test |

`npm run verify` is the single command to run before declaring any substage done.

## Architecture

```
src/
├── app/
│   ├── (marketing)/   public: landing, pricing, legal, methodology
│   ├── (onboarding)/  quiz → demo hand → diagnosis → paywall
│   ├── (app)/         authed + entitled
│   └── api/
├── poker/             ⚠️ PURE TypeScript. See the rule below.
├── db/                Drizzle schema + queries
├── components/
│   ├── ui/            shadcn primitives
│   ├── poker/         Table, Card, RangeGrid, ActionBar
│   └── motion/        shared animation primitives
├── lib/
└── content/           curriculum MDX + solution JSON
```

### The one architectural rule

**`src/poker/**` is pure TypeScript.** It must never import React, a database
client, `next/*`, or anything that performs network I/O.

That constraint buys three things: the entire poker brain is unit-testable in
milliseconds, it is deterministic under a seeded RNG, and it is reusable by both
the drill engine and the bot simulator without modification.

It is enforced by a `no-restricted-imports` rule scoped to that directory, so
violating it fails the build rather than merely being frowned upon. If a future
change seems to require importing a DB client into `src/poker`, the design is
wrong — pass the data in as an argument instead.

### Correctness settings worth knowing about

`noUncheckedIndexedAccess` is on. Array access returns `T | undefined`, which is
mildly annoying in UI code and genuinely valuable in a hand evaluator where an
off-by-one silently produces a wrong answer rather than a crash. Keep it.

## Testing

- **Unit** (`node` environment) — `tests/unit/**` and `src/poker/**/*.test.ts`.
  This is where the engine is proven correct.
- **Components** (`jsdom`) — `src/components/**/*.test.tsx`.
- **E2E** (Playwright) — `tests/e2e/**`, run against both desktop Chrome and an
  iPhone 14 viewport. Mobile is the primary target: most traffic arrives on a
  phone from an ad. Never let the mobile project rot.

## CI

GitHub Actions runs typecheck, lint, format, unit tests, and build on every push;
e2e additionally on pull requests.
