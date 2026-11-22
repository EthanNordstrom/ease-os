import { useState, useSyncExternalStore } from 'react';
import { store, useDB, useSettings } from '../lib/store';
import { addDays, fmtDate, isValidISO, todayISO, weekday } from '../lib/dates';
import { CATEGORY_META, GOAL_CATEGORIES, routineProgress } from '../lib/domain';
import type { CalEvent, Category, Goal, ISODate, Recurrence, WorkoutEntry } from '../lib/types';
import { CheckButton, Field, Icon, Segmented, Sheet, Toggle, WeekdayPicker, confirmAction, num } from './ui';
import { uid } from '../lib/store';
import { navigate } from '../lib/router';
import { tagHex } from '../lib/palette';
import { TagEditor } from './Tags';
import { AddFoodSheet } from './FoodSheets';
import { slotForHour } from '../lib/food';
import { nowParts } from '../lib/dates';
import { guessAisle } from '../lib/food';

export type EditorReq =
  | { type: 'quickAdd' }
  | { type: 'event'; id?: string; date?: ISODate; occurrenceDate?: ISODate; goalId?: string }
  | { type: 'goal'; id?: string; stage?: Goal['stage']; promote?: boolean }
  | { type: 'task'; id?: string; goalId?: string; focusToday?: boolean }
  | { type: 'workout'; id?: string; date?: ISODate }
  | { type: 'milestone'; id?: string; goalId?: string }
  | { type: 'routineDay'; routineId: string; date: ISODate }
  | { type: 'food'; date?: ISODate }
  | { type: 'shopping' };

let current: EditorReq | null = null;
const ls = new Set<() => void>();
export const openEditor = (r: EditorReq) => { current = r; ls.forEach((l) => l()); };
export const closeEditor = () => { current = null; ls.forEach((l) => l()); };

export function EditorHost() {
  const req = useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => current);
  if (!req) return null;
  const key = JSON.stringify(req);
  switch (req.type) {
    case 'quickAdd': return <QuickAdd key={key} />;
    case 'event': return <EventForm key={key} {...req} />;
    case 'goal': return <GoalForm key={key} {...req} />;
    case 'task': return <TaskForm key={key} {...req} />;
    case 'workout': return <PlanWorkoutForm key={key} {...req} />;
    case 'milestone': return <MilestoneForm key={key} {...req} />;
    case 'routineDay': return <RoutineDay key={key} {...req} />;
    case 'food': return <QuickFood key={key} date={req.date} />;
    case 'shopping': return <QuickShopping key={key} />;
  }
}

