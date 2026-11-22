// Runs the real migration in an in-process Postgres (PGlite) with a stubbed
// Supabase `auth` schema, then checks access control, stale-edit protection,
// per-date routine completion and date-only storage.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const throws = async (fn, msg) => { try { await fn(); ok(false, msg); } catch { ok(true, msg); } };

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
for (const f of ['0001_init.sql', '0002_hardening.sql', '0003_accounts.sql', '0004_tags_and_limits.sql', '0005_food_and_shopping.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8'));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  return db.query(sql, params);
};

// User A creates data
const g = (await as(A, `insert into goals (title, target_date) values ('Finish demo', '2026-12-01') returning *`)).rows[0];
ok(g.user_id === A && g.version === 1, 'insert defaults user_id to the signed-in user, version 1');
const r = (await as(A, `insert into routines (name, items) values ('Morning', '[{"id":"i1","title":"Brush teeth"}]') returning *`)).rows[0];
await as(A, `insert into routine_completions (routine_id, item_id, date, item_title) values ($1, 'i1', '2026-11-15', 'Brush teeth')`, [r.id]);
await throws(() => as(A, `insert into routine_completions (routine_id, item_id, date) values ($1, 'i1', '2026-11-15')`, [r.id]), 'same item cannot be completed twice on one date');
await as(A, `insert into routine_completions (routine_id, item_id, date) values ($1, 'i1', '2026-11-16')`, [r.id]);
const c = await as(A, `select date::text from routine_completions where routine_id = $1 order by date`, [r.id]);
ok(c.rows.length === 2 && c.rows[0].date === '2026-11-15' && c.rows[1].date === '2026-11-16', 'completions are stored per date (today ≠ tomorrow)');

// Editing the routine does not touch history
await as(A, `update routines set items = '[{"id":"i1","title":"Brush teeth (2 min)"}]', name = 'Morning routine' where id = $1`, [r.id]);
ok((await as(A, `select count(*)::int n from routine_completions`)).rows[0].n === 2, 'editing a routine keeps its completion history');

// Optimistic concurrency
const u1 = await as(A, `update goals set title = 'Phone edit' where id = $1 and version = 1 returning version`, [g.id]);
ok(u1.rows.length === 1 && u1.rows[0].version === 2, 'update with current version succeeds and bumps version');
const u2 = await as(A, `update goals set title = 'Stale laptop edit' where id = $1 and version = 1 returning version`, [g.id]);
ok(u2.rows.length === 0, 'stale edit (old version) updates nothing → client shows a conflict');
ok((await as(A, `select title from goals where id = $1`, [g.id])).rows[0].title === 'Phone edit', 'newer data is not overwritten');

// Date-only fields don't shift with timezones
await db.exec(`reset role; set timezone = 'America/Los_Angeles'`);
ok((await as(A, `select target_date::text d from goals where id = $1`, [g.id])).rows[0].d === '2026-12-01', 'date-only deadline unchanged under a different session timezone');
await db.exec(`reset role; set timezone = 'Australia/Brisbane'`);

// User B can't see or touch A's records
ok((await as(B, `select * from goals`)).rows.length === 0, 'user B cannot read user A’s goals');
ok((await as(B, `select * from routine_completions`)).rows.length === 0, 'user B cannot read user A’s routine history');
ok((await as(B, `update goals set title = 'hacked' where id = $1 returning id`, [g.id])).rows.length === 0, 'user B cannot update user A’s goal');
ok((await as(B, `delete from goals where id = $1 returning id`, [g.id])).rows.length === 0, 'user B cannot delete user A’s goal');
await throws(() => as(B, `insert into goals (user_id, title) values ($1, 'planted')`, [A]), 'user B cannot insert rows owned by user A');
await throws(() => as(B, `insert into milestones (goal_id, title) values ($1, 'sneaky')`, [g.id]), 'user B cannot attach a milestone to user A’s goal');
await throws(() => as(B, `insert into events (title, date, goal_id) values ('x', '2026-11-20', $1)`, [g.id]), 'user B cannot link their event to user A’s goal');
const aw = (await as(A, `insert into workout_templates (name) values ('A tpl') returning id`)).rows[0];
await throws(() => as(B, `insert into workouts (name, template_id) values ('x', $1)`, [aw.id]), 'user B cannot link their workout to user A’s template');
await throws(() => as(B, `select public.ep_same_owner()`), 'trigger functions cannot be called directly');
await as(B, `insert into goals (title) values ('B goal')`);
await throws(async () => { const res = await as(B, `update goals set user_id = $1 where title = 'B goal' returning user_id`, [A]); if (res.rows[0]?.user_id === A) return; throw new Error('blocked'); }, 'ownership cannot be transferred by update');
ok((await as(B, `select * from goals`)).rows.length === 1, 'user B sees only their own goal');

// Anonymous access
await throws(() => as(null, `select * from goals`), 'signed-out (anon) requests are refused');

