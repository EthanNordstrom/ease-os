// Test-only stand-in for Supabase: a tiny PostgREST + GoTrue subset over PGlite,
// running the real migration with RLS. Lets the browser tests exercise the real
// supabase-js client, sync code and database policies end to end.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const PORT = Number(process.env.PORT || 54321);
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, password text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
for (const f of ['0001_init.sql', '0002_hardening.sql', '0003_accounts.sql', '0004_tags_and_limits.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8'));
const TABLES = new Set(['settings', 'routines', 'routine_completions', 'goals', 'milestones', 'tasks', 'exercises', 'workout_templates', 'workouts', 'events', 'quotes', 'reviews', 'tags']);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (u) => { const exp = Math.floor(Date.now() / 1000) + 3600; return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp })}.sig`; };
const userObj = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const session = (u) => ({ access_token: token(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: userObj(u) });
const subFrom = (req) => { try { return JSON.parse(Buffer.from((req.headers.authorization || '').split(' ')[1].split('.')[1], 'base64url')).sub; } catch { return null; } };

let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

async function asUser(sub, fn) {
  return serial(async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); set role ${sub ? 'authenticated' : 'anon'};`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  });
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Range' };
const send = (res, status, body) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
let offline = false;

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x');
  // Test hook to simulate the network dropping for this "server".
  if (url.pathname === '/__offline') { offline = url.searchParams.get('v') === '1'; return send(res, 200, { offline }); }
  if (offline) { req.socket.destroy(); return; }
  let raw = ''; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : null;
  try {
    // ---------- auth ----------
    if (url.pathname === '/auth/v1/signup') {
      const id = crypto.randomUUID();
      await serial(() => db.query('insert into auth.users values ($1,$2,$3)', [id, body.email, body.password]));
      const u = { id, email: body.email }; return send(res, 200, session(u));
    }
    if (url.pathname === '/auth/v1/token') {
      const r = await serial(() => db.query('select id, email from auth.users where email=$1 and password=$2', [body.email, body.password]));
      if (!r.rows.length) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' });
      return send(res, 200, session(r.rows[0]));
    }
    if (url.pathname === '/auth/v1/recover') return send(res, 200, {});
    if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
      const sub = subFrom(req);
      if (body?.password) await serial(() => db.query('update auth.users set password=$1 where id=$2', [body.password, sub]));
      const r = await serial(() => db.query('select id,email from auth.users where id=$1', [sub]));
      return send(res, 200, userObj(r.rows[0]));
    }
    if (url.pathname === '/auth/v1/user') {
      const sub = subFrom(req); const r = await serial(() => db.query('select id,email from auth.users where id=$1', [sub]));
      return r.rows.length ? send(res, 200, userObj(r.rows[0])) : send(res, 401, { msg: 'no user' });
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204);

    // ---------- rpc ----------
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) {
      await asUser(subFrom(req), () => db.query(`select public.${rpc[1]}()`));
      return send(res, 204);
    }
    // ---------- rest ----------
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m || !TABLES.has(m[1])) return send(res, 404, { message: 'not found' });
    const t = m[1];
    const params = []; const where = [];
    for (const [k, v] of url.searchParams) {
      if (['select', 'columns', 'order', 'limit'].includes(k)) continue;
      if (!/^\w+$/.test(k) || !v.startsWith('eq.')) continue;
      params.push(v.slice(3)); where.push(`${k}::text = $${params.length}`);
    }
    const w = where.length ? `where ${where.join(' and ')}` : '';
    const sub = subFrom(req);
    let rows;
    if (req.method === 'GET') rows = (await asUser(sub, () => db.query(`select to_jsonb(x) j from ${t} x ${w}`, params))).rows;
    else if (req.method === 'POST') {
      const recs = Array.isArray(body) ? body : [body];
      rows = [];
      for (const rec of recs) {
        const cols = Object.keys(rec).filter((c) => /^\w+$/.test(c));
        const r = await asUser(sub, () => db.query(`insert into ${t} (${cols.join(',')}) select ${cols.join(',')} from jsonb_populate_record(null::${t}, $1::jsonb) returning to_jsonb(${t}.*) j`, [JSON.stringify(rec)]));
        rows.push(...r.rows);
      }
    } else if (req.method === 'PATCH') {
      const cols = Object.keys(body).filter((c) => /^\w+$/.test(c));
      params.push(JSON.stringify(body));
      const p = `$${params.length}::jsonb`;
      rows = (await asUser(sub, () => db.query(`update ${t} set (${cols.join(',')}) = (select ${cols.join(',')} from jsonb_populate_record(null::${t}, ${p})) ${w} returning to_jsonb(${t}.*) j`, params))).rows;
    } else if (req.method === 'DELETE') rows = (await asUser(sub, () => db.query(`delete from ${t} ${w} returning to_jsonb(${t}.*) j`, params))).rows;
    const data = rows.map((r) => r.j);
    if ((req.headers.accept || '').includes('vnd.pgrst.object')) {
      if (data.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${data.length} rows`, hint: null });
      return send(res, 200, data[0]);
    }
    return send(res, 200, data);
  } catch (e) {
    const code = e.code || 'XX000';
    return send(res, code === '23505' ? 409 : code === '42501' ? 403 : 400, { code, message: e.message, details: e.detail ?? null, hint: null });
  }
}).listen(PORT, () => console.log(`mock supabase on :${PORT}`));
