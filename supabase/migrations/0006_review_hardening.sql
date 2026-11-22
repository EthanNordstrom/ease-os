-- ease-os — production review (run after 0005_food_and_shopping.sql)

-- ---------- 1. Preferences that follow you to every device ----------
alter table public.settings add column if not exists theme  text  not null default 'dark' check (theme in ('dark','light','system'));
alter table public.settings add column if not exists accent text  not null default 'acid' check (accent ~ '^[a-z]{3,12}$');
alter table public.settings add column if not exists ui     jsonb not null default '{}'   check (pg_column_size(ui) < 20000);  -- calendar filters etc.

-- ---------- 2. Size and value limits on every user-editable field ----------
-- NOT VALID = enforced for all new writes without re-checking rows that already exist.
alter table public.settings
  add constraint settings_text_len check (char_length(display_name) <= 60 and char_length(app_title) <= 60
    and char_length(timezone) <= 64 and timezone ~ '^[A-Za-z0-9_+/-]+$'
    and char_length(date_locale) <= 20 and date_locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
    and default_rest_seconds between 0 and 3600) not valid;
alter table public.routines
  add constraint routines_text_len check (char_length(name) between 1 and 120 and weekdays <@ '{0,1,2,3,4,5,6}'::smallint[] and sort between -100000 and 100000) not valid;
alter table public.routine_completions
  add constraint completions_text_len check (char_length(item_id) <= 64 and char_length(item_title) <= 200) not valid;
alter table public.events
  add constraint events_text_len check (char_length(title) between 1 and 200 and char_length(notes) <= 10000
    and (recurrence is null or pg_column_size(recurrence) < 2000)) not valid;
alter table public.goals
  add constraint goals_text_len check (char_length(title) between 1 and 200 and char_length(description) <= 10000
    and char_length(why) <= 10000 and char_length(unit) <= 40 and char_length(next_action) <= 500
    and (target_value is null or target_value between 0 and 1000000000) and current_value between -1000000000 and 1000000000) not valid;
alter table public.milestones  add constraint milestones_text_len check (char_length(title) between 1 and 200) not valid;
alter table public.tasks       add constraint tasks_text_len check (char_length(title) between 1 and 300) not valid;
alter table public.exercises   add constraint exercises_text_len check (char_length(name) between 1 and 120 and char_length(notes) <= 5000) not valid;
alter table public.workout_templates add constraint templates_text_len check (char_length(name) between 1 and 120 and char_length(notes) <= 5000) not valid;
alter table public.workouts    add constraint workouts_text_len check (char_length(name) between 1 and 120 and char_length(notes) <= 10000) not valid;
alter table public.quotes      add constraint quotes_text_len check (char_length(text) between 1 and 500 and (builtin_id is null or char_length(builtin_id) <= 20)) not valid;
alter table public.reviews     add constraint reviews_text_len check (char_length(went_well) <= 10000 and char_length(got_in_way) <= 10000
    and char_length(change_next) <= 10000 and pg_column_size(priorities) < 5000) not valid;

-- ---------- 3. Load everything in one request ----------
-- SECURITY INVOKER: it runs as the signed-in user, so Row Level Security still decides what comes back.
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
    'weigh_ins',           coalesce((select jsonb_agg(t) from public.weigh_ins t), '[]')
  )
$$;
revoke execute on function public.get_my_data() from public, anon;
grant  execute on function public.get_my_data() to authenticated;
