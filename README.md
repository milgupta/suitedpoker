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
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push the schema straight to the DB (dev only) |
| `npm run db:seed` | Seed modules, lessons and a dev user |
| `npm run db:studio` | Drizzle Studio |
| `npm run test:rls` | The cross-user security test — needs a live Supabase |

`npm run verify` is the single command to run before declaring any substage done.

## Database setup

The app builds, tests and runs without a database — but nothing that touches
`src/db` works until this is done, and **the row-level security boundary is
unverified until `npm run test:rls` has actually run.**

1. Create a project at [supabase.com](https://supabase.com). Any region; pick
   one close to your users.

2. From **Project settings → Data API** and **→ API keys**, copy into
   `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key>"
   SUPABASE_SERVICE_ROLE_KEY="<service role key>"
   ```

   The service role key bypasses RLS entirely. It is server-only and must never
   reach the client bundle — 1.2 adds a test that greps the bundle for it.

3. From **Project settings → Database → Connection string**, take the
   **Session pooler** URI and add it as `DATABASE_URL`. Use the pooler rather
   than the direct connection: serverless functions open far more connections
   than Postgres will accept directly.

   ```
   DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
   ```

4. Apply the schema and the security policies:

   ```bash
   npm run db:migrate
   ```

   `0000_schema.sql` creates the tables. `0001_auth_fks_rls.sql` adds the
   foreign keys to `auth.users`, the new-user trigger, and every RLS policy.
   Both are safe to re-run.

5. Seed development data:

   ```bash
   npm run db:seed
   ```

   Creates a solution set, 3 modules with 4 lessons each, and a dev user
   (`dev@suitedpoker.com` / `devpassword123`) with onboarding already complete.

6. **Verify the security boundary.** This is not optional:

   ```bash
   npm run test:rls
   ```

   It creates two users, gives each of them rows, and asserts that user A reads
   zero of user B's profile, drill attempts and subscriptions. It skips loudly
   when credentials are absent — a skipped security test proves nothing.

   It is deliberately NOT part of `npm run verify`, because CI has no
   credentials. Re-run it by hand whenever an RLS policy changes.

7. Auth end to end:

   ```bash
   npm run test:e2e
   ```

   Creates throwaway users (`e2e+<timestamp>@suitedpoker.com`) and deletes them
   afterwards. Skips when credentials are absent.

### Auth notes

- **Google OAuth** needs a Google Cloud OAuth client and the provider enabled
  under **Authentication → Sign In / Providers → Google**. Until then the button
  is wired but returns "That sign-in method isn't switched on yet."
- **Email rate limits.** Supabase's built-in SMTP sends only a few messages an
  hour on the free tier, and every signup sends a confirmation. The signup e2e
  skips with an explanation when that budget is exhausted.
- **Test users go into the production auth table.** Before running ads, create a
  second free Supabase project for tests so signup metrics stay clean.

## API routes

**Every authenticated API route uses `withAuth` or `withEntitlement` from
`src/lib/api-guard.ts`. No route rolls its own auth check.** One place to get
right, one place to audit, and one place where the 401/402 distinction is made:

- **401** — not logged in. The client shows the login screen.
- **402** — logged in, not subscribed. The client shows the paywall. Not 403,
  which means "you may never do this" and is a different screen.

Middleware gates the `(app)` route group for UX, but it is **not** a security
boundary — an API route is reachable directly, so it re-checks server-side.

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
