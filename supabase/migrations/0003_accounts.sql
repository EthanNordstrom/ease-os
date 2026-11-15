-- ease-os — self-service account controls for public sign-ups (run after 0002_hardening.sql)

-- New accounts get a neutral title (the app always sends its own values anyway).
alter table public.settings alter column app_title set default 'Ease / OS';
alter table public.settings alter column display_name set default '';

-- Erase every row the signed-in user owns. Their login stays.
create or replace function public.erase_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
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
  delete from public.settings            where user_id = uid;
end $$;

-- Delete the signed-in user's login; every table cascades from auth.users.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.erase_my_data()     from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.erase_my_data()     to authenticated;
grant  execute on function public.delete_my_account() to authenticated;
