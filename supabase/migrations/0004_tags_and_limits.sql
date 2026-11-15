-- ease-os — custom tags + abuse protection (run after 0003_accounts.sql)

-- ---------- Tags (custom calendar categories with a colour) ----------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default 'slate' check (color ~ '^[a-z]{3,12}$'),
  sort int not null default 0,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tags enable row level security;
alter table public.tags force row level security;
create policy "own rows: select" on public.tags for select to authenticated using (user_id = auth.uid());
create policy "own rows: insert" on public.tags for insert to authenticated with check (user_id = auth.uid());
create policy "own rows: update" on public.tags for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows: delete" on public.tags for delete to authenticated using (user_id = auth.uid());
create trigger tags_touch before update on public.tags for each row execute function public.ep_touch();
create index tags_user_idx on public.tags (user_id);
revoke all on public.tags from anon;
grant select, insert, update, delete on public.tags to authenticated;

alter table public.events add column tag_id uuid references public.tags(id) on delete set null;

-- Links must stay inside one user's data (now including event → tag).
create or replace function public.ep_same_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean := true;
begin
  if tg_table_name = 'routine_completions' then
    ok := exists (select 1 from public.routines r where r.id = new.routine_id and r.user_id = new.user_id);
  elsif tg_table_name = 'milestones' then
    ok := exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id);
  elsif tg_table_name = 'tasks' then
    ok := new.goal_id is null or exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id);
  elsif tg_table_name = 'events' then
    ok := (new.goal_id is null or exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id))
      and (new.workout_id is null or exists (select 1 from public.workouts w where w.id = new.workout_id and w.user_id = new.user_id))
      and (new.tag_id is null or exists (select 1 from public.tags t where t.id = new.tag_id and t.user_id = new.user_id));
  elsif tg_table_name = 'workouts' then
    ok := new.template_id is null or exists (select 1 from public.workout_templates t where t.id = new.template_id and t.user_id = new.user_id);
  end if;
  if not ok then raise exception 'linked record belongs to another user' using errcode = '42501'; end if;
  return new;
end $$;

-- ---------- Abuse protection ----------
-- Kept in a schema the API does not expose, so nobody can read or reset the counters.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.write_counters (
  user_id uuid primary key,
  window_start timestamptz not null,
  writes int not null
);

-- 1) Write rate limit: at most 240 changes per user per minute (normal use is a handful;
--    the app also batches rapid edits). Excess requests get a clear error and the app retries.
create or replace function public.ep_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int; w timestamptz := date_trunc('minute', now());
begin
  -- internal/admin operations, and the app's own erase/delete functions, aren't counted
  if uid is null or current_setting('ep.bulk', true) = 'on' then return coalesce(new, old); end if;
  insert into private.write_counters as c (user_id, window_start, writes) values (uid, w, 1)
  on conflict (user_id) do update
    set writes = case when c.window_start = w then c.writes + 1 else 1 end, window_start = w
  returning writes into n;
  if n > 240 then
    raise exception 'rate limit: too many changes, slow down' using errcode = 'EP429';
  end if;
  return coalesce(new, old);
end $$;

-- 2) Storage quota: a cap on rows per user per table, so one account can't fill the database.
create or replace function public.ep_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap int := tg_argv[0]::int; n int;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into n using new.user_id;
  if n >= cap then
    raise exception 'quota: limit of % % reached', cap, replace(tg_table_name, '_', ' ') using errcode = 'EP413';
  end if;
  return new;
end $$;

revoke execute on function public.ep_rate_limit() from public, anon, authenticated;
revoke execute on function public.ep_quota()      from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select * from (values
    ('settings', 1), ('routines', 100), ('routine_completions', 200000), ('events', 10000), ('goals', 2000),
    ('milestones', 10000), ('tasks', 50000), ('exercises', 2000), ('workout_templates', 500), ('workouts', 20000),
    ('quotes', 2000), ('reviews', 3000), ('tags', 200)) as t(name, cap)
  loop
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.ep_rate_limit()', r.name || '_rate', r.name);
    execute format('create trigger %I before insert on public.%I for each row execute function public.ep_quota(%s)', r.name || '_quota', r.name, r.cap);
  end loop;
end $$;

-- erase_my_data must include tags too
create or replace function public.erase_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform set_config('ep.bulk', 'on', true);   -- this transaction only
  delete from public.events              where user_id = uid;
  delete from public.routine_completions where user_id = uid;
  delete from public.milestones          where user_id = uid;
  delete from public.tasks               where user_id = uid;
  delete from public.workouts            where user_id = uid;
  delete from public.workout_templates   where user_id = uid;
  delete from public.exercises           where user_id = uid;
  delete from public.goals               where user_id = uid;
  delete from public.routines            where user_id = uid;
  delete from public.quotes              where user_id = uid;
  delete from public.reviews             where user_id = uid;
  delete from public.tags                where user_id = uid;
  delete from public.settings            where user_id = uid;
  delete from private.write_counters     where user_id = uid;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform set_config('ep.bulk', 'on', true);   -- cascaded deletes aren't rate-limited
  delete from private.write_counters where user_id = uid;
  delete from auth.users where id = uid;
end $$;
