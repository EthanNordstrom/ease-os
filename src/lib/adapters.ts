import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { emptyDB, TABLES, type DB, type TableName } from './types';
import { applyCascade } from './cascade';

type Row = Record<string, any>;
export type OpResult =
  | { ok: true; row: Row | null }
  | { ok: false; kind: 'offline' }
  | { ok: false; kind: 'busy' }
  | { ok: false; kind: 'conflict'; current: Row | null }
  | { ok: false; kind: 'duplicate' }
  | { ok: false; kind: 'error'; message: string };

export interface Adapter {
  mode: 'cloud' | 'local';
  loadAll(): Promise<DB>;
  insert(t: TableName, rec: Row): Promise<OpResult>;
  update(t: TableName, rec: Row, baseVersion: number): Promise<OpResult>;
  remove(t: TableName, id: string, baseVersion: number | null): Promise<OpResult>;
}

/* ---------------- Supabase (cloud) ---------------- */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = Boolean(URL && KEY);
export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

// Server-side protections (supabase/migrations/0004): EP429 = too many writes this minute, EP413 = storage quota.
const friendly = (error: any): OpResult => {
  if (error?.code === 'PGRST204' || /could not find the .* column/i.test(error?.message ?? ''))
    return { ok: false, kind: 'error', message: 'The database needs its latest update. Run the newest file in supabase/migrations, then try again.' };
  if (error?.code === 'EP429' || /rate limit/i.test(error?.message ?? '')) return { ok: false, kind: 'busy' };
  if (error?.code === 'EP413') return { ok: false, kind: 'error', message: 'You’ve reached the storage limit for this kind of item. Delete some old ones to add more.' };
  return { ok: false, kind: 'error', message: error?.message ?? String(error) };
};

const looksOffline = (err: any) =>
  !navigator.onLine || /fetch|network|load failed|timeout/i.test(String(err?.message ?? err ?? ''));

// Columns the server owns. `version` is bumped by a trigger; timestamps by defaults/triggers.
const strip = (rec: Row) => {
  const { version, updated_at, created_at, ...rest } = rec;
  return rest;
};

export class CloudAdapter implements Adapter {
  mode = 'cloud' as const;
  constructor(private sb: SupabaseClient, private userId: string) {}

  async loadAll(): Promise<DB> {
    // One request for everything (migration 0006). Falls back to one request per table on older databases.
    const one = await this.sb.rpc('get_my_data');
    if (!one.error && one.data && typeof one.data === 'object') return { ...emptyDB(), ...(one.data as Partial<DB>) } as DB;
    if (one.error && looksOffline(one.error)) throw one.error;
    const db = emptyDB();
    const results = await Promise.all(TABLES.map((t) => this.sb.from(t).select('*')));
    results.forEach((r, i) => {
      // A table added by a newer migration that hasn't been run yet: treat as empty rather than failing.
      if (r.error && (r.error.code === '42P01' || r.error.code === 'PGRST205' || /could not find the table/i.test(r.error.message))) return;
      if (r.error) throw r.error;
      (db as any)[TABLES[i]] = r.data ?? [];
    });
    return db;
  }

  private async fetchOne(t: TableName, id: string): Promise<Row | null | 'offline'> {
    try {
      const { data, error } = await this.sb.from(t).select('*').eq('id', id).maybeSingle();
      if (error) return looksOffline(error) ? 'offline' : null;
      return data;
    } catch { return 'offline'; }
  }

  async insert(t: TableName, rec: Row): Promise<OpResult> {
    try {
      const { data, error } = await this.sb.from(t).insert({ ...strip(rec), user_id: this.userId }).select().single();
      if (!error) return { ok: true, row: data };
      if (looksOffline(error)) return { ok: false, kind: 'offline' };
      if (error.code === '23505') {
        // Same id already exists → an earlier attempt succeeded but the response was lost.
        const existing = await this.fetchOne(t, rec.id);
        if (existing === 'offline') return { ok: false, kind: 'offline' };
        if (existing) return { ok: true, row: existing };
        return { ok: false, kind: 'duplicate' }; // a different unique key (e.g. same routine item + date)
      }
      return friendly(error);
    } catch (e) {
      return looksOffline(e) ? { ok: false, kind: 'offline' } : { ok: false, kind: 'error', message: String(e) };
    }
  }

