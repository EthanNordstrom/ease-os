-- Workout templates can repeat on chosen weekdays (0 = Sunday … 6 = Saturday),
-- with an optional planned time. Occurrences are generated in the app, not stored.
alter table public.workout_templates
  add column if not exists weekdays smallint[] not null default '{}',
  add column if not exists plan_time text,
  add column if not exists archived boolean not null default false;

alter table public.workout_templates drop constraint if exists templates_weekdays_valid;
alter table public.workout_templates add constraint templates_weekdays_valid
  check (cardinality(weekdays) <= 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);

alter table public.workout_templates drop constraint if exists templates_plan_time_valid;
alter table public.workout_templates add constraint templates_plan_time_valid
  check (plan_time is null or plan_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