/* ---------------- Quick add ---------------- */
function QuickAdd() {
  const opts: { t: EditorReq; label: string; hint: string; icon: string }[] = [
    { t: { type: 'task', focusToday: true }, label: 'Task', hint: 'A to-do, optionally one of today’s priorities', icon: 'check' },
    { t: { type: 'event' }, label: 'Event', hint: 'Something on the calendar', icon: 'calendar' },
    { t: { type: 'goal', stage: 'active' }, label: 'Goal', hint: 'Something to work toward, or an idea', icon: 'goals' },
    { t: { type: 'food' }, label: 'Food', hint: 'Log something you ate', icon: 'food' },
    { t: { type: 'shopping' }, label: 'Shopping item', hint: 'Add to your shopping list', icon: 'cart' },
    { t: { type: 'workout' }, label: 'Workout', hint: 'Plan a gym session on a date', icon: 'gym' },
  ];
  return (
    <Sheet open onClose={closeEditor} title="Add">
      <div className="-my-2">
        {opts.map((o) => (
          <button key={o.label} onClick={() => openEditor(o.t)} className="w-full row text-left hover:bg-ink-850 -mx-2 px-2 rounded transition-colors">
            <span className="w-10 h-10 grid place-items-center rounded border border-ink-600 text-fg-2"><Icon name={o.icon} /></span>
            <span className="flex-1"><span className="block text-[16px]">{o.label}</span><span className="block text-sm text-fg-2">{o.hint}</span></span>
            <Icon name="right" className="text-fg-3" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const Footer = ({ onCancel, onSave, saveLabel = 'Save', onDelete, disabled }: { onCancel: () => void; onSave: () => void; saveLabel?: string; onDelete?: () => void; disabled?: boolean }) => (
  <>
    {onDelete && <button className="btn-danger mr-auto" onClick={onDelete}><Icon name="trash" size={18} />Delete</button>}
    <button className="btn-ghost" onClick={onCancel}>Cancel</button>
    <button className="btn-primary" onClick={onSave} disabled={disabled}>{saveLabel}</button>
  </>
);

/* ---------------- Event ---------------- */
function EventForm({ id, date, occurrenceDate, goalId }: { id?: string; date?: ISODate; occurrenceDate?: ISODate; goalId?: string }) {
  const db = useDB();
  const s = useSettings();
  const existing = id ? db.events.find((e) => e.id === id) : undefined;
  const ex = existing && occurrenceDate ? existing.exceptions?.[occurrenceDate] ?? {} : {};
  const isRecurring = !!existing?.recurrence;
  const [scope, setScope] = useState<'one' | 'series'>(isRecurring && occurrenceDate ? 'one' : 'series');
  const baseDate = existing ? (isRecurring && occurrenceDate ? ex.date ?? occurrenceDate : existing.date) : date ?? todayISO(s.timezone);
  const [f, setF] = useState({
    title: ex.title ?? existing?.title ?? '',
    category: existing?.category ?? ('personal' as Category),
    date: baseDate,
    all_day: ex.all_day ?? existing?.all_day ?? false,
    start_time: (ex.start_time !== undefined ? ex.start_time : existing?.start_time) ?? '09:00',
    end_time: (ex.end_time !== undefined ? ex.end_time : existing?.end_time) ?? '10:00',
    notes: ex.notes ?? existing?.notes ?? '',
    repeat: existing?.recurrence?.freq ?? ('none' as 'none' | Recurrence['freq']),
    interval: existing?.recurrence?.interval ?? 1,
    weekdays: existing?.recurrence?.weekdays ?? [weekday(baseDate)],
    until: existing?.recurrence?.until ?? '',
    goal_id: existing?.goal_id ?? goalId ?? '',
    workout_id: existing?.workout_id ?? '',
    tag_id: existing?.tag_id ?? '',
  });
  const [newTag, setNewTag] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const editingOne = isRecurring && scope === 'one' && !!occurrenceDate;
  const timeError = !f.all_day && f.end_time && f.start_time && f.end_time <= f.start_time ? 'End time must be after the start time.' : '';
  const valid = f.title.trim() && isValidISO(f.date) && !timeError;

  const save = () => {
    if (!valid) return;
    if (editingOne && existing && occurrenceDate) {
      store.update('events', existing.id, (e) => ({ exceptions: { ...e.exceptions, [occurrenceDate]: {
        title: f.title.trim(), date: f.date, all_day: f.all_day, start_time: f.all_day ? null : f.start_time, end_time: f.all_day ? null : f.end_time, notes: f.notes,
      } } }));
      store.toast('Updated this occurrence');
      return closeEditor();
    }
    const recurrence: Recurrence | null = f.repeat === 'none' ? null : {
      freq: f.repeat, interval: Math.max(1, Number(f.interval) || 1), weekdays: f.repeat === 'weekly' ? (f.weekdays.length ? f.weekdays : [weekday(f.date)]) : [],
      until: f.until && isValidISO(f.until) ? f.until : null,
    };
    const data: Partial<CalEvent> = {
      title: f.title.trim(), category: f.category, all_day: f.all_day, start_time: f.all_day ? null : f.start_time, end_time: f.all_day ? null : f.end_time,
      notes: f.notes, recurrence, goal_id: f.goal_id || null, workout_id: f.workout_id || null,
      // Only send tag_id when tags are in use, so the app keeps working before migration 0004 is applied.
      ...(f.tag_id || existing?.tag_id ? { tag_id: f.tag_id || null } : {}),
    };
    if (existing) {
      // Editing the whole series from an occurrence keeps the series' own start date unless the date was changed.
      const newDate = isRecurring && occurrenceDate ? (f.date === baseDate ? existing.date : f.date) : f.date;
      store.update('events', existing.id, { ...data, date: newDate });
      store.toast(isRecurring ? 'Updated all events in the series' : 'Event updated');
    } else {
      store.insert('events', { ...data, date: f.date, exceptions: {} });
      store.toast('Event added');
    }
    closeEditor();
  };

  const del = async () => {
    if (!existing) return;
    if (editingOne && occurrenceDate) {
      const prev = existing.exceptions;
      store.update('events', existing.id, { exceptions: { ...prev, [occurrenceDate]: { cancelled: true } } });
      store.toast('Removed this occurrence', { label: 'Undo', run: () => store.update('events', existing.id, { exceptions: prev }) });
    } else {
      const ok = await confirmAction({ title: isRecurring ? 'Delete the whole series?' : 'Delete event?', body: isRecurring ? 'Every occurrence of this event will be removed.' : `“${existing.title}” will be removed.`, confirm: 'Delete', danger: true });
      if (!ok) return;
      store.remove('events', existing.id, { undo: 'Event deleted' });
    }
    closeEditor();
  };

  return (
    <Sheet open onClose={closeEditor} title={existing ? 'Edit event' : 'New event'}
      footer={<Footer onCancel={closeEditor} onSave={save} onDelete={existing ? del : undefined} disabled={!valid} saveLabel={existing ? 'Save' : 'Add event'} />}>
      <div className="space-y-5">
        {isRecurring && occurrenceDate && (
          <div className="space-y-2">
            <span className="label block">Apply changes to</span>
            <Segmented label="Apply changes to" value={scope} onChange={setScope} options={[{ value: 'one', label: 'This event only' }, { value: 'series', label: 'All in series' }]} />
          </div>
        )}
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Studio session" data-autofocus /></Field>
        {!editingOne && (
          <div>
            <span className="label block mb-1.5">Category or tag</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category or tag">
              {(Object.keys(CATEGORY_META) as Category[]).map((c) => {
                const on = !f.tag_id && f.category === c;
                return (
                  <button key={c} role="radio" aria-checked={on} onClick={() => set({ category: c, tag_id: '' })}
                    className={`h-10 px-3 rounded-full border text-sm flex items-center gap-2 transition-all duration-150 active:scale-95 ${on ? 'border-fg-2 text-fg bg-ink-800' : 'border-ink-600 text-fg-2 hover:text-fg'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_META[c].color }} />{CATEGORY_META[c].label}
                  </button>
                );
              })}
              {db.tags.map((t) => {
                const on = f.tag_id === t.id;
                return (
                  <button key={t.id} role="radio" aria-checked={on} onClick={() => set({ tag_id: t.id })}
                    className={`h-10 px-3 rounded-full border text-sm flex items-center gap-2 transition-all duration-150 active:scale-95 ${on ? 'border-fg-2 text-fg bg-ink-800' : 'border-ink-600 text-fg-2 hover:text-fg'}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: tagHex(t.color) }} />{t.name}
                  </button>
                );
              })}
              <button onClick={() => setNewTag(true)} className="h-10 px-3 rounded-full border border-dashed border-ink-500 text-sm text-fg-2 hover:text-fg flex items-center gap-1.5 transition-colors">
                <Icon name="plus" size={14} />New tag
              </button>
            </div>
            {newTag && <TagEditor onClose={() => setNewTag(false)} onSaved={(t) => set({ tag_id: t.id })} />}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={isRecurring && !editingOne ? 'Starts' : 'Date'}><input type="date" className="input" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <div className="flex items-end"><Toggle checked={f.all_day} onChange={(v) => set({ all_day: v })} label="All day" /></div>
        </div>
        {!f.all_day && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start"><input type="time" className="input" value={f.start_time} onChange={(e) => set({ start_time: e.target.value })} /></Field>
            <Field label="End"><input type="time" className="input" value={f.end_time} onChange={(e) => set({ end_time: e.target.value })} /></Field>
            {timeError && <p className="col-span-2 text-sm text-bad -mt-2">{timeError}</p>}
          </div>
        )}
        {!editingOne && (
          <div className="space-y-3">
            <Field label="Repeat">
              <select className="input" value={f.repeat} onChange={(e) => set({ repeat: e.target.value as any })}>
                <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly (same date)</option>
              </select>
            </Field>
            {f.repeat === 'weekly' && <WeekdayPicker value={f.weekdays} onChange={(v) => set({ weekdays: v })} locale={s.date_locale} weekStart={s.week_start} />}
            {f.repeat !== 'none' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label={`Every (${f.repeat === 'daily' ? 'days' : f.repeat === 'weekly' ? 'weeks' : 'months'})`}>
                  <input type="number" inputMode="numeric" min={1} className="input" value={f.interval} onChange={(e) => set({ interval: Number(e.target.value) || 1 })} />
                </Field>
                <Field label="Until (optional)"><input type="date" className="input" value={f.until} onChange={(e) => set({ until: e.target.value })} /></Field>
              </div>
            )}
          </div>
        )}
        <Field label="Notes"><textarea className="input min-h-[88px]" value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        {!editingOne && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Link to goal">
              <select className="input" value={f.goal_id} onChange={(e) => set({ goal_id: e.target.value })}>
                <option value="">None</option>
                {db.goals.filter((g) => g.stage !== 'archived').map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </Field>
            <Field label="Link to workout">
              <select className="input" value={f.workout_id} onChange={(e) => set({ workout_id: e.target.value })}>
                <option value="">None</option>
                {db.workouts.filter((w) => w.status !== 'completed').map((w) => <option key={w.id} value={w.id}>{w.name}{w.planned_date ? ` · ${fmtDate(w.planned_date, s.date_locale, { day: 'numeric', month: 'short' })}` : ''}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- Goal (core fields) ---------------- */
export function GoalForm({ id, stage, promote }: { id?: string; stage?: Goal['stage']; promote?: boolean }) {
  const db = useDB();
  const s = useSettings();
  const existing = id ? db.goals.find((g) => g.id === id) : undefined;
  const today = todayISO(s.timezone);
  const [f, setF] = useState({
    title: existing?.title ?? '', description: existing?.description ?? '', why: existing?.why ?? '',
    category: existing?.category ?? ('music' as Goal['category']),
    stage: promote ? 'active' : existing?.stage ?? stage ?? 'active',
    priority: existing?.priority ?? ('medium' as Goal['priority']),
    start_date: existing?.start_date ?? (promote || !existing ? today : ''),
    target_date: existing?.target_date ?? '',
    progress_method: existing?.progress_method ?? ('checklist' as Goal['progress_method']),
    target_value: existing?.target_value?.toString() ?? '', current_value: existing?.current_value?.toString() ?? '0', unit: existing?.unit ?? '',
    next_action: existing?.next_action ?? '',
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const isIdea = f.stage === 'idea';
  const dateErr = f.start_date && f.target_date && f.target_date < f.start_date ? 'Target date is before the start date.' : '';
  const valid = f.title.trim() && !dateErr;

  const save = () => {
    if (!valid) return;
    const data: Partial<Goal> = {
      title: f.title.trim(), description: f.description, why: f.why, category: f.category, stage: f.stage as Goal['stage'], priority: f.priority,
      start_date: f.start_date || null, target_date: f.target_date || null, progress_method: f.progress_method,
      target_value: num(f.target_value), current_value: num(f.current_value) ?? 0, unit: f.unit.trim(), next_action: f.next_action,
      completed_at: f.stage === 'completed' ? existing?.completed_at ?? new Date().toISOString() : null,
    };
    if (existing) { store.update('goals', existing.id, data); store.toast(promote ? 'Idea promoted to an active goal' : 'Goal saved'); closeEditor(); }
    else {
      const g = store.insert('goals', { ...data, notes: [] });
      store.toast(isIdea ? 'Idea saved' : 'Goal added');
      closeEditor();
      if (!isIdea) navigate(`goals/${g.id}`);
    }
  };

  return (
    <Sheet open onClose={closeEditor} wide title={promote ? 'Promote to active goal' : existing ? 'Edit goal' : isIdea ? 'New idea' : 'New goal'}
      footer={<Footer onCancel={closeEditor} onSave={save} disabled={!valid} saveLabel={promote ? 'Make it active' : existing ? 'Save' : isIdea ? 'Save idea' : 'Add goal'} />}>
      <div className="space-y-5">
        {!existing && !promote && <Segmented label="Type" value={isIdea ? 'idea' : 'active'} onChange={(v) => set({ stage: v })} options={[{ value: 'active', label: 'Active goal' }, { value: 'idea', label: 'Just an idea' }]} />}
        {promote && <p className="text-sm text-fg-2">Everything you wrote for this idea is kept. Add a timeline and how you’ll measure progress.</p>}
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={isIdea ? 'Something you might want to do' : 'e.g. Finish a new demo'} /></Field>
        <Field label="Description"><textarea className="input min-h-[72px]" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="What does done look like?" /></Field>
        <Field label="Why it matters to me"><textarea className="input min-h-[72px]" value={f.why} onChange={(e) => set({ why: e.target.value })} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Category">
            <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value as any })}>
              {Object.entries(GOAL_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={f.priority} onChange={(e) => set({ priority: e.target.value as any })}>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </Field>
        </div>
        {!isIdea && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Start date"><input type="date" className="input" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
              <Field label="Target date"><input type="date" className="input" value={f.target_date} onChange={(e) => set({ target_date: e.target.value })} /></Field>
              {existing && (
                <Field label="Status">
                  <select className="input" value={f.stage} onChange={(e) => set({ stage: e.target.value as any })}>
                    <option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option><option value="idea">Back to ideas</option>
                  </select>
                </Field>
              )}
            </div>
            {dateErr && <p className="text-sm text-bad -mt-2">{dateErr}</p>}
            <div className="space-y-3">
              <span className="label block">How progress is measured</span>
              <Segmented label="Progress method" value={f.progress_method} onChange={(v) => set({ progress_method: v })}
                options={[{ value: 'checklist', label: 'Milestones & tasks done' }, { value: 'numeric', label: 'Numeric target' }]} />
              {f.progress_method === 'numeric' ? (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Current"><input type="number" inputMode="decimal" className="input" value={f.current_value} onChange={(e) => set({ current_value: e.target.value })} /></Field>
                  <Field label="Target"><input type="number" inputMode="decimal" className="input" value={f.target_value} onChange={(e) => set({ target_value: e.target.value })} placeholder="12" /></Field>
                  <Field label="Unit"><input className="input" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="workouts" /></Field>
                </div>
              ) : <p className="text-sm text-fg-2">Progress = completed milestones and tasks out of the total. Add them on the goal page.</p>}
            </div>
            <Field label="Next action" hint="Leave blank to use the first open task."><input className="input" value={f.next_action} onChange={(e) => set({ next_action: e.target.value })} placeholder="The very next physical step" /></Field>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- Task ---------------- */
function TaskForm({ id, goalId, focusToday }: { id?: string; goalId?: string; focusToday?: boolean }) {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const existing = id ? db.tasks.find((t) => t.id === id) : undefined;
  const focusCount = db.tasks.filter((t) => t.focus_date === today && t.id !== id).length;
  const [f, setF] = useState({
    title: existing?.title ?? '', goal_id: existing?.goal_id ?? goalId ?? '', due_date: existing?.due_date ?? '',
    focus: existing ? existing.focus_date === today : !!focusToday && focusCount < 3,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.title.trim()) return;
    const data = { title: f.title.trim(), goal_id: f.goal_id || null, due_date: f.due_date || null, focus_date: f.focus ? today : existing?.focus_date === today ? null : existing?.focus_date ?? null };
    if (existing) store.update('tasks', existing.id, data);
    else store.insert('tasks', { ...data, done: false, done_at: null, sort: db.tasks.filter((t) => t.goal_id === (f.goal_id || null)).length });
    store.toast(existing ? 'Task saved' : f.focus ? 'Added to today’s priorities' : 'Task added');
    closeEditor();
  };
  const del = async () => {
    if (!existing) return;
    store.remove('tasks', existing.id, { undo: 'Task deleted' });
    closeEditor();
  };
  return (
    <Sheet open onClose={closeEditor} title={existing ? 'Edit task' : 'New task'}
      footer={<Footer onCancel={closeEditor} onSave={save} onDelete={existing ? del : undefined} disabled={!f.title.trim()} saveLabel={existing ? 'Save' : 'Add task'} />}>
      <div className="space-y-5">
        <Field label="Task"><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="What needs doing?" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Goal">
            <select className="input" value={f.goal_id} onChange={(e) => set({ goal_id: e.target.value })}>
              <option value="">No goal</option>
              {db.goals.filter((g) => g.stage === 'active' || g.stage === 'paused').map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </Field>
          <Field label="Due date (optional)"><input type="date" className="input" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} /></Field>
        </div>
        <div>
          <Toggle checked={f.focus} onChange={(v) => (v && focusCount >= 3 ? store.toast('Today already has three priorities') : set({ focus: v }))} label="One of today’s priorities" />
          {focusCount >= 3 && !f.focus && <p className="text-sm text-fg-2 mt-1">Today already has three priorities — that’s plenty.</p>}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Plan workout ---------------- */
export function entriesFromTemplate(tplId: string): WorkoutEntry[] {
  const tpl = store.state.db.workout_templates.find((t) => t.id === tplId);
  if (!tpl) return [];
  return tpl.items.map((it) => ({
    id: uid(), exercise_id: it.exercise_id, notes: '', rest_seconds: it.rest_seconds,
    sets: Array.from({ length: Math.max(1, it.sets) }, () => ({ id: uid(), type: 'working' as const, reps: it.reps, weight: it.weight, seconds: it.seconds, rpe: null, done: false, done_at: null })),
  }));
}

function PlanWorkoutForm({ id, date }: { id?: string; date?: ISODate }) {
  const db = useDB();
  const s = useSettings();
  const existing = id ? db.workouts.find((w) => w.id === id) : undefined;
  const [f, setF] = useState({
    template_id: existing?.template_id ?? db.workout_templates.find((t) => !t.archived)?.id ?? '', name: existing?.name ?? '',
    planned_date: existing?.planned_date ?? date ?? todayISO(s.timezone), planned_time: existing?.planned_time ?? '',
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const tpl = db.workout_templates.find((t) => t.id === f.template_id);
  const name = f.name.trim() || tpl?.name || 'Workout';
  const save = () => {
    if (!isValidISO(f.planned_date)) return;
    if (existing) {
      store.update('workouts', existing.id, { name, planned_date: f.planned_date, planned_time: f.planned_time || null });
      store.toast('Workout rescheduled');
    } else {
      store.insert('workouts', { name, template_id: f.template_id || null, planned_date: f.planned_date, planned_time: f.planned_time || null, status: 'planned',
        started_at: null, finished_at: null, notes: '', entries: f.template_id ? entriesFromTemplate(f.template_id) : [] });
      store.toast('Workout planned');
    }
    closeEditor();
  };
  const del = async () => {
    if (!existing) return;
    if (await confirmAction({ title: 'Delete workout?', body: existing.status === 'completed' ? 'This removes it from your history and progress charts.' : 'This planned workout will be removed.', confirm: 'Delete', danger: true })) {
      store.remove('workouts', existing.id, { undo: 'Workout deleted' });
      closeEditor();
    }
  };
  return (
    <Sheet open onClose={closeEditor} title={existing ? 'Edit workout' : 'Plan a workout'}
      footer={<Footer onCancel={closeEditor} onSave={save} onDelete={existing ? del : undefined} saveLabel={existing ? 'Save' : 'Plan workout'} />}>
      <div className="space-y-5">
        {!existing && (
          <Field label="Template">
            <select className="input" value={f.template_id} onChange={(e) => set({ template_id: e.target.value })}>
              <option value="">Empty workout</option>
              {db.workout_templates.filter((t) => !t.archived || t.id === f.template_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={tpl?.name ?? 'Workout'} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date"><input type="date" className="input" value={f.planned_date} onChange={(e) => set({ planned_date: e.target.value })} /></Field>
          <Field label="Time (optional)"><input type="time" className="input" value={f.planned_time} onChange={(e) => set({ planned_time: e.target.value })} /></Field>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Milestone ---------------- */
function MilestoneForm({ id, goalId }: { id?: string; goalId?: string }) {
  const db = useDB();
  const existing = id ? db.milestones.find((m) => m.id === id) : undefined;
  const gid = existing?.goal_id ?? goalId!;
  const goal = db.goals.find((g) => g.id === gid);
  const [f, setF] = useState({ title: existing?.title ?? '', due_date: existing?.due_date ?? '', done: existing?.done ?? false });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.title.trim()) return;
    const data = { title: f.title.trim(), due_date: f.due_date || null, done: f.done, done_at: f.done ? existing?.done_at ?? new Date().toISOString() : null };
    if (existing) store.update('milestones', existing.id, data);
    else store.insert('milestones', { ...data, goal_id: gid, sort: db.milestones.filter((m) => m.goal_id === gid).length });
    closeEditor();
  };
  return (
    <Sheet open onClose={closeEditor} title={existing ? 'Edit milestone' : 'New milestone'}
      footer={<Footer onCancel={closeEditor} onSave={save} disabled={!f.title.trim()} onDelete={existing ? () => { store.remove('milestones', existing.id, { undo: 'Milestone deleted' }); closeEditor(); } : undefined} />}>
      <div className="space-y-5">
        {goal && <p className="meta">{goal.title}</p>}
        <Field label="Milestone"><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Deadline (optional)" hint="Dated milestones appear on your calendar."><input type="date" className="input" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} /></Field>
        <Toggle checked={f.done} onChange={(v) => set({ done: v })} label="Completed" />
        {goal && <button className="btn-ghost -ml-3" onClick={() => { closeEditor(); navigate(`goals/${goal.id}`); }}>Open goal <Icon name="arrow" size={16} /></button>}
      </div>
    </Sheet>
  );
}

/* ---------------- Routine on a specific day ---------------- */
export function toggleRoutineItem(routineId: string, itemId: string, title: string, date: ISODate) {
  const existing = store.state.db.routine_completions.find((c) => c.routine_id === routineId && c.item_id === itemId && c.date === date);
  if (existing) store.remove('routine_completions', existing.id);
  else store.insert('routine_completions', { routine_id: routineId, item_id: itemId, date, item_title: title, completed_at: new Date().toISOString() });
}

function RoutineDay({ routineId, date }: { routineId: string; date: ISODate }) {
  const db = useDB();
  const s = useSettings();
  const r = db.routines.find((x) => x.id === routineId);
  if (!r) return null;
  const p = routineProgress(db, r, date);
  const today = todayISO(s.timezone);
  return (
    <Sheet open onClose={closeEditor} title={r.name}
      footer={<><button className="btn-ghost mr-auto" onClick={() => { closeEditor(); navigate('routines'); }}>Edit routine</button><button className="btn-primary" onClick={closeEditor}>Done</button></>}>
      <p className="meta mb-3">{fmtDate(date, s.date_locale, { weekday: 'long', day: 'numeric', month: 'long' })} · {p.current} of {p.total} done{date > today ? ' · upcoming' : ''}</p>
      <ul>
        {r.items.map((it) => (
          <li key={it.id} className="row">
            <CheckButton checked={p.done.has(it.id)} onClick={() => toggleRoutineItem(r.id, it.id, it.title, date)} label={`${it.title} on ${date}`} />
            <span className={p.done.has(it.id) ? 'text-fg-2 line-through decoration-ink-500' : ''}>{it.title}</span>
          </li>
        ))}
      </ul>
      {date !== today && <button className="btn-ghost mt-3 -ml-3" onClick={() => openEditor({ type: 'routineDay', routineId, date: addDays(date, 1) })}>Next day <Icon name="right" size={16} /></button>}
    </Sheet>
  );
}

/* ---------------- Quick food / shopping ---------------- */
function QuickFood({ date }: { date?: ISODate }) {
  const s = useSettings();
  const now = nowParts(s.timezone);
  return <AddFoodSheet date={date ?? now.date} slot={slotForHour(now.hour)} onClose={closeEditor} />;
}

function QuickShopping() {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const save = (again: boolean) => {
    const n = name.trim();
    if (!n) return;
    const db = store.state.db;
    if (db.shopping_items.some((x) => !x.done && x.name.toLowerCase() === n.toLowerCase())) store.toast(`${n} is already on your list`);
    else { store.insert('shopping_items', { name: n, amount: amount.trim(), aisle: guessAisle(n), done: false, source: '', sort: 0 }); store.toast(`Added ${n}`); }
    if (again) { setName(''); setAmount(''); } else closeEditor();
  };
  return (
    <Sheet open onClose={closeEditor} title="Add to shopping list"
      footer={<><button className="btn-ghost" onClick={closeEditor}>Done</button><button className="btn-outline" disabled={!name.trim()} onClick={() => save(true)}>Add another</button><button className="btn-primary" disabled={!name.trim()} onClick={() => save(false)}>Add</button></>}>
      <div className="space-y-4">
        <Field label="Item"><input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save(true)} placeholder="e.g. Rolled oats" /></Field>
        <Field label="Amount (optional)"><input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 1 kg" /></Field>
      </div>
    </Sheet>
  );
}
