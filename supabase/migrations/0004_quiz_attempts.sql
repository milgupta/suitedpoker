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
