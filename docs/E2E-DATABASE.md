# A second Supabase project for the test suite

**Do this before you spend a dollar on ads.** It takes about ten minutes and it
cannot be done retroactively.

## Why

A full e2e run creates roughly sixty auth users. Right now every one of them
lands in the same `auth.users` table as real signups.

That is not untidiness. Signup count, activation rate and D1/D7 retention are
the numbers that tell you whether a campaign is working, and they are computed
off that table. Sixty synthetic rows per run makes the first weeks of paid
traffic unreadable — and it is **not fixable later**, because nothing
distinguishes a test row from a real one after the fact. (The addresses use
`e2e+…@suitedpoker.com`, which helps, but any query written by someone who does
not know that convention is silently wrong.)

## What to create

1. supabase.com → **New project**. Name it `suitedpoker-e2e`. Free tier is fine
   — the suite never holds more than a few dozen rows.
2. Same region as production, so latency in the tests resembles reality.
3. Wait for it to provision.

## Apply the schema

Both migrations, in order, in the new project's SQL editor:

```
supabase/migrations/0000_schema.sql
supabase/migrations/0001_auth_fks_rls.sql
supabase/migrations/0002_question_types.sql
```

0001 is the important one — it adds the auth foreign keys, RLS on
every table, and the `handle_new_user` trigger. Without it the suite fails in
ways that look like product bugs.

Then, in the new project: **Authentication → Providers → Email → disable
"Confirm email"**. The suite creates users with `email_confirm: true` through
the admin API, but a few specs drive the real signup form, and Supabase's
built-in SMTP is rate-limited to a handful of messages an hour. Leaving
confirmation on there is what makes the signup e2e flaky.

## Wire it up

Project Settings → API, into `.env.local`:

```
E2E_SUPABASE_URL=https://<new-ref>.supabase.co
E2E_SUPABASE_ANON_KEY=<anon key>
E2E_SUPABASE_SERVICE_ROLE_KEY=<service_role key>
E2E_DATABASE_URL=postgresql://...   # only needed for setup:e2e-db
```

Add the same three to CI. **Do not** add them to Vercel — the app must never
read them.

## Verify

```bash
PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/auth.spec.ts
```

The run should print no warning. If you see

```
⚠  E2E IS RUNNING AGAINST THE APP'S OWN SUPABASE PROJECT.
```

then one of the three variables is missing or empty — all three are required,
and a partial set falls back silently by design (a fresh clone has to work).

Then confirm the users appeared in the **new** project's Authentication table
and **not** in production's.

## How this is enforced

- `tests/support/e2e-supabase.ts` is the only place the suite reads Supabase
  credentials. Every spec goes through `adminClient()`.
- With the `E2E_*` vars unset it still runs, but warns once per run.
- `assertNotProduction()` **refuses to run at all** when the vars are unset
  *and* `NEXT_PUBLIC_SITE_URL` points at the live domain — the combination that
  means real traffic exists.
- `tests/unit/rls.test.ts` follows the same rule. To check production's policies
  specifically, unset the `E2E_*` vars for that run deliberately.
