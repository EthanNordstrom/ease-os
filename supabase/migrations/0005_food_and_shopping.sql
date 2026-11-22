-- ease-os — food tracking, shopping list and weigh-ins (run after 0004_tags_and_limits.sql)

-- Current daily targets (one row per user). Only calories is required; the rest are optional.
create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  calories int not null default 2500 check (calories between 500 and 10000),
  protein int check (protein between 0 and 1000),
  carbs int check (carbs between 0 and 2000),
  fat int check (fat between 0 and 1000),
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Saved foods, meals and recipes. Nutrition is per serving.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'food' check (kind in ('food','meal','recipe')),
  serving text not null default '1 serve' check (char_length(serving) <= 40),
  calories numeric not null default 0 check (calories between 0 and 20000),
  protein numeric not null default 0 check (protein between 0 and 2000),
  carbs numeric not null default 0 check (carbs between 0 and 2000),
  fat numeric not null default 0 check (fat between 0 and 2000),
  servings_per_batch int not null default 1 check (servings_per_batch between 1 and 100),
  ingredients jsonb not null default '[]' check (pg_column_size(ingredients) < 50000),  -- [{id,name,amount}] per batch
  method text not null default '' check (char_length(method) <= 10000),
  favourite boolean not null default false,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- What was eaten on a date. Values are snapshots, so editing a saved food never rewrites history.
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  slot text not null default 'snacks' check (slot in ('breakfast','lunch','dinner','snacks')),
  food_id uuid references public.foods(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  servings numeric not null default 1 check (servings > 0 and servings <= 50),
  calories numeric not null default 0 check (calories between 0 and 50000),
  protein numeric not null default 0 check (protein between 0 and 5000),
  carbs numeric not null default 0 check (carbs between 0 and 5000),
  fat numeric not null default 0 check (fat between 0 and 5000),
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "My usual day": a named set of foods to log in one tap.
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  items jsonb not null default '[]' check (pg_column_size(items) < 50000),  -- [{id,food_id,slot,servings}]
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount text not null default '' check (char_length(amount) <= 60),
  aisle text not null default 'other' check (aisle in ('produce','meat','dairy','bakery','pantry','frozen','drinks','household','other')),
  done boolean not null default false,
  source text not null default '' check (char_length(source) <= 120),
  sort int not null default 0,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kg numeric not null check (kg between 20 and 400),
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- RLS, version trigger, rate limit, quotas, indexes
do $$
declare r record;
begin
  for r in select * from (values
    ('nutrition_goals', 1), ('foods', 3000), ('food_logs', 100000), ('meal_plans', 100), ('shopping_items', 2000), ('weigh_ins', 20000)) as t(name, cap)
  loop
    execute format('alter table public.%I enable row level security', r.name);
    execute format('alter table public.%I force row level security', r.name);
    execute format('create policy "own rows: select" on public.%I for select to authenticated using (user_id = auth.uid())', r.name);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', r.name);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', r.name);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = auth.uid())', r.name);
    execute format('create trigger %I before update on public.%I for each row execute function public.ep_touch()', r.name || '_touch', r.name);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.ep_rate_limit()', r.name || '_rate', r.name);
    execute format('create trigger %I before insert on public.%I for each row execute function public.ep_quota(%s)', r.name || '_quota', r.name, r.cap);
    execute format('create index %I on public.%I (user_id)', r.name || '_user_idx', r.name);
    execute format('revoke all on public.%I from anon', r.name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.name);
  end loop;
end $$;
create index food_logs_date_idx on public.food_logs (user_id, date);

-- A log entry can only point at the same user's saved food.
create or replace function public.ep_food_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.food_id is not null and not exists (select 1 from public.foods f where f.id = new.food_id and f.user_id = new.user_id) then
    raise exception 'linked record belongs to another user' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.ep_food_owner() from public, anon, authenticated;
create trigger food_logs_owner before insert or update on public.food_logs for each row execute function public.ep_food_owner();

-- erase_my_data now includes the new tables
create or replace function public.erase_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform set_config('ep.bulk', 'on', true);
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
  delete from public.food_logs           where user_id = uid;
  delete from public.meal_plans          where user_id = uid;
  delete from public.foods               where user_id = uid;
  delete from public.nutrition_goals     where user_id = uid;
  delete from public.shopping_items      where user_id = uid;
  delete from public.weigh_ins           where user_id = uid;
  delete from public.settings            where user_id = uid;
  delete from private.write_counters     where user_id = uid;
end $$;
