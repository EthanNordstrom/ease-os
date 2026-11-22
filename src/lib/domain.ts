import { addMonths, diffDays, rangeDays, startOfWeek, weekday } from './dates';
import { tagHex } from './palette';
import { fmtMoney, isPaid, moneySettings, paydayPlan, repeatDates, savedSoFar } from './money';
import type { CalEvent, Category, DB, Exercise, Goal, ISODate, Routine, Workout, WorkoutSet } from './types';

/* ---------------- Routines ---------------- */

export const routineScheduledOn = (r: Routine, d: ISODate) => r.active && r.weekdays.includes(weekday(d)) && d >= r.created_at.slice(0, 10);

export function routineProgress(db: DB, r: Routine, d: ISODate) {
  const done = new Set(db.routine_completions.filter((c) => c.routine_id === r.id && c.date === d).map((c) => c.item_id));
  const current = r.items.filter((i) => done.has(i.id)).length;
  return { done, current, total: r.items.length };
}

/**
 * Which routine matters right now. A timed routine is "current" from its start time for up to
 * 5½ hours (so a 6:30am morning routine shows until midday); outside those windows the next one
 * coming up is shown, and after the last one of the day it stays on screen. Untimed routines
 * are only picked when there are no timed ones.
 */
export const ROUTINE_WINDOW_MIN = 330;
export function pickCurrentRoutine(rs: Routine[], nowMin: number): Routine | null {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const timed = rs.filter((r) => r.start_time).sort((a, b) => toMin(a.start_time!) - toMin(b.start_time!));
  if (!timed.length) return rs[0] ?? null;
  const active = [...timed].reverse().find((r) => toMin(r.start_time!) <= nowMin && nowMin < toMin(r.start_time!) + ROUTINE_WINDOW_MIN);
  if (active) return active;
  return timed.find((r) => toMin(r.start_time!) > nowMin) ?? timed[timed.length - 1];
}

/* ---------------- Recurring events ---------------- */

export interface Occurrence { event: CalEvent; date: ISODate; originalDate: ISODate; title: string; all_day: boolean; start_time: string | null; end_time: string | null; notes: string; recurring: boolean }

