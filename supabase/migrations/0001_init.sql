-- Ethan / Personal — initial schema
-- Every table: owned by auth.uid(), protected by Row Level Security,
-- with a server-maintained `version` used for optimistic concurrency
-- (the client only updates WHERE version = <the version it last saw>).

-- gen_random_uuid() is built into Postgres 13+ (Supabase runs 15+).

-- ---------- shared trigger: bump version + updated_at on every update ----------
create or replace function public.ep_touch() returns trigger
language plpgsql as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  new.user_id    := old.user_id;   -- ownership can never be changed
  new.created_at := old.created_at;
  return new;
end $$;

-- ---------- tables ----------
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  display_name text not null default '',
  app_title text not null default 'Ethan / Personal',
  timezone text not null default 'Australia/Brisbane',
  week_start smallint not null default 1 check (week_start between 0 and 6),
  date_locale text not null default 'en-AU',
  hour12 boolean not null default false,
  default_rest_seconds int not null default 120,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]',          -- [{id,title,notes,minutes}] — item ids are stable across edits
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',  -- 0 = Sunday
  start_time text check (start_time ~ '^\d{2}:\d{2}$'),
  active boolean not null default true,
  sort int not null default 0,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  item_id text not null,
  date date not null,                          -- calendar date in the user's timezone
  item_title text not null default '',         -- snapshot, so history survives renames
  completed_at timestamptz not null default now(),
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, item_id, date)           -- one check-off per item per date
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  why text not null default '',
  category text not null default 'personal' check (category in ('health','appearance','music','career','money','personal')),
  stage text not null default 'active' check (stage in ('idea','active','paused','completed','archived')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  start_date date,
  target_date date,                            -- date-only: cannot shift through timezone conversion
  progress_method text not null default 'checklist' check (progress_method in ('checklist','numeric')),
  target_value numeric,
  current_value numeric not null default 0,
  unit text not null default '',
  next_action text not null default '',
  notes jsonb not null default '[]',           -- [{id,date,text}]
  completed_at timestamptz,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  sort int not null default 0,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  goal_id uuid references public.goals(id) on delete cascade,
  due_date date,
  focus_date date,                             -- set = one of that day's priorities
  sort int not null default 0,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'weighted' check (kind in ('weighted','bodyweight','timed')),
  notes text not null default '',
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  notes text not null default '',
  items jsonb not null default '[]',           -- [{id,exercise_id,sets,reps,weight,seconds,rest_seconds}]
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  template_id uuid references public.workout_templates(id) on delete set null,
  planned_date date,
  planned_time text check (planned_time ~ '^\d{2}:\d{2}$'),
  status text not null default 'planned' check (status in ('planned','in_progress','completed')),
  started_at timestamptz,
  finished_at timestamptz,
  notes text not null default '',
  entries jsonb not null default '[]',         -- [{id,exercise_id,notes,rest_seconds,sets:[{id,type,reps,weight,seconds,rpe,done,done_at}]}]
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'personal' check (category in ('personal','routine','gym','music','goals')),
  date date not null,                          -- start date (series start for recurring events)
  all_day boolean not null default false,
  start_time text check (start_time ~ '^\d{2}:\d{2}$'),   -- wall-clock time in the user's timezone
  end_time text check (end_time ~ '^\d{2}:\d{2}$'),
  notes text not null default '',
  recurrence jsonb,                            -- {freq,interval,weekdays,until} or null
  exceptions jsonb not null default '{}',      -- {"YYYY-MM-DD": {cancelled|date|title|start_time|...}} per-occurrence edits
  goal_id uuid references public.goals(id) on delete set null,
  workout_id uuid references public.workouts(id) on delete set null,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  builtin_id text,                             -- set when favouriting a built-in line
  favourite boolean not null default false,
  own boolean not null default false,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  went_well text not null default '',
  got_in_way text not null default '',
  change_next text not null default '',
  priorities jsonb not null default '[]',
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------- RLS, triggers, indexes for every table ----------
do $$
declare t text;
begin
  foreach t in array array['settings','routines','routine_completions','goals','milestones','tasks','exercises',
                           'workout_templates','workouts','events','quotes','reviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy "own rows: select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ep_touch()', t || '_touch', t);
    execute format('create index %I on public.%I (user_id)', t || '_user_idx', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- A child row must belong to the same user as its parent.
create or replace function public.ep_same_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_owner uuid;
begin
  if tg_table_name = 'routine_completions' then
    select user_id into parent_owner from public.routines where id = new.routine_id;
  elsif tg_table_name = 'milestones' or (tg_table_name = 'tasks' and new.goal_id is not null) then
    select user_id into parent_owner from public.goals where id = new.goal_id;
  else
    return new;
  end if;
  if parent_owner is distinct from new.user_id then
    raise exception 'parent record belongs to another user' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger routine_completions_owner before insert or update on public.routine_completions for each row execute function public.ep_same_owner();
create trigger milestones_owner before insert or update on public.milestones for each row execute function public.ep_same_owner();
create trigger tasks_owner before insert or update on public.tasks for each row execute function public.ep_same_owner();

create index routine_completions_date_idx on public.routine_completions (user_id, date);
create index events_date_idx on public.events (user_id, date);
create index workouts_date_idx on public.workouts (user_id, planned_date);
create index milestones_goal_idx on public.milestones (goal_id);
create index tasks_goal_idx on public.tasks (goal_id);
