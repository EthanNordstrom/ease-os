# Ethan / Personal


A calm personal workspace for routines, goals, training and creative momentum.
Works on iPhone (installable to the Home Screen) and desktop, with sync through Supabase.

- **Today** — greeting, morning routine checklist, up to three priorities, next actions for active goals, today's workout, upcoming events, a daily line, quick add.
- **Routines** — editable routines with ordered steps (notes, minutes), weekdays, start time, active/inactive. Check-offs are stored per date; editing never erases history; any past day can be ticked or un-ticked.
- **Calendar** — agenda / week / month, Monday weeks, Brisbane time by default, recurring events with "this event only" vs "all in series", category filters, desktop drag-and-drop. Routines, planned workouts, goal deadlines and milestones appear automatically; completed items are marked differently from scheduled ones.
- **Goals** — Ideas → Active → Completed/Archived, promote without retyping, milestones with deadlines, tasks, next action, progress notes, explicit progress method (milestones/tasks done, or a numeric target). List and timeline views (vertical timeline on phones).
- **Gym** — exercise library (weighted / bodyweight / timed), templates, planned workouts on the calendar, start/resume/finish, warm-up vs working sets, kg × reps, RPE, notes, add/duplicate/delete sets, timestamp-based rest timer, last-time results next to each exercise, history (editable), progress charts.
- **Weekly review** — three questions, three priorities, a modest summary of counts. No scores.
- **Settings** — name, app title, timezone, week start, date format, 12/24 h, quotes & favourites, JSON export, example data, account.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

With no `.env`, the app runs as a **local demo**: data is kept in that browser only and is labelled as such everywhere. It does not sync.

## Set up sync (Supabase)

1. Create a free project at supabase.com.
2. **SQL Editor** → paste and run `supabase/migrations/0001_init.sql` (or `supabase db push` with the CLI).
3. **Authentication → URL Configuration**: set *Site URL* to where you'll host the app (e.g. `https://ethan-personal.vercel.app`) and add it to *Redirect URLs* (needed for email links/confirmation). Optionally turn off "Confirm email" if it's just you.
4. Copy `.env.example` to `.env` and fill in **Project URL** and the **anon public** key (Project Settings → API). Never use the `service_role` key — the app doesn't need it.
5. `npm run build` → deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages). Add the two `VITE_…` variables in the host's settings.
6. On your iPhone open the URL in Safari → Share → **Add to Home Screen**. Sign in with the same account on your computer.

## Data model

Every table has `id`, `user_id` (defaults to `auth.uid()`), `version`, `created_at`, `updated_at`, `is_sample`.
Row Level Security allows each signed-in user to read and write only rows where `user_id = auth.uid()`; a trigger stops ownership being changed, and child rows (milestones, goal tasks, routine check-offs) must belong to the same user as their parent.

| Table | Holds |
|---|---|
| `settings` | one row per user: name, title, timezone, week start, date format |
| `routines` | name, ordered `items` (stable ids), weekdays, start time, active |
| `routine_completions` | one row per (routine, item, **date**) — unique, with a title snapshot so history survives edits |
| `events` | title, category, date, all-day / start–end times, `recurrence` (daily / weekly on chosen days / monthly, interval, until), per-occurrence `exceptions`, optional goal/workout link |
| `goals` | title, description, why, category, stage, priority, start/target **date**, progress method + numeric target, next action, progress notes |
| `milestones` | goal, title, due **date**, done |
| `tasks` | title, done, optional goal, due date, `focus_date` (= one of that day's priorities) |
| `exercises`, `workout_templates`, `workouts` | library; templates as ordered items; workouts with planned date, status and logged `entries` → `sets` |
| `quotes` | your own lines and favourites (built-in lines live in code) |
| `reviews` | one per week start |

Design decisions worth knowing:

- **Dates** are Postgres `date` and `'YYYY-MM-DD'` strings in the app; times are `'HH:MM'` wall-clock in your timezone. "Today" is computed in the timezone from Settings, not the device's. Date-only values never go through a timezone conversion, so a deadline can't move a day.
- **Calendar entries for deadlines, milestones, routines and workouts are not copies.** The calendar reads them from their own records, so editing a date anywhere edits the one record.
- **Stale-edit protection:** every update is `… WHERE id = ? AND version = ?`; a trigger bumps `version`. If another device changed the record first, nothing is overwritten and the app asks which version to keep.
- **Saving:** edits apply instantly on screen and go into a persisted outbox. The status shows *Saving… / Saved / Offline · n waiting / Couldn't save / Needs a decision*. Failed saves stay until you retry or explicitly discard them.

## Tests

```bash
npm run test:db                       # migration + RLS, stale edits, per-date completions, date-only storage (in-process Postgres)
node tests/mock-supabase.mjs &        # stand-in Supabase API over the same migration
# build both variants and serve them, then:
python3 tests/e2e_demo.py  http://localhost:4173/   # 32 UI checks in demo mode, phone viewport, device clock in Los Angeles
python3 tests/e2e_cloud.py http://localhost:4174/   # 19 checks: two devices, conflict, offline queue, second user
python3 tests/smoke.py     http://localhost:4173/   # overflow + screenshots at 390 / 768 / 1440 px
```

## Limitations (honest list)

- Sync is tested against a local stand-in for Supabase that runs the real migration and RLS, not against a live Supabase project. Run `npm run test:db` and a quick two-device check after you set yours up.
- Other devices pick up changes when the app is opened or refocused (and on reconnect), not instantly in the background. Real-time push could be added with Supabase Realtime.
- Conflicts are resolved per record (keep mine / keep theirs), not merged field by field.
- Offline: after one online visit the app opens offline with your last-synced data, and offline edits upload later. First sign-in needs a connection. In the local demo, clearing Safari website data erases everything — export first.
- The rest timer stays accurate in the background and vibrates on Android when it ends, but there are no push notifications (iPhone doesn't vibrate from web apps).
- Recurring events support daily, weekly (chosen days, every N weeks) and monthly-by-date; no "this and following" split or nth-weekday rules. Times are interpreted in the single timezone set in Settings.
- Week view lists events per day rather than drawing an hour grid.
- Dragging on the calendar is desktop-only; on phones, reschedule from the edit form.
- No reference images came through with the brief, so the look is based on the written direction.
