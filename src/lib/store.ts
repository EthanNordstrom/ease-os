import { useSyncExternalStore } from 'react';
import type { Adapter } from './adapters';
import { applyCascade, cascadeChildren } from './cascade';
import { emptyDB, type DB, type Settings, type TableName, type Tables } from './types';
import { BRAND } from './brand';

export const uid = () =>
  (crypto as any).randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

type Row = Record<string, any>;
interface Op {
  opId: string;
  table: TableName;
  kind: 'insert' | 'update' | 'delete';
  id: string;
  record: Row | null;
  baseVersion: number | null;
  inflight?: boolean;
  error?: string;
}
export interface Conflict { key: string; table: TableName; id: string; mine: Row | null; theirs: Row | null; label: string }
export interface Toast { id: string; message: string; action?: { label: string; run: () => void }; tone?: 'info' | 'error' }
export type SaveStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'error' | 'conflict';

export interface State {
  ready: boolean;
  loadError: string | null;
  mode: 'cloud' | 'local';
  db: DB;
  status: SaveStatus;
  pending: number;
  failed: Op[];
  conflicts: Conflict[];
  toasts: Toast[];
  lastSyncedAt: string | null;
  online: boolean;
}

const deviceTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
const deviceLocale = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-AU';
const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'version' | 'created_at' | 'updated_at' | 'is_sample'> = {
  display_name: '',
  app_title: BRAND.title,
  timezone: deviceTZ(),
  week_start: 1,
  date_locale: deviceLocale(),
  hour12: false,
  default_rest_seconds: 120,
};

const LABELS: Record<TableName, string> = {
  settings: 'settings', routines: 'routine', routine_completions: 'routine check-off', events: 'event', goals: 'goal',
  milestones: 'milestone', tasks: 'task', exercises: 'exercise', workout_templates: 'workout template', workouts: 'workout',
  quotes: 'quote', reviews: 'weekly review', tags: 'tag',
  nutrition_goals: 'calorie goal', foods: 'saved food', food_logs: 'food entry', meal_plans: 'day plan', shopping_items: 'shopping item', weigh_ins: 'weigh-in',
};

class Store {
  private listeners = new Set<() => void>();
  private adapter: Adapter | null = null;
  private outbox: Op[] = [];
  private flushing = false;
  private retryTimer: number | null = null;
  private cacheKey = '';
  private outboxKey = '';
  private userId: string | null = null;
  state: State = {
    ready: false, loadError: null, mode: 'local', db: emptyDB(), status: 'loading', pending: 0, failed: [], conflicts: [],
    toasts: [], lastSyncedAt: null, online: typeof navigator === 'undefined' ? true : navigator.onLine,
  };

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /* ---------- lifecycle ---------- */

  async start(adapter: Adapter, userId: string | null) {
    this.adapter = adapter;
    this.userId = userId;
    const scope = adapter.mode === 'cloud' ? `cloud.${userId}` : 'local';
    this.cacheKey = `ep.cache.${scope}`;
    this.outboxKey = `ep.outbox.${scope}`;
    try { this.outbox = JSON.parse(localStorage.getItem(this.outboxKey) || '[]').map((o: Op) => ({ ...o, inflight: false })); }
    catch { this.outbox = []; }
    this.set({ mode: adapter.mode, ready: false, loadError: null, status: 'loading' });

    if (adapter.mode === 'cloud') {
      // Show cached data immediately (useful offline), then refresh from the server.
      try {
        const cached = JSON.parse(localStorage.getItem(this.cacheKey) || 'null');
        if (cached) this.set({ db: this.replay({ ...emptyDB(), ...cached }), ready: true });
      } catch { /* ignore */ }
    }
    await this.refresh(true);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
  }

  stop() {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
    this.adapter = null;
    this.set({ ready: false, db: emptyDB() });
  }