  async update(t: TableName, rec: Row, baseVersion: number): Promise<OpResult> {
    try {
      const { id, user_id, ...patch } = strip(rec);
      const { data, error } = await this.sb.from(t).update(patch).eq('id', id).eq('version', baseVersion).select();
      if (error) return looksOffline(error) ? { ok: false, kind: 'offline' } : friendly(error);
      if (data && data.length === 1) return { ok: true, row: data[0] };
      const current = await this.fetchOne(t, rec.id);
      if (current === 'offline') return { ok: false, kind: 'offline' };
      return { ok: false, kind: 'conflict', current };
    } catch (e) {
      return looksOffline(e) ? { ok: false, kind: 'offline' } : { ok: false, kind: 'error', message: String(e) };
    }
  }

  async remove(t: TableName, id: string, baseVersion: number | null): Promise<OpResult> {
    try {
      let q = this.sb.from(t).delete().eq('id', id);
      if (baseVersion != null) q = q.eq('version', baseVersion);
      const { data, error } = await q.select();
      if (error) return looksOffline(error) ? { ok: false, kind: 'offline' } : friendly(error);
      if (data && data.length === 1) return { ok: true, row: null };
      const current = await this.fetchOne(t, id);
      if (current === 'offline') return { ok: false, kind: 'offline' };
      if (!current) return { ok: true, row: null }; // already gone
      return { ok: false, kind: 'conflict', current };
    } catch (e) {
      return looksOffline(e) ? { ok: false, kind: 'offline' } : { ok: false, kind: 'error', message: String(e) };
    }
  }
}

/* ---------------- Local demo (this browser only) ---------------- */

const LOCAL_KEY = 'ep.demo.db.v1';

export class LocalAdapter implements Adapter {
  mode = 'local' as const;
  private db: DB;
  constructor() {
    let parsed: DB | null = null;
    try { parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { parsed = null; }
    this.db = { ...emptyDB(), ...(parsed ?? {}) };
  }
  private persist(): OpResult | null {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.db)); return null; }
    catch (e) { return { ok: false, kind: 'error', message: 'This browser refused to save (storage full or private mode).' }; }
  }
  async loadAll() { return structuredClone(this.db); }
  async insert(t: TableName, rec: Row): Promise<OpResult> {
    const list = (this.db as any)[t] as Row[];
    if (list.some((r) => r.id === rec.id)) return { ok: true, row: list.find((r) => r.id === rec.id)! };
    if (t === 'routine_completions' && list.some((r) => r.routine_id === rec.routine_id && r.item_id === rec.item_id && r.date === rec.date))
      return { ok: false, kind: 'duplicate' };
    const now = new Date().toISOString();
    const row = { ...rec, version: 1, created_at: rec.created_at ?? now, updated_at: now };
    list.push(row);
    return this.persist() ?? { ok: true, row };
  }
  async update(t: TableName, rec: Row, baseVersion: number): Promise<OpResult> {
    const list = (this.db as any)[t] as Row[];
    const i = list.findIndex((r) => r.id === rec.id);
    if (i < 0) return { ok: false, kind: 'conflict', current: null };
    if (list[i].version !== baseVersion) return { ok: false, kind: 'conflict', current: list[i] };
    const row = { ...rec, version: baseVersion + 1, created_at: list[i].created_at, updated_at: new Date().toISOString() };
    list[i] = row;
    return this.persist() ?? { ok: true, row };
  }
  async remove(t: TableName, id: string): Promise<OpResult> {
    this.db = applyCascade(this.db, t, id);
    return this.persist() ?? { ok: true, row: null };
  }
  static wipe() { localStorage.removeItem(LOCAL_KEY); }
}
