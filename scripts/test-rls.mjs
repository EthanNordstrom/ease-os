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
await db.exec(readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8'));

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
await as(B, `insert into goals (title) values ('B goal')`);
await throws(async () => { const res = await as(B, `update goals set user_id = $1 where title = 'B goal' returning user_id`, [A]); if (res.rows[0]?.user_id === A) return; throw new Error('blocked'); }, 'ownership cannot be transferred by update');
ok((await as(B, `select * from goals`)).rows.length === 1, 'user B sees only their own goal');

// Anonymous access
await throws(() => as(null, `select * from goals`), 'signed-out (anon) requests are refused');

// Cascades
await as(A, `insert into milestones (goal_id, title, due_date) values ($1, 'Mixdown', '2026-11-30')`, [g.id]);
await as(A, `delete from goals where id = $1`, [g.id]);
ok((await as(A, `select count(*)::int n from milestones`)).rows[0].n === 0, 'deleting a goal removes its milestones');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll database checks passed');
process.exit(failures ? 1 : 0);
