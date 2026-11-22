-- ease-os — money: bills, savings goals and a payday plan (run after 0006_review_hardening.sql)

create table public.money_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade unique,
  currency text not null default 'AUD' check (currency ~ '^[A-Z]{3}$'),
  pay_frequency text not null default 'fortnightly' check (pay_frequency in ('weekly','fortnightly','monthly','none')),
  next_payday date,
  take_home numeric check (take_home is null or take_home between 0 and 10000000),
  auto_log boolean not null default false,     -- record planned savings transfers automatically on each payday
  last_auto_payday date,
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  amount numeric not null check (amount between 0 and 10000000),
  frequency text not null default 'monthly' check (frequency in ('weekly','fortnightly','monthly','quarterly','yearly','once')),
  due_date date not null,                     -- first (or next) due date; repeats from here
  category text not null default 'other' check (category in ('housing','utilities','phone','insurance','subscriptions','transport','health','debt','other')),
  autopay boolean not null default false,
  active boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 2000),
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  due_date date not null,                     -- which occurrence was paid
  amount numeric not null default 0 check (amount between 0 and 10000000),
  paid_at timestamptz not null default now(),
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_id, due_date)
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target numeric not null check (target between 1 and 100000000),
  start_amount numeric not null default 0 check (start_amount between 0 and 100000000),
  target_date date,
  kind text not null default 'saving' check (kind in ('saving','purchase')),   -- purchase = saving up to buy something
  link text not null default '' check (char_length(link) <= 500 and (link = '' or link ~* '^https?://')),
  per_pay numeric check (per_pay is null or per_pay between 0 and 10000000),   -- chosen amount per pay when there's no date
  purchased_at timestamptz,
  archived boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.savings_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  date date not null,
  amount numeric not null check (amount between -100000000 and 100000000 and amount <> 0),  -- negative = withdrawal
  note text not null default '' check (char_length(note) <= 200),
  payday date,                                 -- set for automatic payday transfers
  is_sample boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- An automatic transfer is recorded at most once per goal per payday, even with several devices open.
create unique index savings_transfers_payday_once on public.savings_transfers (goal_id, payday) where payday is not null;

do $$
declare r record;
begin
  for r in select * from (values
    ('money_settings', 1), ('bills', 500), ('bill_payments', 50000), ('savings_goals', 200), ('savings_transfers', 50000)) as t(name, cap)
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

-- Payments and transfers can only point at the same user's bill / goal.
create or replace function public.ep_money_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
  if tg_table_name = 'bill_payments' then
    ok := exists (select 1 from public.bills b where b.id = new.bill_id and b.user_id = new.user_id);
  else
    ok := exists (select 1 from public.savings_goals g where g.id = new.goal_id and g.user_id = new.user_id);
  end if;
  if not ok then raise exception 'linked record belongs to another user' using errcode = '42501'; end if;
  return new;
end $$;
revoke execute on function public.ep_money_owner() from public, anon, authenticated;
create trigger bill_payments_owner before insert or update on public.bill_payments for each row execute function public.ep_money_owner();
create trigger savings_transfers_owner before insert or update on public.savings_transfers for each row execute function public.ep_money_owner();

-- Events may use the new Money category.
alter table public.events drop constraint if exists events_category_check;
alter table public.events add constraint events_category_check check (category in ('personal','routine','gym','music','goals','money'));

-- One-request load and erase include the new tables.
create or replace function public.get_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'settings',            coalesce((select jsonb_agg(t) from public.settings t), '[]'),
    'routines',            coalesce((select jsonb_agg(t) from public.routines t), '[]'),
    'routine_completions', coalesce((select jsonb_agg(t) from public.routine_completions t), '[]'),
    'events',              coalesce((select jsonb_agg(t) from public.events t), '[]'),
    'goals',               coalesce((select jsonb_agg(t) from public.goals t), '[]'),
    'milestones',          coalesce((select jsonb_agg(t) from public.milestones t), '[]'),
    'tasks',               coalesce((select jsonb_agg(t) from public.tasks t), '[]'),
    'exercises',           coalesce((select jsonb_agg(t) from public.exercises t), '[]'),
    'workout_templates',   coalesce((select jsonb_agg(t) from public.workout_templates t), '[]'),
    'workouts',            coalesce((select jsonb_agg(t) from public.workouts t), '[]'),
    'quotes',              coalesce((select jsonb_agg(t) from public.quotes t), '[]'),
    'reviews',             coalesce((select jsonb_agg(t) from public.reviews t), '[]'),
    'tags',                coalesce((select jsonb_agg(t) from public.tags t), '[]'),
    'nutrition_goals',     coalesce((select jsonb_agg(t) from public.nutrition_goals t), '[]'),
    'foods',               coalesce((select jsonb_agg(t) from public.foods t), '[]'),
    'food_logs',           coalesce((select jsonb_agg(t) from public.food_logs t), '[]'),
    'meal_plans',          coalesce((select jsonb_agg(t) from public.meal_plans t), '[]'),
    'shopping_items',      coalesce((select jsonb_agg(t) from public.shopping_items t), '[]'),
    'weigh_ins',           coalesce((select jsonb_agg(t) from public.weigh_ins t), '[]'),
    'money_settings',      coalesce((select jsonb_agg(t) from public.money_settings t), '[]'),
    'bills',               coalesce((select jsonb_agg(t) from public.bills t), '[]'),
    'bill_payments',       coalesce((select jsonb_agg(t) from public.bill_payments t), '[]'),
    'savings_goals',       coalesce((select jsonb_agg(t) from public.savings_goals t), '[]'),
    'savings_transfers',   coalesce((select jsonb_agg(t) from public.savings_transfers t), '[]')
  )
$$;

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
  delete from public.bill_payments       where user_id = uid;
  delete from public.bills               where user_id = uid;
  delete from public.savings_transfers   where user_id = uid;
  delete from public.savings_goals       where user_id = uid;
  delete from public.money_settings      where user_id = uid;
  delete from public.settings            where user_id = uid;
  delete from private.write_counters     where user_id = uid;
end $$;
