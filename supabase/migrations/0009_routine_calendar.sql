-- Choose per routine whether it appears on the calendar (default: yes).
alter table public.routines add column if not exists show_on_calendar boolean not null default true;
