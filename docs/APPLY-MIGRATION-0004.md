# Apply migration 0004 — `quiz_attempts`

A paste-ready prompt for a browser agent, plus the exact SQL.

**This must be run TWICE — once per Supabase project.** Applied to only one, it
passes one test suite and fails the other.

| Project | Ref | Why |
| --- | --- | --- |
| Production | `mavyvyhytbdutdfpjnvm` | Real users' quiz history |
| E2E | `shsbbpmexbwdingtgqsh` | So `npm run test:rls` and the e2e suite can verify persistence |

The SQL is idempotent — `create table if not exists`, `create index if not
exists`, and `drop policy if exists` before each `create policy`. Running it
twice on the same project is safe and changes nothing the second time.

---

## The prompt

> You are applying a database migration to a Supabase project using the
> Supabase dashboard SQL editor. Do exactly this and nothing else.
>
> 1. Go to https://supabase.com/dashboard and sign in if you are not already.
>    **If a login or a password is required, stop and hand back to the human —
>    do not enter credentials yourself.**
> 2. Open the project with reference `mavyvyhytbdutdfpjnvm`.
> 3. In the left sidebar, open **SQL Editor** and start a **New query**.
> 4. Paste the SQL block below **verbatim**. Do not reformat it, do not split
>    it into separate statements, and do not "fix" anything that looks unusual
>    — the `do $$ ... $$` block and the `if not exists` guards are deliberate.
> 5. Click **Run**.
> 6. Report back the exact result message. Success looks like `Success. No rows
>    returned`. If you get an error, paste the full error text and STOP — do not
>    attempt a fix, do not modify the SQL, and do not retry with changes.
> 7. Verify it landed. Start another new query, run exactly:
>    `select table_name from information_schema.tables where table_name = 'quiz_attempts';`
>    Confirm it returns one row.
> 8. Verify the security policies. Run exactly:
>    `select policyname, cmd from pg_policies where tablename = 'quiz_attempts';`
>    Confirm it returns **exactly two** rows: `quiz_attempts_select_own` (SELECT)
>    and `quiz_attempts_insert_own` (INSERT). If you see any policy with cmd
>    `UPDATE` or `DELETE`, report it as a failure — this table is deliberately
>    insert-and-read only.
> 9. Now repeat steps 2 through 8 for the **second project**, reference
>    `shsbbpmexbwdingtgqsh`. Both projects must end up with the table and the
>    same two policies.
>
> Constraints:
> - Do not run any other SQL. Do not drop, alter or delete anything.
> - Do not change any project setting, API key, or auth configuration.
> - Do not enter passwords or 2FA codes. If sign-in is needed, hand back.
> - Report the final state of BOTH projects: table present yes/no, and the two
>   policy names for each.

---

## The SQL

```sql
-- Poker-maths quiz attempts.
--
-- A separate table from drill_attempts on purpose. Accuracy, the Glicko
-- rating, the leak report and the diagnosis all read drill_attempts and treat
-- `ev_loss` as the cost of a decision. A quiz answer has no EV loss — it is
-- exactly right or exactly wrong — so putting it in that table would need
-- either a fabricated ev_loss or a null that silently skews every average
-- computed across the rows that have one.
--
-- No grade, no ev_loss, no rating_after. Just whether somebody knew the maths.

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- See QUIZ_FAMILIES in src/poker/quiz.ts.
  family text not null,
  -- The question as asked, so a review shows the same three options.
  question_payload jsonb,
  chosen_index integer,
  correct boolean not null,
  time_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_created_idx
  on public.quiz_attempts (user_id, created_at desc);

-- The per-family breakdown on /progress groups by exactly this pair.
create index if not exists quiz_attempts_user_family_idx
  on public.quiz_attempts (user_id, family);

-- Same cascade as every other user-scoped table: rows go when the account goes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quiz_attempts_user_id_auth_users_fk'
  ) then
    alter table public.quiz_attempts
      add constraint quiz_attempts_user_id_auth_users_fk
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end
$$;

alter table public.quiz_attempts enable row level security;

-- SELECT and INSERT only, matching 0001. No UPDATE and no DELETE: a client
-- that can rewrite its own answers can manufacture a perfect record, and the
-- per-family breakdown is only worth showing if it is honest.
drop policy if exists quiz_attempts_select_own on public.quiz_attempts;
drop policy if exists quiz_attempts_insert_own on public.quiz_attempts;

create policy quiz_attempts_select_own on public.quiz_attempts
  for select to authenticated using (auth.uid() = user_id);

create policy quiz_attempts_insert_own on public.quiz_attempts
  for insert to authenticated with check (auth.uid() = user_id);
```

---

## After it lands

```bash
npm run test:rls
```

That is the only check that proves the policies were *applied* rather than
merely *written* — `tests/unit/rls-policy.test.ts` is a static audit of the SQL
and passes whether or not anybody ran it.

Then confirm the quiz persists: play a question at `/quiz` and check the
breakdown appears on `/progress`. Before the migration the section renders its
empty state, because the insert fails and is logged rather than swallowed.