  private onOnline = () => { this.set({ online: true }); this.flush().then(() => this.refresh()); };
  private onOffline = () => { this.set({ online: false }); this.recomputeStatus(); };
  private lastRefresh = 0;
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.state.mode !== 'cloud') return;
    if (Date.now() - this.lastRefresh < 5000) return;
    this.flush().then(() => this.refresh());
  };

  async refresh(initial = false) {
    if (!this.adapter) return;
    this.lastRefresh = Date.now();
    try {
      const db = await this.adapter.loadAll();
      this.set({ db: this.replay(db), ready: true, loadError: null, lastSyncedAt: new Date().toISOString() });
      this.cache();
      if (initial) await this.ensureSettings();
      this.flush();
    } catch (e: any) {
      if (this.state.ready) { this.set({ online: navigator.onLine }); this.recomputeStatus(); return; }
      this.set({ loadError: navigator.onLine ? (e?.message || 'Could not load your data.') : 'You are offline and nothing is cached on this device yet.' });
    }
  }

  private async ensureSettings() {
    // New accounts start empty and go through first-run setup.
    // Test builds only (VITE_TEST_SEED=1) fill in example data for automated checks.
    if (import.meta.env.VITE_TEST_SEED === '1' && !this.state.db.settings.length) {
      const { seedStarter } = await import('./testSeed');
      seedStarter(this);
    }
  }

  get needsSetup() { return this.state.ready && this.state.db.settings.length === 0; }

  /* ---------- reads ---------- */

  get settings(): Settings {
    return this.state.db.settings[0] ?? ({ id: 'default', version: 0, created_at: '', updated_at: '', is_sample: false, ...DEFAULT_SETTINGS } as Settings);
  }

  /* ---------- writes (optimistic) ---------- */

  insert<T extends TableName>(table: T, data: Partial<Tables[T]>): Tables[T] {
    const now = new Date().toISOString();
    const rec = { id: uid(), version: 0, created_at: now, updated_at: now, is_sample: false, ...data } as unknown as Tables[T];
    if (this.userId) (rec as any).user_id = this.userId;
    this.setTable(table, [...(this.state.db[table] as any[]), rec]);
    this.enqueue({ opId: uid(), table, kind: 'insert', id: (rec as any).id, record: rec as any, baseVersion: null });
    return rec;
  }

  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]> | ((r: Tables[T]) => Partial<Tables[T]>)) {
    const list = this.state.db[table] as any[];
    const cur = list.find((r) => r.id === id);
    if (!cur) return;
    const p = typeof patch === 'function' ? (patch as any)(cur) : patch;
    const next = { ...cur, ...p, updated_at: new Date().toISOString() };
    this.setTable(table, list.map((r) => (r.id === id ? next : r)));
    this.enqueue({ opId: uid(), table, kind: 'update', id, record: next, baseVersion: cur.version });
  }

  remove(table: TableName, id: string, opts: { undo?: string } = {}) {
    const list = this.state.db[table] as any[];
    const cur = list.find((r) => r.id === id);
    if (!cur) return;
    const children = cascadeChildren(this.state.db, table, id);
    this.set({ db: applyCascade(this.state.db, table, id) });
    // Drop queued child ops — the server cascade handles them.
    const childIds = new Set(children.flatMap((c) => c.rows.map((r) => r.id)));
    this.outbox = this.outbox.filter((o) => o.inflight || !childIds.has(o.id));
    this.enqueue({ opId: uid(), table, kind: 'delete', id, record: null, baseVersion: cur.version });
    if (opts.undo) {
      this.toast(opts.undo, {
        label: 'Undo',
        run: () => {
          this.restore(table, cur);
          children.forEach((c) => c.rows.forEach((r) => this.restore(c.table, r)));
        },
      });
    }
  }

  private restore(table: TableName, row: Row) {
    this.setTable(table, [...(this.state.db[table] as any[]).filter((r) => r.id !== row.id), row]);
    this.enqueue({ opId: uid(), table, kind: 'insert', id: row.id, record: row, baseVersion: null });
  }

  private setTable(table: TableName, rows: any[]) {
    this.set({ db: { ...this.state.db, [table]: rows } });
    this.cacheSoon();
  }

  /* ---------- outbox ---------- */

  private enqueue(op: Op) {
    // Coalesce with a queued (not in-flight) op for the same record.
    const i = this.outbox.findIndex((o) => !o.inflight && o.table === op.table && o.id === op.id);
    if (i >= 0) {
      const prev = this.outbox[i];
      if (prev.kind === 'insert' && op.kind === 'update') this.outbox[i] = { ...prev, record: op.record, error: undefined };
      else if (prev.kind === 'insert' && op.kind === 'delete') this.outbox.splice(i, 1);
      else if (prev.kind === 'update' && op.kind === 'update') this.outbox[i] = { ...prev, record: op.record, error: undefined };
      else if (prev.kind === 'update' && op.kind === 'delete') this.outbox[i] = { ...op, baseVersion: prev.baseVersion };
      else if (prev.kind === 'delete' && op.kind === 'insert') this.outbox[i] = { ...op, kind: 'update', baseVersion: prev.baseVersion };
      else this.outbox.push(op);
    } else {
      // If an insert for this record is in flight, the update's base version is unknown until it returns.
      const inflightInsert = this.outbox.find((o) => o.inflight && o.id === op.id && o.kind === 'insert');
      this.outbox.push(inflightInsert && op.kind !== 'insert' ? { ...op, baseVersion: null } : op);
    }
    this.persistOutbox();
    this.recomputeStatus();
    this.scheduleFlush();
  }

  private flushTimer: number | null = null;
  private scheduleFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => this.flush(), this.state.mode === 'local' ? 0 : 350);
  }

  async flush() {
    if (this.flushing || !this.adapter) return;
    this.flushing = true;
    try {
      while (true) {
        const op = this.outbox.find((o) => !o.inflight && !o.error);
        if (!op) break;
        if (this.state.mode === 'cloud' && !navigator.onLine) { this.set({ online: false }); break; }
        op.inflight = true;
        this.recomputeStatus();
        const a = this.adapter;
        const res =
          op.kind === 'insert' ? await a.insert(op.table, op.record!)
          : op.kind === 'update' ? await a.update(op.table, op.record!, op.baseVersion ?? this.currentVersion(op.table, op.id))
          : await a.remove(op.table, op.id, op.baseVersion);
        op.inflight = false;
        if (res.ok) {
          this.outbox = this.outbox.filter((o) => o !== op);
          this.reconcile(op, res.row);
          this.set({ online: true, lastSyncedAt: new Date().toISOString() });
        } else if (res.kind === 'offline') {
          this.set({ online: navigator.onLine ? true : false });
          this.scheduleRetry();
          break;
        } else if (res.kind === 'busy') {
          // The server asked us to slow down; keep the change and try again shortly.
          this.busyUntil = Date.now() + 20000;
          this.scheduleRetry(20000);
          break;
        } else if (res.kind === 'conflict') {
          this.outbox = this.outbox.filter((o) => o !== op);
          this.addConflict(op, res.current);
        } else if (res.kind === 'duplicate') {
          // Another device already created the equivalent row (e.g. same routine item on the same day).
          this.outbox = this.outbox.filter((o) => o !== op);
          this.refresh();
        } else {
          op.error = res.message;
        }
        this.persistOutbox();
      }
    } finally {
      this.flushing = false;
      this.recomputeStatus();
      this.cache();
    }
  }

  private currentVersion(table: TableName, id: string) {
    return (this.state.db[table] as any[]).find((r) => r.id === id)?.version ?? 0;
  }

  private busyUntil = 0;
  private scheduleRetry(ms = 8000) {
    if (this.retryTimer) return;
    this.retryTimer = window.setTimeout(() => { this.retryTimer = null; this.flush(); }, ms);
  }

  private reconcile(op: Op, row: Row | null) {
    if (!row) return;
    // Later queued edits for the same record now build on the new server version.
    this.outbox.forEach((o) => { if (o.table === op.table && o.id === op.id && o.kind !== 'insert') o.baseVersion = row.version; });
    const hasPending = this.outbox.some((o) => o.table === op.table && o.id === op.id);
    const list = this.state.db[op.table] as any[];
    if (!list.some((r) => r.id === op.id)) return;
    this.set({
      db: {
        ...this.state.db,
        [op.table]: list.map((r) => (r.id === op.id ? (hasPending ? { ...r, version: row.version } : row) : r)),
      },
    });
  }

  private addConflict(op: Op, theirs: Row | null) {
    const mine = op.kind === 'delete' ? null : op.record;
    const label = LABELS[op.table];
    // A deleted-everywhere record with nothing of mine to keep needs no decision.
    if (!mine && !theirs) return;
    const key = `${op.table}:${op.id}`;
    this.set({ conflicts: [...this.state.conflicts.filter((c) => c.key !== key), { key, table: op.table, id: op.id, mine, theirs, label }] });
  }

  resolveConflict(key: string, choice: 'mine' | 'theirs') {
    const c = this.state.conflicts.find((x) => x.key === key);
    if (!c) return;
    this.set({ conflicts: this.state.conflicts.filter((x) => x.key !== key) });
    const list = this.state.db[c.table] as any[];
    if (choice === 'theirs') {
      const without = list.filter((r) => r.id !== c.id);
      this.setTable(c.table, c.theirs ? [...without, c.theirs] : without);
      return;
    }
    if (!c.mine) {
      // I deleted it, they edited it: delete their version.
      this.setTable(c.table, list.filter((r) => r.id !== c.id));
      this.enqueue({ opId: uid(), table: c.table, kind: 'delete', id: c.id, record: null, baseVersion: c.theirs!.version });
    } else if (!c.theirs) {
      // They deleted it, I edited it: put mine back.
      this.setTable(c.table, [...list.filter((r) => r.id !== c.id), c.mine]);
      this.enqueue({ opId: uid(), table: c.table, kind: 'insert', id: c.id, record: c.mine, baseVersion: null });
    } else {
      const rec = { ...c.mine, version: c.theirs.version };
      this.setTable(c.table, list.map((r) => (r.id === c.id ? rec : r)));
      this.enqueue({ opId: uid(), table: c.table, kind: 'update', id: c.id, record: rec, baseVersion: c.theirs.version });
    }
  }

  retryFailed() {
    this.outbox.forEach((o) => (o.error = undefined));
    this.persistOutbox();
    this.flush();
  }
  discardFailed() {
    this.outbox = this.outbox.filter((o) => !o.error);
    this.persistOutbox();
    this.refresh();
  }

  private replay(db: DB): DB {
    let out = db;
    for (const op of this.outbox) {
      const list = out[op.table] as any[];
      if (op.kind === 'delete') out = applyCascade(out, op.table, op.id);
      else out = { ...out, [op.table]: [...list.filter((r) => r.id !== op.id), { ...op.record, version: list.find((r) => r.id === op.id)?.version ?? op.record!.version }] };
    }
    return out;
  }

  private recomputeStatus() {
    const failed = this.outbox.filter((o) => o.error);
    const pending = this.outbox.length;
    const s = this.state;
    let status: SaveStatus = 'saved';
    if (failed.length) status = 'error';
    else if (s.conflicts.length) status = 'conflict';
    else if (pending && Date.now() < this.busyUntil) status = 'saving';
    else if (pending && (this.state.mode === 'cloud' && (!navigator.onLine || this.retryTimer))) status = 'offline';
    else if (pending) status = 'saving';
    else if (this.state.mode === 'cloud' && !navigator.onLine) status = 'offline';
    this.set({ status, pending, failed: [...failed] });
  }

  private persistOutbox() {
    try { localStorage.setItem(this.outboxKey, JSON.stringify(this.outbox.map(({ inflight, ...o }) => o))); }
    catch { this.toast('This device could not store unsaved changes. Keep the app open until it shows Saved.', undefined, 'error'); }
  }
  private cacheT: number | null = null;
  private cacheSoon() { if (this.cacheT) clearTimeout(this.cacheT); this.cacheT = window.setTimeout(() => this.cache(), 500); }
  private cache() {
    if (this.state.mode !== 'cloud') return;
    try { localStorage.setItem(this.cacheKey, JSON.stringify(this.state.db)); } catch { /* cache is best-effort */ }
  }

  /* ---------- toasts ---------- */

  toast(message: string, action?: Toast['action'], tone: Toast['tone'] = 'info') {
    const t: Toast = { id: uid(), message, action, tone };
    this.set({ toasts: [...this.state.toasts.slice(-2), t] });
    window.setTimeout(() => this.dismiss(t.id), action ? 7000 : 3500);
  }
  dismiss(id: string) { this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) }); }

  /* ---------- bulk ---------- */

  clearSamples() {
    const db = this.state.db;
    (Object.keys(db) as TableName[]).forEach((t) => {
      if (t === 'settings') return;
      (db[t] as any[]).filter((r) => r.is_sample).forEach((r) => this.remove(t, r.id));
    });
  }

  exportJSON() {
    return JSON.stringify({ exported_at: new Date().toISOString(), app: 'ease-os', format_version: 1, data: this.state.db }, null, 2);
  }
}

export const store = new Store();
export const useStore = () => useSyncExternalStore(store.subscribe, () => store.state);
export const useDB = () => useStore().db;
export const useSettings = () => { useStore(); return store.settings; };
export { DEFAULT_SETTINGS };