// Cascades
await as(A, `insert into milestones (goal_id, title, due_date) values ($1, 'Mixdown', '2026-11-30')`, [g.id]);
await as(A, `delete from goals where id = $1`, [g.id]);
ok((await as(A, `select count(*)::int n from milestones`)).rows[0].n === 0, 'deleting a goal removes its milestones');

// Tags
const tagA = (await as(A, `insert into tags (name, color) values ('Studio', 'violet') returning id`)).rows[0].id;
ok(!!tagA, 'user A can create a tag');
await throws(() => as(A, `insert into tags (name, color) values ('Bad', 'NOT A COLOUR')`), 'tag colour must be a palette key');
await throws(() => as(B, `insert into events (title, date, tag_id) values ('x', '2026-11-20', $1)`, [tagA]), 'user B cannot use user A’s tag');
ok((await as(B, `select * from tags`)).rows.length === 0, 'user B cannot see user A’s tags');

// Food, shopping, weigh-ins
const food = (await as(A, `insert into foods (name, calories, protein) values ('Oats', 800, 27) returning id`)).rows[0].id;
await as(A, `insert into food_logs (date, slot, food_id, name, calories, protein) values ('2026-11-23', 'breakfast', $1, 'Oats', 800, 27)`, [food]);
await as(A, `insert into nutrition_goals (calories, protein) values (3500, 180)`);
await throws(() => as(A, `insert into nutrition_goals (calories) values (2000)`), 'only one set of nutrition goals per user');
await throws(() => as(A, `update nutrition_goals set calories = 50`), 'calorie goal must be realistic (500–10,000)');
await as(A, `insert into shopping_items (name, amount, aisle) values ('Beef mince', '600 g', 'meat')`);
await throws(() => as(A, `insert into shopping_items (name, aisle) values ('x', 'garage')`), 'shopping aisle must be a known value');
await as(A, `insert into weigh_ins (date, kg) values ('2026-11-23', 72.4)`);
await throws(() => as(A, `insert into weigh_ins (date, kg) values ('2026-11-23', 72.6)`), 'one weigh-in per day');
ok((await as(B, `select * from food_logs`)).rows.length === 0 && (await as(B, `select * from shopping_items`)).rows.length === 0 && (await as(B, `select * from weigh_ins`)).rows.length === 0, 'user B cannot see user A’s food log, shopping list or weigh-ins');
await throws(() => as(B, `insert into food_logs (date, food_id, name) values ('2026-11-23', $1, 'x')`, [food]), 'user B cannot log user A’s saved food');
ok((await as(B, `update foods set calories = 1 where id = $1 returning id`, [food])).rows.length === 0, 'user B cannot edit user A’s foods');
await as(A, `delete from foods where id = $1`, [food]);
ok((await as(A, `select food_id, calories from food_logs`)).rows[0]?.food_id === null && Number((await as(A, `select calories from food_logs`)).rows[0].calories) === 800, 'deleting a saved food keeps past log entries');

// Write rate limit
let blocked = false, done = 0;
for (let i = 0; i < 260 && !blocked; i++) {
  try { await as(A, `insert into tasks (title) values ('spam ' || $1)`, [String(i)]); done++; } catch (e) { blocked = /rate limit/.test(e.message); }
}
ok(blocked && done <= 240, `rapid writes are cut off by the rate limit (allowed ${done})`);
await throws(() => as(A, `select * from private.write_counters`), 'rate-limit counters are not readable by users');
await db.exec(`reset role; update private.write_counters set window_start = window_start - interval '2 minutes'`);
await as(A, `insert into tasks (title) values ('after cool-down')`);
ok(true, 'writes work again after the window passes');
await as(A, `insert into settings (display_name) values ('first')`);
await throws(() => as(A, `insert into settings (display_name) values ('second')`), 'quota: only one settings row per user');

// Self-service erase / delete only ever touch the caller's own data
const before = (await as(A, `select count(*)::int n from routines`)).rows[0].n;
await as(B, `select public.erase_my_data()`);
ok((await as(B, `select count(*)::int n from goals`)).rows[0].n === 0, 'erase_my_data clears the caller’s data');
ok((await as(A, `select count(*)::int n from routines`)).rows[0].n === before && before > 0, 'erase_my_data leaves other users untouched');
await throws(() => as(null, `select public.erase_my_data()`), 'signed-out callers cannot erase anything');
await as(B, `insert into goals (title) values ('again')`);
await as(B, `select public.delete_my_account()`);
await db.exec('reset role');
ok((await db.query(`select count(*)::int n from auth.users where id = '${B}'`)).rows[0].n === 0, 'delete_my_account removes the caller’s login');
ok((await db.query(`select count(*)::int n from goals where user_id = '${B}'`)).rows[0].n === 0, 'deleting an account removes all its data');
ok((await db.query(`select count(*)::int n from auth.users where id = '${A}'`)).rows[0].n === 1, 'other accounts are unaffected');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll database checks passed');
process.exit(failures ? 1 : 0);
