-- ease-os — security hardening (run after 0001_init.sql)

-- 1. Fixed search_path on trigger functions (Supabase linter: function_search_path_mutable).
create or replace function public.ep_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  new.user_id    := old.user_id;   -- ownership can never be changed
  new.created_at := old.created_at;
  return new;
end $$;

-- 2. Every link between records must stay inside one user's data.
--    (Foreign keys alone don't check ownership, so someone could otherwise
--     point their own event at another user's goal id.)
create or replace function public.ep_same_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ok boolean := true;
begin
  if tg_table_name = 'routine_completions' then
    ok := exists (select 1 from public.routines r where r.id = new.routine_id and r.user_id = new.user_id);
  elsif tg_table_name = 'milestones' then
    ok := exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id);
  elsif tg_table_name = 'tasks' then
    ok := new.goal_id is null or exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id);
  elsif tg_table_name = 'events' then
    ok := (new.goal_id is null or exists (select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id))
      and (new.workout_id is null or exists (select 1 from public.workouts w where w.id = new.workout_id and w.user_id = new.user_id));
  elsif tg_table_name = 'workouts' then
    ok := new.template_id is null or exists (select 1 from public.workout_templates t where t.id = new.template_id and t.user_id = new.user_id);
  end if;
  if not ok then
    raise exception 'linked record belongs to another user' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists events_owner on public.events;
drop trigger if exists workouts_owner on public.workouts;
create trigger events_owner before insert or update on public.events for each row execute function public.ep_same_owner();
create trigger workouts_owner before insert or update on public.workouts for each row execute function public.ep_same_owner();

-- 3. Trigger functions are not callable through the API.
revoke execute on function public.ep_touch() from public, anon, authenticated;
revoke execute on function public.ep_same_owner() from public, anon, authenticated;

-- 4. Sensible size limits so a runaway client can't store huge blobs.
alter table public.routines          add constraint routines_items_size   check (pg_column_size(items)   < 200000);
alter table public.workouts          add constraint workouts_entries_size check (pg_column_size(entries) < 500000);
alter table public.workout_templates add constraint templates_items_size  check (pg_column_size(items)   < 200000);
alter table public.goals             add constraint goals_notes_size      check (pg_column_size(notes)   < 500000);
alter table public.events            add constraint events_exc_size       check (pg_column_size(exceptions) < 200000);
