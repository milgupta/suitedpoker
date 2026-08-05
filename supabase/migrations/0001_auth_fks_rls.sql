-- ═══════════════════════════════════════════════════════════════════════════
-- Foreign keys to auth.users, the new-user trigger, and ALL Row Level Security.
--
-- Drizzle does not model policies and must never emit DDL for the `auth`
-- schema, so both live here. This file is the security boundary of the product;
-- read the reasoning block before changing anything in it.
--
-- Every statement is idempotent — dropping before creating, or guarded — so
-- re-running this migration is a no-op rather than an error.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- WHAT THIS SECURITY MODEL DOES AND DOES NOT PROTECT
--
-- It is deliberately NOT true that solution data is secret. The /ranges browser
-- (3.5) exposes preflop strategy and EV to entitled users on purpose. That is a
-- feature: it is a reference tool, and a user who wants to look up the answer to
-- their own practice hand is allowed to. Poker training is not an exam, and
-- hiding the reference material would make the product worse without making it
-- more honest.
--
-- What must never happen is narrower and much more important:
--
--   1. The answer must never arrive INSIDE the drill payload. The drill API
--      returns a ClientSpot carrying no strategy, no EV and no node reference
--      (2.6) — the client cannot even identify which node it is looking at
--      without solving the spot itself.
--   2. Grading must always run server-side, against the stored seed.
--
-- So: SELECT on the solution tables is granted to authenticated users, and the
-- protection that matters lives in the API shape and in server-side grading —
-- not in hiding these rows. Do not "fix" this by revoking SELECT; you would
-- break /ranges and gain nothing, because the drill payload never contained the
-- answer in the first place.
--
-- Entitlement is enforced in the application layer (1.3), not in a policy. RLS
-- cannot cheaply read a subscription's period end per row, and duplicating that
-- logic in SQL would give two sources of truth for who has paid.
-- ───────────────────────────────────────────────────────────────────────────


-- ── Foreign keys to auth.users ─────────────────────────────────────────────
-- ON DELETE CASCADE throughout, so deleting an account really deletes the data.

do $$
declare
  t text;
begin
  -- profiles keys on id rather than user_id; the rest all use user_id.
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_id_auth_users_fk'
  ) then
    alter table public.profiles
      add constraint profiles_id_auth_users_fk
      foreign key (id) references auth.users (id) on delete cascade;
  end if;

  foreach t in array array[
    'subscriptions', 'cancellations', 'drill_attempts', 'daily_results',
    'lesson_progress', 'sim_sessions', 'coach_messages', 'ai_usage', 'leaks'
  ]
  loop
    if not exists (
      select 1 from pg_constraint where conname = t || '_user_id_auth_users_fk'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id)
           references auth.users (id) on delete cascade',
        t, t || '_user_id_auth_users_fk'
      );
    end if;
  end loop;
end
$$;


-- ── A profile row for every new auth user ──────────────────────────────────
-- SECURITY DEFINER because the trigger runs as the auth system, which has no
-- rights on public.profiles. search_path is pinned: without it, a table planted
-- earlier on the path could be written instead.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── Enable RLS everywhere ──────────────────────────────────────────────────
-- Including tables with no policy at all. A table with RLS enabled and no
-- policy denies everything to the anon and authenticated roles, which is the
-- correct default for service-role-only data.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'subscriptions', 'stripe_events', 'cancellations',
    'solution_sets', 'preflop_nodes', 'postflop_templates', 'postflop_strategies',
    'drill_attempts', 'daily_challenges', 'daily_results', 'daily_spot_results',
    'modules', 'lessons', 'lesson_progress',
    'sim_sessions', 'sim_hands',
    'coach_messages', 'ai_usage', 'coach_cache', 'leaks'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;


-- ── User-scoped tables: auth.uid() = user_id ───────────────────────────────
-- SELECT, INSERT and UPDATE only. No DELETE policy anywhere: rows go when the
-- account goes, via the cascades above. A client that can delete its own
-- drill_attempts can erase evidence of a leak it does not like, and the whole
-- diagnosis is built on that history.

do $$
declare
  t text;
begin
  foreach t in array array[
    'subscriptions', 'cancellations', 'drill_attempts', 'daily_results',
    'lesson_progress', 'sim_sessions', 'coach_messages', 'ai_usage', 'leaks'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t
    );
  end loop;
end
$$;


-- ── profiles: same rule, but the owning column is `id` ─────────────────────

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);


-- ── Child tables reached through their parent ──────────────────────────────
-- daily_spot_results and sim_hands have no user_id of their own; ownership is
-- inherited from the parent row and must be checked through it, or a user could
-- read another user's hand histories by guessing a session id.

drop policy if exists daily_spot_results_select_own on public.daily_spot_results;
create policy daily_spot_results_select_own on public.daily_spot_results
  for select to authenticated using (
    exists (
      select 1 from public.daily_results r
      where r.id = daily_spot_results.result_id and r.user_id = auth.uid()
    )
  );

drop policy if exists daily_spot_results_insert_own on public.daily_spot_results;
create policy daily_spot_results_insert_own on public.daily_spot_results
  for insert to authenticated with check (
    exists (
      select 1 from public.daily_results r
      where r.id = daily_spot_results.result_id and r.user_id = auth.uid()
    )
  );

drop policy if exists sim_hands_select_own on public.sim_hands;
create policy sim_hands_select_own on public.sim_hands
  for select to authenticated using (
    exists (
      select 1 from public.sim_sessions s
      where s.id = sim_hands.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists sim_hands_insert_own on public.sim_hands;
create policy sim_hands_insert_own on public.sim_hands
  for insert to authenticated with check (
    exists (
      select 1 from public.sim_sessions s
      where s.id = sim_hands.session_id and s.user_id = auth.uid()
    )
  );


-- ── Read-only reference data ───────────────────────────────────────────────
-- SELECT for any authenticated user. NO insert/update/delete policy at all, so
-- writes are service-role only. See the reasoning block at the top before
-- narrowing these.

do $$
declare
  t text;
begin
  foreach t in array array[
    'solution_sets', 'preflop_nodes', 'postflop_templates', 'postflop_strategies',
    'modules', 'lessons', 'daily_challenges'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_authenticated', t
    );
  end loop;
end
$$;


-- ── Service-role only, no policies ─────────────────────────────────────────
-- stripe_events and coach_cache have RLS on and no policy, which denies both
-- anon and authenticated outright. That is intentional: a webhook ledger and a
-- shared AI cache are never read by a browser.