function matches(e: CalEvent, d: ISODate) {
  const r = e.recurrence;
  if (!r) return d === e.date;
  if (d < e.date || (r.until && d > r.until)) return false;
  const n = diffDays(d, e.date);
  const interval = Math.max(1, r.interval || 1);
  if (r.freq === 'daily') return n % interval === 0;
  if (r.freq === 'weekly') {
    const days = r.weekdays.length ? r.weekdays : [weekday(e.date)];
    if (!days.includes(weekday(d))) return false;
    const weeks = Math.round(diffDays(startOfWeek(d, 1), startOfWeek(e.date, 1)) / 7);
    return weeks % interval === 0;
  }
  if (r.freq === 'monthly') {
    if (d.slice(8) !== e.date.slice(8)) return false;
    const months = (Number(d.slice(0, 4)) - Number(e.date.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(e.date.slice(5, 7));
    return months % interval === 0;
  }
  return false;
}

export function expandEvents(events: CalEvent[], from: ISODate, to: ISODate): Occurrence[] {
  const out: Occurrence[] = [];
  const days = rangeDays(from, to);
  for (const e of events) {
    const base = (orig: ISODate, d: ISODate, o: any = {}): Occurrence => ({
      event: e, date: d, originalDate: orig, title: o.title ?? e.title, all_day: o.all_day ?? e.all_day,
      start_time: o.start_time !== undefined ? o.start_time : e.start_time, end_time: o.end_time !== undefined ? o.end_time : e.end_time,
      notes: o.notes ?? e.notes, recurring: !!e.recurrence,
    });
    if (!e.recurrence) {
      if (e.date >= from && e.date <= to) out.push(base(e.date, e.date));
      continue;
    }
    for (const d of days) {
      if (!matches(e, d)) continue;
      const ex = e.exceptions?.[d];
      if (ex?.cancelled) continue;
      if (ex?.date && ex.date !== d) continue; // moved elsewhere
      out.push(base(d, d, ex));
    }
    // Occurrences moved INTO this range from outside it
    for (const [orig, ex] of Object.entries(e.exceptions ?? {})) {
      if (!ex.date || ex.cancelled || ex.date === orig) continue;
      if (ex.date >= from && ex.date <= to && matches(e, orig)) out.push(base(orig, ex.date, ex));
    }
  }
  return out;
}

/* ---------------- Unified calendar items ---------------- */

export type ItemKind = 'event' | 'routine' | 'workout' | 'goal' | 'milestone' | 'bill' | 'payday' | 'saving';
export interface CalItem {
  key: string; kind: ItemKind; category: Category; title: string; date: ISODate; all_day: boolean;
  start_time: string | null; end_time: string | null; completed: boolean; progress?: string; refId: string; occ?: Occurrence; sample?: boolean;
  /** Filter key ('personal'… or 'tag:<id>'), colour and label shown for this item. */
  filter: string; color: string; label: string;
}

export function calendarItems(db: DB, from: ISODate, to: ISODate, today: ISODate): CalItem[] {
  const raw: Omit<CalItem, 'filter' | 'color' | 'label'>[] = [];
  const tags = new Map((db.tags ?? []).map((t) => [t.id, t]));
  const items = { push: (i: Omit<CalItem, 'filter' | 'color' | 'label'>) => raw.push(i) };
  for (const o of expandEvents(db.events, from, to)) {
    items.push({ key: `e:${o.event.id}:${o.originalDate}`, kind: 'event', category: o.event.category, title: o.title, date: o.date,
      all_day: o.all_day, start_time: o.all_day ? null : o.start_time, end_time: o.all_day ? null : o.end_time, completed: false, refId: o.event.id, occ: o, sample: o.event.is_sample });
  }
  const days = rangeDays(from, to);
  for (const r of db.routines) {
    for (const d of days) {
      if (!routineScheduledOn(r, d)) continue;
      const p = routineProgress(db, r, d);
      items.push({ key: `r:${r.id}:${d}`, kind: 'routine', category: 'routine', title: r.name, date: d, all_day: !r.start_time,
        start_time: r.start_time, end_time: null, completed: p.total > 0 && p.current === p.total,
        progress: d <= today || p.current ? `${p.current}/${p.total}` : undefined, refId: r.id });
    }
  }
  for (const w of db.workouts) {
    const d = w.planned_date ?? w.started_at?.slice(0, 10);
    if (!d || d < from || d > to) continue;
    items.push({ key: `w:${w.id}`, kind: 'workout', category: 'gym', title: w.name, date: d, all_day: !w.planned_time, start_time: w.planned_time,
      end_time: null, completed: w.status === 'completed', progress: w.status === 'in_progress' ? 'in progress' : undefined, refId: w.id, sample: w.is_sample });
  }
  for (const g of db.goals) {
    if (!g.target_date || g.stage === 'idea' || g.stage === 'archived') continue;
    if (g.target_date >= from && g.target_date <= to)
      items.push({ key: `g:${g.id}`, kind: 'goal', category: 'goals', title: `Deadline · ${g.title}`, date: g.target_date, all_day: true,
        start_time: null, end_time: null, completed: g.stage === 'completed', refId: g.id, sample: g.is_sample });
  }
  const goalById = new Map(db.goals.map((g) => [g.id, g]));
  for (const m of db.milestones) {
    const g = goalById.get(m.goal_id);
    if (!m.due_date || !g || g.stage === 'idea' || g.stage === 'archived') continue;
    if (m.due_date >= from && m.due_date <= to)
      items.push({ key: `m:${m.id}`, kind: 'milestone', category: 'goals', title: m.title, date: m.due_date, all_day: true,
        start_time: null, end_time: null, completed: m.done, refId: m.id, sample: m.is_sample });
  }
  // Money: bill due dates, paydays (with what to move) and savings deadlines
  const m = moneySettings(db);
  const cur = (n: number) => fmtMoney(n, m.currency, db.settings[0]?.date_locale ?? 'en-AU');
  for (const b of db.bills.filter((x) => x.active)) {
    for (const d of repeatDates(b.due_date, b.frequency, from, to))
      items.push({ key: `b:${b.id}:${d}`, kind: 'bill', category: 'money', title: `${b.name} · ${cur(Number(b.amount))}`, date: d, all_day: true,
        start_time: null, end_time: null, completed: isPaid(db, b.id, d) || (b.autopay && d <= today), refId: b.id });
  }
  if (m.next_payday && m.pay_frequency !== 'none' && (db.bills.length || db.savings_goals.length)) {
    const plan = paydayPlan(db, today);
    for (const d of repeatDates(m.next_payday, m.pay_frequency, from, to))
      items.push({ key: `p:${d}`, kind: 'payday', category: 'money', title: plan.total > 0 ? `Payday · move ${cur(plan.total)}` : 'Payday', date: d, all_day: true,
        start_time: null, end_time: null, completed: d < today, refId: 'payday' });
  }
  for (const g of db.savings_goals.filter((x) => !x.archived && x.target_date && x.target_date >= from && x.target_date <= to))
    items.push({ key: `s:${g.id}`, kind: 'saving', category: 'money', title: `Savings goal · ${g.name}`, date: g.target_date!, all_day: true,
      start_time: null, end_time: null, completed: savedSoFar(db, g) >= Number(g.target), refId: g.id });

  const out: CalItem[] = raw.map((i) => {
    const tag = i.kind === 'event' && i.occ?.event.tag_id ? tags.get(i.occ.event.tag_id) : undefined;
    return tag ? { ...i, filter: `tag:${tag.id}`, color: tagHex(tag.color), label: tag.name }
      : { ...i, filter: i.category, color: CATEGORY_META[i.category].color, label: CATEGORY_META[i.category].label };
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(b.all_day) - Number(a.all_day) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
}

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  // Mid-tone hues readable on both the light and dark backgrounds.
  personal: { label: 'Personal', color: tagHex('slate') },
  routine: { label: 'Routine', color: 'rgb(var(--acid))' },
  gym: { label: 'Gym', color: tagHex('amber') },
  music: { label: 'Music', color: tagHex('violet') },
  goals: { label: 'Goals', color: tagHex('stone') },
  money: { label: 'Money', color: tagHex('green') },
};

/* ---------------- Goals ---------------- */

export const GOAL_CATEGORIES: Record<Goal['category'], string> = {
  health: 'Health & fitness', appearance: 'Appearance & self-care', music: 'Music & creativity', career: 'Career & learning',
  money: 'Money & organisation', personal: 'Personal life',
};

export function goalProgress(db: DB, g: Goal): { label: string; ratio: number | null; detail: string } {
  if (g.progress_method === 'numeric') {
    if (!g.target_value) return { label: 'No target set', ratio: null, detail: 'Set a number to aim for' };
    return { label: `${g.current_value} of ${g.target_value}${g.unit ? ' ' + g.unit : ''}`, ratio: Math.min(1, g.current_value / g.target_value), detail: 'Numeric target' };
  }
  const ms = db.milestones.filter((m) => m.goal_id === g.id);
  const ts = db.tasks.filter((t) => t.goal_id === g.id);
  const total = ms.length + ts.length;
  const done = ms.filter((m) => m.done).length + ts.filter((t) => t.done).length;
  if (!total) return { label: 'No milestones or tasks yet', ratio: null, detail: 'Milestones & tasks' };
  return { label: `${done} of ${total} done`, ratio: done / total, detail: 'Milestones & tasks completed' };
}

export function nextAction(db: DB, g: Goal): { text: string; taskId?: string } | null {
  if (g.next_action.trim()) return { text: g.next_action.trim() };
  const t = db.tasks.filter((x) => x.goal_id === g.id && !x.done).sort((a, b) => a.sort - b.sort)[0];
  if (t) return { text: t.title, taskId: t.id };
  const m = db.milestones.filter((x) => x.goal_id === g.id && !x.done).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))[0];
  if (m) return { text: `Work toward: ${m.title}` };
  return null;
}

/* ---------------- Gym ---------------- */

export const setVolume = (s: WorkoutSet) => (s.type === 'working' && s.done && s.weight && s.reps ? s.weight * s.reps : 0);

export function previousEntry(db: DB, exerciseId: string, excludeWorkoutId: string) {
  const prev = db.workouts
    .filter((w) => w.id !== excludeWorkoutId && w.status === 'completed' && w.entries.some((e) => e.exercise_id === exerciseId))
    .sort((a, b) => (b.finished_at ?? b.planned_date ?? '').localeCompare(a.finished_at ?? a.planned_date ?? ''))[0];
  if (!prev) return null;
  const entry = prev.entries.find((e) => e.exercise_id === exerciseId)!;
  return { workout: prev, entry };
}

export function describeSet(s: WorkoutSet, kind: Exercise['kind']) {
  if (kind === 'timed') return `${s.seconds ?? '–'}s`;
  if (kind === 'bodyweight') return `${s.reps ?? '–'}${s.weight ? ` +${s.weight}kg` : ''}`;
  return `${s.weight ?? '–'}×${s.reps ?? '–'}`;
}

export const workoutDate = (w: Workout) => w.planned_date ?? w.started_at?.slice(0, 10) ?? '';

export interface SeriesPoint { date: ISODate; value: number }
export function exerciseSeries(db: DB, ex: Exercise, metric: string): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const done = db.workouts.filter((w) => w.status === 'completed').sort((a, b) => workoutDate(a).localeCompare(workoutDate(b)));
  for (const w of done) {
    const sets = w.entries.filter((e) => e.exercise_id === ex.id).flatMap((e) => e.sets).filter((s) => s.done && s.type === 'working');
    if (!sets.length) continue;
    let v = 0;
    if (metric === 'volume') v = sets.reduce((a, s) => a + setVolume(s), 0);
    else if (metric.startsWith('best@')) {
      const reps = Number(metric.slice(5));
      v = Math.max(0, ...sets.filter((s) => (s.reps ?? 0) >= reps && s.weight).map((s) => s.weight!));
    } else if (metric === 'reps') v = Math.max(0, ...sets.map((s) => s.reps ?? 0));
    else if (metric === 'seconds') v = Math.max(0, ...sets.map((s) => s.seconds ?? 0));
    if (v > 0) out.push({ date: workoutDate(w), value: v });
  }
  return out;
}

export function repCountsFor(db: DB, exId: string) {
  const s = new Set<number>();
  db.workouts.forEach((w) => w.entries.filter((e) => e.exercise_id === exId).forEach((e) => e.sets.forEach((x) => x.done && x.type === 'working' && x.reps && s.add(x.reps))));
  return [...s].sort((a, b) => a - b);
}

export { addMonths };
