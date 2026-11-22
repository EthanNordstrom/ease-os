import { useEffect, useMemo, useState } from 'react';
import { store, uid, useDB, useSettings } from '../lib/store';
import { addDays, fmtDate, fmtTime, todayISO, weekdaysLabel } from '../lib/dates';
import { describeSet, templateOccurrences, exerciseSeries, previousEntry, repCountsFor, setVolume, workoutDate } from '../lib/domain';
import type { Exercise, ExerciseKind, TemplateItem, Workout, WorkoutEntry, WorkoutSet, WorkoutTemplate } from '../lib/types';
import { Empty, Field, Icon, Segmented, Sheet, WeekdayPicker, confirmAction, num } from '../components/ui';
import { entriesFromTemplate, openEditor } from '../components/editors';
import { navigate } from '../lib/router';
import LineChart from '../components/LineChart';
import { adoptExercise, materialiseTemplate, missingCatalog, startWorkout } from '../lib/workouts';
import { EXERCISE_CATALOG, catalogKey } from '../lib/exerciseCatalog';
import { createPortal } from 'react-dom';

type Tab = 'plan' | 'templates' | 'exercises' | 'history' | 'progress';
const KIND_LABEL: Record<ExerciseKind, string> = { weighted: 'Weighted', bodyweight: 'Bodyweight', timed: 'Timed' };

export default function Gym({ sub, id }: { sub?: string; id?: string }) {
  if (sub === 'session' && id) return <Session id={id} />;
  const tab = (['plan', 'templates', 'exercises', 'history', 'progress'].includes(sub ?? '') ? sub : 'plan') as Tab;
  return (
    <div className="anim-fade">
      <header className="mb-8">
        <p className="label mb-3">Gym</p>
        <h1 className="h-display">Train with intent.</h1>
      </header>
      <div className="mb-8 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar">
        <Segmented label="Gym section" value={tab} onChange={(t) => navigate(`gym/${t}`)} options={[
          { value: 'plan', label: 'Plan' }, { value: 'templates', label: 'Templates' }, { value: 'exercises', label: 'Exercises' },
          { value: 'history', label: 'History' }, { value: 'progress', label: 'Progress' }]} />
      </div>
      {tab === 'plan' && <Plan />}
      {tab === 'templates' && <Templates />}
      {tab === 'exercises' && <Exercises />}
      {tab === 'history' && <History />}
      {tab === 'progress' && <ProgressView />}
    </div>
  );
}


function startNow(templateId: string | null, name: string) {
  const today = todayISO(store.settings.timezone);
  const w = store.insert('workouts', { name, template_id: templateId, planned_date: today, planned_time: null, status: 'planned', started_at: null, finished_at: null, notes: '',
    entries: templateId ? entriesFromTemplate(templateId) : [] });
  startWorkout(w);
}

/* ---------------- Plan ---------------- */
function Plan() {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const active = db.workouts.filter((w) => w.status === 'in_progress');
  const upcoming = db.workouts.filter((w) => w.status === 'planned').sort((a, b) => (a.planned_date ?? '9').localeCompare(b.planned_date ?? '9'));
  const repeating = templateOccurrences(db, today, addDays(today, 6)).filter((o) => !upcoming.some((w) => w.template_id === o.template.id && w.planned_date === o.date));
  const overdue = upcoming.filter((w) => w.planned_date && w.planned_date < today);
  const next = upcoming.filter((w) => !w.planned_date || w.planned_date >= today);
  const Row = ({ w }: { w: Workout }) => (
    <li className="row py-3 flex-wrap">
      <button className="flex-1 min-w-[180px] text-left" onClick={() => navigate(`gym/session/${w.id}`)}>
        <span className="flex items-center gap-2">{w.name}</span>
        <span className="meta block mt-0.5">{w.planned_date ? fmtDate(w.planned_date, s.date_locale, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Unscheduled'}{w.planned_time ? ` · ${fmtTime(w.planned_time, s.hour12)}` : ''} · {w.entries.length} exercises</span>
      </button>
      <button className="btn-ghost" onClick={() => openEditor({ type: 'workout', id: w.id })}>Reschedule</button>
      <button className="btn-primary" onClick={() => (w.status === 'in_progress' ? navigate(`gym/session/${w.id}`) : startWorkout(w))}><Icon name="play" size={16} />{w.status === 'in_progress' ? 'Resume' : 'Start'}</button>
    </li>
  );
  return (
    <div className="space-y-12">
      {active.length > 0 && <section><p className="label mb-2">In progress</p><ul className="border-t border-ink-700">{active.map((w) => <Row key={w.id} w={w} />)}</ul></section>}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="label">Planned</p>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => openEditor({ type: 'workout' })}><Icon name="calendar" size={16} />Plan</button>
            <button className="btn-ghost" onClick={() => startNow(null, 'Workout')}>Start empty</button>
          </div>
        </div>
        {!next.length ? <Empty title="Nothing planned" body="Plan a workout from a template — it’ll show on your calendar." /> : <ul className="stagger border-t border-ink-700">{next.map((w) => <Row key={w.id} w={w} />)}</ul>}
      </section>
      {repeating.length > 0 && (
        <section>
          <p className="label mb-1">Repeating this week</p>
          <p className="text-sm text-fg-2 mb-3">From the days you set on your templates. They’re also on your calendar.</p>
          <ul className="stagger border-t border-ink-700">{repeating.map((o) => (
            <li key={o.template.id + o.date} className="row py-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <span className="block">{o.template.name}</span>
                <span className="meta block mt-0.5">{fmtDate(o.date, s.date_locale, { weekday: 'short', day: 'numeric', month: 'short' })}{o.template.plan_time ? ` · ${fmtTime(o.template.plan_time, s.hour12)}` : ' · any time'} · {o.template.items.length} exercises</span>
              </div>
              <button className="btn-ghost" onClick={() => { const w = materialiseTemplate(o.template.id, o.date); if (w) openEditor({ type: 'workout', id: w.id }); }}>Reschedule</button>
              <button className="btn-primary" onClick={() => { const w = materialiseTemplate(o.template.id, o.date); if (w) startWorkout(w); }}><Icon name="play" size={16} />Start</button>
            </li>
          ))}</ul>
        </section>
      )}
      {overdue.length > 0 && (
        <section>
          <p className="label mb-1">Earlier plans not done</p>
          <p className="text-sm text-fg-2 mb-3">No problem — reschedule, start now, or delete them.</p>
          <ul className="border-t border-ink-700">{overdue.map((w) => <Row key={w.id} w={w} />)}</ul>
        </section>
      )}
    </div>
  );
}

/* ---------------- Session logger ---------------- */
const REST_KEY = 'ep.rest';
type Rest = { ends_at: number; total: number; label: string } | null;
const readRest = (): Rest => { try { return JSON.parse(localStorage.getItem(REST_KEY) || 'null'); } catch { return null; } };
const writeRest = (r: Rest) => { r ? localStorage.setItem(REST_KEY, JSON.stringify(r)) : localStorage.removeItem(REST_KEY); window.dispatchEvent(new Event('ep-rest')); };

function useNow(ms = 500) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
  return Date.now();
}

function RestTimer() {
  const [rest, setRest] = useState<Rest>(readRest);
  const [buzzed, setBuzzed] = useState(false);
  useEffect(() => { const f = () => { setRest(readRest()); setBuzzed(false); }; window.addEventListener('ep-rest', f); return () => window.removeEventListener('ep-rest', f); }, []);
  const now = useNow(250);
  if (!rest) return null;
  // Remaining time is derived from the stored end timestamp, so it stays accurate after backgrounding.
  const left = Math.max(0, Math.round((rest.ends_at - now) / 1000));
  if (left === 0 && !buzzed) { setBuzzed(true); try { navigator.vibrate?.([120, 80, 120]); } catch { /* not supported */ } }
  const adj = (d: number) => writeRest({ ...rest, ends_at: Math.max(Date.now(), rest.ends_at + d * 1000), total: Math.max(1, rest.total + d) });
  return createPortal(
    <div className="fixed z-40 inset-x-0 bottom-[calc(64px+var(--safe-bottom))] md:bottom-0 md:left-[232px] lg:left-[248px] bg-ink-850 border-t border-ink-600" role="timer" aria-live="off">
      <div className="h-0.5 bg-ink-700"><div className="h-full bg-acid transition-[width] duration-200" style={{ width: `${(1 - left / rest.total) * 100}%` }} /></div>
      <div className="max-w-[1180px] mx-auto flex items-center gap-2 px-4 py-2">
        <div className="flex-1 min-w-0">
          <p className="label">{left ? 'Rest' : 'Rest done'} · {rest.label}</p>
          <p className={`font-mono text-2xl tabular-nums ${left ? '' : 'text-acid'}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
        </div>
        <button className="btn-outline px-3" onClick={() => adj(-15)} aria-label="Fifteen seconds less">−15</button>
        <button className="btn-outline px-3" onClick={() => adj(15)} aria-label="Fifteen seconds more">+15</button>
        <button className="btn-ghost" onClick={() => writeRest(null)}>{left ? 'Skip' : 'Close'}</button>
      </div>
    </div>,
    document.body,
  );
}

function Session({ id }: { id: string }) {
  const db = useDB();
  const s = useSettings();
  const w = db.workouts.find((x) => x.id === id);
  const [adding, setAdding] = useState(false);
  const [editingPast, setEditingPast] = useState(false);
  const now = useNow(1000);
  if (!w) return <Empty title="Workout not found" body="It may have been deleted on another device." action={<button className="btn-outline" onClick={() => navigate('gym')}>Back to gym</button>} />;
  const exById = new Map(db.exercises.map((e) => [e.id, e]));
  const editable = w.status === 'in_progress' || (w.status === 'completed' && editingPast) || w.status === 'planned';
  const setEntries = (fn: (e: WorkoutEntry[]) => WorkoutEntry[]) => store.update('workouts', w.id, (x) => ({ entries: fn(x.entries) }));
  const allSets = w.entries.flatMap((e) => e.sets);
  const elapsed = w.started_at ? Math.max(0, Math.floor(((w.finished_at ? Date.parse(w.finished_at) : now) - Date.parse(w.started_at)) / 60000)) : 0;

  const finish = async () => {
    const open = allSets.filter((x) => !x.done).length;
    if (open && !(await confirmAction({ title: 'Finish workout?', body: `${open} set${open > 1 ? 's are' : ' is'} not ticked. They’ll be kept but left out of your stats.`, confirm: 'Finish' }))) return;
    store.update('workouts', w.id, { status: 'completed', finished_at: new Date().toISOString() });
    writeRest(null);
    store.toast('Workout saved. Good work.');
  };

  return (
    <div className="anim-fade pb-24">
      <button className="btn-ghost -ml-3 mb-6" onClick={() => navigate(w.status === 'completed' ? 'gym/history' : 'gym')}><Icon name="left" size={16} />Gym</button>
      <header className="mb-8">
        <p className="label mb-2 flex items-center gap-2">
          {w.status === 'in_progress' ? `In progress · ${elapsed} min` : w.status === 'completed' ? `Completed · ${elapsed} min` : 'Planned'}
          {w.planned_date && ` · ${fmtDate(w.planned_date, s.date_locale, { weekday: 'short', day: 'numeric', month: 'short' })}`}
          
        </p>
        <h1 className="text-[32px] md:text-[40px] tracking-[-0.03em] font-medium">{w.name}</h1>
        <div className="flex flex-wrap gap-2 mt-5">
          {w.status === 'planned' && <><button className="btn-primary" onClick={() => startWorkout(w)}><Icon name="play" size={16} />Start workout</button>
            <button className="btn-outline" onClick={() => openEditor({ type: 'workout', id: w.id })}>Reschedule</button></>}
          {w.status === 'in_progress' && <button className="btn-primary" onClick={finish}><Icon name="flag" size={16} />Finish workout</button>}
          {w.status === 'completed' && <button className="btn-outline" onClick={() => setEditingPast((v) => !v)}><Icon name="edit" size={16} />{editingPast ? 'Done editing' : 'Edit workout'}</button>}
          {w.status !== 'planned' && <button className="btn-ghost" onClick={() => openEditor({ type: 'workout', id: w.id })}>Details</button>}
        </div>
        {w.status === 'in_progress' && <p className="text-sm text-fg-3 mt-3">Every change saves as you go — you can leave this screen and resume later.</p>}
      </header>

      <div className="space-y-6">
        {w.entries.map((entry, ei) => (
          <EntryCard key={entry.id} w={w} entry={entry} ex={exById.get(entry.exercise_id)} index={ei} count={w.entries.length} editable={editable} live={w.status === 'in_progress'} setEntries={setEntries} />
        ))}
      </div>
      {editable && <button className="btn-outline w-full mt-6" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Add exercise</button>}
      {!w.entries.length && !editable && <Empty title="No exercises logged" />}

      <Field label="Workout notes" className="mt-10">
        <textarea className="input min-h-[80px]" defaultValue={w.notes} onBlur={(e) => e.target.value !== w.notes && store.update('workouts', w.id, { notes: e.target.value })} placeholder="How did it feel?" />
      </Field>

      <ExercisePicker open={adding} onClose={() => setAdding(false)} onPick={(ex) => {
        setEntries((es) => [...es, { id: uid(), exercise_id: ex.id, notes: '', rest_seconds: s.default_rest_seconds,
          sets: [{ id: uid(), type: 'working', reps: ex.kind === 'timed' ? null : 8, weight: null, seconds: ex.kind === 'timed' ? 30 : null, rpe: null, done: false, done_at: null }] }]);
        setAdding(false);
      }} />
      <RestTimer />
    </div>
  );
}

function EntryCard({ w, entry, ex, index, count, editable, live, setEntries }: {
  w: Workout; entry: WorkoutEntry; ex?: Exercise; index: number; count: number; editable: boolean; live: boolean; setEntries: (fn: (e: WorkoutEntry[]) => WorkoutEntry[]) => void;
}) {
  const db = useDB();
  const s = useSettings();
  const [open, setOpen] = useState<string | null>(null);
  const kind: ExerciseKind = ex?.kind ?? 'weighted';
  const prev = previousEntry(db, entry.exercise_id, w.id);
  const prevWorking = prev?.entry.sets.filter((x) => x.done) ?? [];
  const setSets = (fn: (s: WorkoutSet[]) => WorkoutSet[]) => setEntries((es) => es.map((e) => (e.id === entry.id ? { ...e, sets: fn(e.sets) } : e)));
  const patchSet = (sid: string, p: Partial<WorkoutSet>) => setSets((ss) => ss.map((x) => (x.id === sid ? { ...x, ...p } : x)));
  const moveEntry = (dir: -1 | 1) => setEntries((es) => { const a = [...es]; const j = index + dir; if (j < 0 || j >= a.length) return es; [a[index], a[j]] = [a[j], a[index]]; return a; });
  let workingN = 0;

  const tick = (st: WorkoutSet, i: number) => {
    if (st.done) return patchSet(st.id, { done: false, done_at: null });
    if (w.status === 'planned') startWorkout(w); // logging a set on a planned workout starts it
    const p = prevWorking[i];
    patchSet(st.id, {
      done: true, done_at: new Date().toISOString(),
      reps: st.reps ?? p?.reps ?? null, weight: st.weight ?? (kind === 'weighted' ? p?.weight ?? null : st.weight), seconds: st.seconds ?? p?.seconds ?? null,
    });
    if ((live || w.status === 'planned') && entry.rest_seconds > 0) writeRest({ ends_at: Date.now() + entry.rest_seconds * 1000, total: entry.rest_seconds, label: ex?.name ?? 'Exercise' });
  };

  return (
    <section className="surface" aria-label={ex?.name ?? 'Exercise'}>
      <div className="flex items-start gap-2 p-4 pb-2">
        <div className="flex-1 min-w-0">
          <p className="label">{String(index + 1).padStart(2, '0')} · {KIND_LABEL[kind]}</p>
          <h2 className="text-[19px] tracking-tight mt-0.5">{ex?.name ?? 'Deleted exercise'}</h2>
          <p className="meta text-fg-3 mt-1">
            {prev ? <>Last time ({fmtDate(workoutDate(prev.workout), s.date_locale, { day: 'numeric', month: 'short' })}): <span className="text-fg-2">{prevWorking.map((x) => describeSet(x, kind)).join(', ') || '—'}</span></> : 'First time logging this'}
          </p>
        </div>
        {editable && <div className="flex -mr-2">
          <button className="icon-btn" aria-label="Move exercise up" disabled={index === 0} onClick={() => moveEntry(-1)}><Icon name="up" size={18} className={index === 0 ? 'opacity-30' : ''} /></button>
          <button className="icon-btn" aria-label="Move exercise down" disabled={index === count - 1} onClick={() => moveEntry(1)}><Icon name="down" size={18} className={index === count - 1 ? 'opacity-30' : ''} /></button>
          <button className="icon-btn hover:text-bad" aria-label={`Remove ${ex?.name ?? 'exercise'}`} onClick={async () => {
            if (entry.sets.some((x) => x.done) && !(await confirmAction({ title: 'Remove exercise?', body: 'Its logged sets will be removed from this workout.', confirm: 'Remove', danger: true }))) return;
            setEntries((es) => es.filter((e) => e.id !== entry.id));
          }}><Icon name="trash" size={18} /></button>
        </div>}
      </div>

      <div className="px-2 md:px-4">
        <div className="grid grid-cols-[48px_1fr_1fr_56px_44px] md:grid-cols-[56px_1fr_1fr_72px_80px_44px] gap-2 px-2 pb-1 label">
          <span>Set</span>
          <span>{kind === 'timed' ? 'Seconds' : kind === 'bodyweight' ? '+kg' : 'kg'}</span>
          <span>{kind === 'timed' ? '' : 'Reps'}</span>
          <span className="hidden md:block">RPE</span>
          <span className="text-center">Done</span>
          <span />
        </div>
        {entry.sets.map((st, i) => {
          const isWarm = st.type === 'warmup';
          if (!isWarm) workingN++;
          const p = prevWorking[i];
          return (
            <div key={st.id} className={`border-t border-ink-700 ${st.done ? 'bg-acid/[0.04]' : ''}`}>
              <div className="grid grid-cols-[48px_1fr_1fr_56px_44px] md:grid-cols-[56px_1fr_1fr_72px_80px_44px] gap-2 items-center px-2 py-2">
                <button disabled={!editable} onClick={() => patchSet(st.id, { type: isWarm ? 'working' : 'warmup' })} aria-label={`Set ${i + 1}: ${isWarm ? 'warm-up' : 'working set'}. Tap to switch.`}
                  className={`h-11 rounded border font-mono text-sm ${isWarm ? 'border-warn/50 text-warn' : 'border-ink-600 text-fg-2'}`}>{isWarm ? 'W' : workingN}</button>
                {kind === 'timed' ? (
                  <input className="input text-center tabular-nums" type="number" inputMode="numeric" aria-label={`Set ${i + 1} seconds`} disabled={!editable}
                    placeholder={p?.seconds?.toString() ?? 's'} value={st.seconds ?? ''} onChange={(e) => patchSet(st.id, { seconds: num(e.target.value) })} />
                ) : (
                  <input className="input text-center tabular-nums" type="number" inputMode="decimal" step="0.5" aria-label={`Set ${i + 1} ${kind === 'bodyweight' ? 'added weight' : 'weight'} in kilograms`} disabled={!editable}
                    placeholder={kind === 'bodyweight' ? '0' : p?.weight?.toString() ?? 'kg'} value={st.weight ?? ''} onChange={(e) => patchSet(st.id, { weight: num(e.target.value) })} />
                )}
                {kind === 'timed' ? <span /> : (
                  <input className="input text-center tabular-nums" type="number" inputMode="numeric" aria-label={`Set ${i + 1} reps`} disabled={!editable}
                    placeholder={p?.reps?.toString() ?? 'reps'} value={st.reps ?? ''} onChange={(e) => patchSet(st.id, { reps: num(e.target.value) })} />
                )}
                <input className="input text-center hidden md:block" type="number" inputMode="decimal" step="0.5" min={1} max={10} aria-label={`Set ${i + 1} RPE`} disabled={!editable}
                  placeholder="—" value={st.rpe ?? ''} onChange={(e) => patchSet(st.id, { rpe: num(e.target.value) })} />
                <button disabled={!editable} onClick={() => tick(st, i)} aria-pressed={st.done} aria-label={`${st.done ? 'Untick' : 'Log'} set ${i + 1}`}
                  className={`h-11 rounded grid place-items-center border transition-colors ${st.done ? 'bg-acid border-acid text-acid-ink' : 'border-ink-500 text-fg-3 hover:text-fg hover:border-fg-3'}`}>
                  <Icon name="check" size={20} strokeWidth={2.2} />
                </button>
                <button className="icon-btn" aria-label={`More options for set ${i + 1}`} aria-expanded={open === st.id} onClick={() => setOpen(open === st.id ? null : st.id)} disabled={!editable}><Icon name="more" /></button>
              </div>
              {open === st.id && editable && (
                <div className="flex flex-wrap items-center gap-2 px-2 pb-3">
                  <label className="flex items-center gap-2 md:hidden"><span className="label">RPE</span>
                    <input className="input w-20 text-center" type="number" inputMode="decimal" step="0.5" value={st.rpe ?? ''} onChange={(e) => patchSet(st.id, { rpe: num(e.target.value) })} /></label>
                  <button className="btn-ghost" onClick={() => { setSets((ss) => { const a = [...ss]; a.splice(i + 1, 0, { ...st, id: uid(), done: false, done_at: null }); return a; }); setOpen(null); }}><Icon name="copy" size={16} />Duplicate</button>
                  <button className="btn-ghost hover:text-bad" onClick={() => {
                    const before = entry.sets; setSets((ss) => ss.filter((x) => x.id !== st.id)); setOpen(null);
                    store.toast('Set deleted', { label: 'Undo', run: () => setSets(() => before) });
                  }}><Icon name="trash" size={16} />Delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-2 p-3 pt-1 border-t border-ink-700">
          <button className="btn-ghost" onClick={() => setSets((ss) => { const last = ss[ss.length - 1]; return [...ss, { id: uid(), type: 'working', reps: last?.reps ?? null, weight: last?.weight ?? null, seconds: last?.seconds ?? null, rpe: null, done: false, done_at: null }]; })}>
            <Icon name="plus" size={16} />Add set</button>
          <label className="flex items-center gap-2 ml-auto"><span className="label">Rest</span>
            <input className="input w-20 text-center" type="number" inputMode="numeric" step={15} aria-label="Rest seconds" value={entry.rest_seconds}
              onChange={(e) => setEntries((es) => es.map((x) => (x.id === entry.id ? { ...x, rest_seconds: Number(e.target.value) || 0 } : x)))} /><span className="meta">s</span></label>
        </div>
      )}
    </section>
  );
}

function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const db = useDB();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ExerciseKind>('weighted');
  const list = db.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const builtIn = missingCatalog(db.exercises).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <input className="input mb-3" placeholder="Search or type a new exercise" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
      {q.trim() && !db.exercises.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && !EXERCISE_CATALOG.some((c) => catalogKey(c.name) === catalogKey(q)) && (
        <div className="surface p-3 mb-3 space-y-3">
          <Segmented label="Exercise type" value={kind} onChange={setKind} options={(['weighted', 'bodyweight', 'timed'] as ExerciseKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          <button className="btn-primary w-full" onClick={() => { const ex = store.insert('exercises', { name: q.trim(), kind, notes: '' }); setQ(''); onPick(ex); }}>Create “{q.trim()}”</button>
        </div>
      )}
      <ul>{list.map((e) => (
        <li key={e.id}><button className="row w-full text-left" onClick={() => { setQ(''); onPick(e); }}><span className="flex-1">{e.name}</span><span className="meta text-fg-3">{KIND_LABEL[e.kind]}</span></button></li>
      ))}</ul>
      {builtIn.length > 0 && (
        <>
          <p className="label mt-6 mb-1">Built-in library</p>
          <ul>{builtIn.map((c) => (
            <li key={c.name}><button className="row w-full text-left" onClick={() => { setQ(''); onPick(adoptExercise(c)); }}><span className="flex-1">{c.name}<span className="meta block text-fg-3">{c.group}</span></span><span className="meta text-fg-3">{KIND_LABEL[c.kind]}</span></button></li>
          ))}</ul>
        </>
      )}
    </Sheet>
  );
}

/* ---------------- Templates ---------------- */
function Templates() {
  const db = useDB();
  const s = useSettings();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const exName = (id: string) => db.exercises.find((e) => e.id === id)?.name ?? 'Deleted exercise';
  const [showArchived, setShowArchived] = useState(false);
  const active = db.workout_templates.filter((t) => !t.archived);
  const archived = db.workout_templates.filter((t) => t.archived);
  const archive = (t: WorkoutTemplate, on: boolean) => {
    store.update('workout_templates', t.id, { archived: on });
    store.toast(on ? `${t.name} archived` : `${t.name} restored`, { label: 'Undo', run: () => store.update('workout_templates', t.id, { archived: !on }) });
  };
  const remove = async (t: WorkoutTemplate) => {
    if (await confirmAction({ title: `Delete ${t.name}?`, body: 'Workouts already planned or logged from it are kept. To keep it for later, archive it instead.', confirm: 'Delete', danger: true })) store.remove('workout_templates', t.id, { undo: 'Template deleted' });
  };
  const TemplateRow = ({ t }: { t: WorkoutTemplate }) => (
    <li className={`row py-4 flex-wrap ${t.archived ? 'opacity-70' : ''}`}>
      <button className="flex-1 min-w-[200px] text-left" onClick={() => setEditing(t.id)}>
        <span className="flex items-center gap-2 text-[17px]">{t.name}</span>
        <span className="block text-sm text-fg-2 mt-0.5">{t.items.map((i) => exName(i.exercise_id)).join(' · ') || 'No exercises'}</span>
        {!t.archived && t.weekdays?.length > 0 && <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-acid mt-1">Repeats {weekdaysLabel(t.weekdays, s.date_locale)}{t.plan_time ? ` · ${fmtTime(t.plan_time, s.hour12)}` : ''}</span>}
      </button>
      {t.archived ? (<>
        <button className="btn-ghost hover:text-bad" onClick={() => remove(t)}><Icon name="trash" size={16} />Delete</button>
        <button className="btn-outline" onClick={() => archive(t, false)}>Restore</button>
      </>) : (<>
        <button className="btn-ghost" onClick={() => archive(t, true)}>Archive</button>
        <button className="btn-ghost" onClick={() => openEditor({ type: 'workout' })}>Plan</button>
        <button className="btn-primary" onClick={() => startNow(t.id, t.name)}><Icon name="play" size={16} />Start now</button>
      </>)}
    </li>
  );
  return (
    <div>
      <div className="flex justify-end mb-4"><button className="btn-outline" onClick={() => setEditing('new')}><Icon name="plus" size={16} />New template</button></div>
      {!db.workout_templates.length ? <Empty title="No templates yet" body="A template is a reusable list of exercises and target sets." /> : (
        <>
          {active.length === 0 ? <Empty title="No active templates" body="Restore one from Archived below, or make a new plan." /> : <ul className="border-t border-ink-700 stagger">{active.map((t) => <TemplateRow key={t.id} t={t} />)}</ul>}
          {archived.length > 0 && (
            <section className="mt-10">
              <button className="label flex items-center gap-2 min-h-[44px]" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
                Archived · {archived.length}<Icon name={showArchived ? 'up' : 'down'} size={14} /></button>
              {showArchived && <ul className="border-t border-ink-700 anim-fade">{archived.map((t) => <TemplateRow key={t.id} t={t} />)}</ul>}
              <p className="text-sm text-fg-3 mt-2">Archived templates stop repeating on your calendar. Past workouts stay in your history.</p>
            </section>
          )}
        </>
      )}
      {editing && <TemplateEditor tpl={editing === 'new' ? null : db.workout_templates.find((t) => t.id === editing) ?? null} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateEditor({ tpl, onClose }: { tpl: WorkoutTemplate | null; onClose: () => void }) {
  const db = useDB();
  const s = useSettings();
  const [d, setD] = useState(() => tpl ? structuredClone({ name: tpl.name, notes: tpl.notes, items: tpl.items, weekdays: tpl.weekdays ?? [], plan_time: tpl.plan_time ?? '' }) : { name: '', notes: '', items: [] as TemplateItem[], weekdays: [] as number[], plan_time: '' });
  const [picking, setPicking] = useState(false);
  const exById = new Map(db.exercises.map((e) => [e.id, e]));
  const setItem = (i: number, p: Partial<TemplateItem>) => setD((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));
  const move = (i: number, dir: -1 | 1) => setD((x) => { const a = [...x.items]; const j = i + dir; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, items: a }; });
  const save = () => {
    if (!d.name.trim()) return;
    const data = { ...d, name: d.name.trim(), plan_time: d.weekdays.length && d.plan_time ? d.plan_time : null };
    if (tpl) store.update('workout_templates', tpl.id, data); else store.insert('workout_templates', data);
    store.toast('Template saved'); onClose();
  };
  return (
    <Sheet open onClose={onClose} wide title={tpl ? 'Edit template' : 'New template'} footer={<>
      {tpl && <button className="btn-danger mr-auto" onClick={async () => { if (await confirmAction({ title: 'Delete template?', body: 'Workouts already planned or logged from it are kept.', confirm: 'Delete', danger: true })) { store.remove('workout_templates', tpl.id, { undo: 'Template deleted' }); onClose(); } }}><Icon name="trash" size={16} />Delete</button>}
      {tpl && <button className="btn-ghost" onClick={() => { store.update('workout_templates', tpl.id, { archived: !tpl.archived }); store.toast(tpl.archived ? 'Template restored' : 'Template archived'); onClose(); }}>{tpl.archived ? 'Restore' : 'Archive'}</button>}
      <button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!d.name.trim()} onClick={save}>Save template</button></>}>
      <div className="space-y-5">
        <Field label="Name"><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Upper A" /></Field>
        <Field label="Notes"><input className="input" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
        <div className="space-y-3">
          <span className="label block">Repeat on</span>
          <WeekdayPicker value={d.weekdays} onChange={(v) => setD({ ...d, weekdays: v })} locale={s.date_locale} weekStart={s.week_start} />
          {d.weekdays.length > 0 ? (
            <Field label="Time (optional)" hint="Leave blank if your time changes — it shows all-day on those days and you can still start it any time.">
              <div className="flex gap-2"><input type="time" className="input" value={d.plan_time} onChange={(e) => setD({ ...d, plan_time: e.target.value })} />
                {d.plan_time && <button className="btn-ghost" onClick={() => setD({ ...d, plan_time: '' })}>Clear</button>}</div>
            </Field>
          ) : <p className="text-sm text-fg-3">Pick days and this workout appears on your calendar and Today automatically each week.</p>}
        </div>
        <div>
          <span className="label block mb-2">Exercises</span>
          <ol className="space-y-2">
            {d.items.map((it, i) => {
              const ex = exById.get(it.exercise_id);
              return (
                <li key={it.id} className="surface p-3">
                  <div className="flex items-center gap-1">
                    <span className="flex-1 min-w-0 truncate">{ex?.name ?? 'Deleted exercise'} <span className="meta text-fg-3">· {KIND_LABEL[ex?.kind ?? 'weighted']}</span></span>
                    <button className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)}><Icon name="up" size={18} /></button>
                    <button className="icon-btn" aria-label="Move down" onClick={() => move(i, 1)}><Icon name="down" size={18} /></button>
                    <button className="icon-btn hover:text-bad" aria-label="Remove" onClick={() => setD((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}><Icon name="trash" size={18} /></button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <Field label="Sets"><input className="input text-center" type="number" inputMode="numeric" min={1} value={it.sets} onChange={(e) => setItem(i, { sets: Number(e.target.value) || 1 })} /></Field>
                    {ex?.kind === 'timed'
                      ? <Field label="Seconds"><input className="input text-center" type="number" inputMode="numeric" value={it.seconds ?? ''} onChange={(e) => setItem(i, { seconds: num(e.target.value) })} /></Field>
                      : <Field label="Reps"><input className="input text-center" type="number" inputMode="numeric" value={it.reps ?? ''} onChange={(e) => setItem(i, { reps: num(e.target.value) })} /></Field>}
                    {ex?.kind === 'weighted'
                      ? <Field label="kg"><input className="input text-center" type="number" inputMode="decimal" step="0.5" value={it.weight ?? ''} onChange={(e) => setItem(i, { weight: num(e.target.value) })} /></Field>
                      : <span />}
                    <Field label="Rest s"><input className="input text-center" type="number" inputMode="numeric" step={15} value={it.rest_seconds} onChange={(e) => setItem(i, { rest_seconds: Number(e.target.value) || 0 })} /></Field>
                  </div>
                </li>
              );
            })}
          </ol>
          <button className="btn-outline w-full mt-3" onClick={() => setPicking(true)}><Icon name="plus" size={16} />Add exercise</button>
        </div>
      </div>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={(ex) => {
        setD((x) => ({ ...x, items: [...x.items, { id: uid(), exercise_id: ex.id, sets: 3, reps: ex.kind === 'timed' ? null : 8, weight: null, seconds: ex.kind === 'timed' ? 30 : null, rest_seconds: s.default_rest_seconds }] }));
        setPicking(false);
      }} />
    </Sheet>
  );
}

/* ---------------- Exercise library ---------------- */
function Exercises() {
  const db = useDB();
  const [edit, setEdit] = useState<Exercise | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const builtIn = missingCatalog(db.exercises).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const [f, setF] = useState({ name: '', kind: 'weighted' as ExerciseKind, notes: '' });
  useEffect(() => { if (edit && edit !== 'new') setF({ name: edit.name, kind: edit.kind, notes: edit.notes }); else setF({ name: '', kind: 'weighted', notes: '' }); }, [edit]);
  const used = (id: string) => db.workouts.some((w) => w.entries.some((e) => e.exercise_id === id));
  const save = () => {
    if (!f.name.trim()) return;
    if (edit === 'new') store.insert('exercises', { ...f, name: f.name.trim() }); else if (edit) store.update('exercises', edit.id, { ...f, name: f.name.trim() });
    setEdit(null);
  };
  const groups: ExerciseKind[] = ['weighted', 'bodyweight', 'timed'];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input className="input max-w-xs" placeholder="Search exercises" aria-label="Search exercises" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-outline" onClick={() => setEdit('new')}><Icon name="plus" size={16} />Your own exercise</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-8">
        {groups.map((k) => (
          <section key={k}>
            <p className="label mb-2">{KIND_LABEL[k]}</p>
            <ul className="border-t border-ink-700">
              {db.exercises.filter((e) => e.kind === k && e.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                <li key={e.id}><button className="row w-full text-left hover:text-fg text-fg" onClick={() => setEdit(e)}>{e.name}</button></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {builtIn.length > 0 && (
        <section className="mt-12" aria-label="Built-in library">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
            <div><p className="label mb-1">Built-in library · {builtIn.length}</p><p className="text-sm text-fg-2">Ready-made exercises with setup cues. Tap Add to put one in your list — or just pick them when building a template.</p></div>
            <button className="btn-outline" onClick={() => { builtIn.forEach(adoptExercise); store.toast(`${builtIn.length} exercises added`); }}>Add all</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
            <ul className="border-t border-ink-700 md:col-span-2 md:columns-2 md:gap-x-10 [&>li]:break-inside-avoid">
              {builtIn.map((c) => (
                <li key={c.name} className="row">
                  <span className="flex-1 min-w-0"><span className="block truncate">{c.name}</span><span className="meta text-fg-3">{c.group} · {KIND_LABEL[c.kind]}</span></span>
                  <button className="btn-ghost" aria-label={`Add ${c.name}`} onClick={() => { adoptExercise(c); store.toast(`${c.name} added`); }}><Icon name="plus" size={16} />Add</button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'New exercise' : 'Edit exercise'} footer={<>
        {edit && edit !== 'new' && <button className="btn-danger mr-auto" onClick={async () => {
          if (await confirmAction({ title: 'Delete exercise?', body: used(edit.id) ? 'Logged sets stay in your history but will show as “Deleted exercise”.' : 'It will be removed from your library.', confirm: 'Delete', danger: true })) { store.remove('exercises', edit.id, { undo: 'Exercise deleted' }); setEdit(null); }
        }}><Icon name="trash" size={16} />Delete</button>}
        <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={!f.name.trim()} onClick={save}>Save</button></>}>
        <div className="space-y-5">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="space-y-2"><span className="label block">Type</span>
            <Segmented label="Type" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={groups.map((g) => ({ value: g, label: KIND_LABEL[g] }))} />
            <p className="text-sm text-fg-3">Weighted: kg × reps. Bodyweight: reps (+ optional added kg). Timed: seconds.</p>
          </div>
          <Field label="Notes (cues, setup)"><textarea className="input min-h-[72px]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
      </Sheet>
    </div>
  );
}

/* ---------------- History ---------------- */
function History() {
  const db = useDB();
  const s = useSettings();
  const done = db.workouts.filter((w) => w.status === 'completed').sort((a, b) => workoutDate(b).localeCompare(workoutDate(a)));
  if (!done.length) return <Empty title="No finished workouts yet" body="Finished sessions show up here and feed the progress charts." />;
  return (
    <div>
      <p className="meta text-fg-3 mb-3">Volume = kg × reps of ticked working sets on weighted exercises.</p>
      <ul className="stagger border-t border-ink-700">
        {done.map((w) => {
          const vol = w.entries.reduce((a, e) => a + (db.exercises.find((x) => x.id === e.exercise_id)?.kind === 'weighted' ? e.sets.reduce((b, st) => b + setVolume(st), 0) : 0), 0);
          const sets = w.entries.flatMap((e) => e.sets).filter((x) => x.done).length;
          return (
            <li key={w.id}>
              <button className="row w-full text-left py-3" onClick={() => navigate(`gym/session/${w.id}`)}>
                <span className="w-24 meta shrink-0">{fmtDate(workoutDate(w), s.date_locale, { day: 'numeric', month: 'short' })}</span>
                <span className="flex-1 min-w-0 truncate">{w.name} </span>
                <span className="meta text-right shrink-0">{sets} sets{vol ? <span className="block text-fg-3">{Math.round(vol).toLocaleString(s.date_locale)} kg vol.</span> : null}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- Progress ---------------- */
function ProgressView() {
  const db = useDB();
  const s = useSettings();
  const logged = db.exercises.filter((e) => db.workouts.some((w) => w.status === 'completed' && w.entries.some((x) => x.exercise_id === e.id && x.sets.some((st) => st.done))));
  const [exId, setExId] = useState(logged[0]?.id ?? '');
  const ex = db.exercises.find((e) => e.id === exId) ?? logged[0];
  const reps = ex ? repCountsFor(db, ex.id) : [];
  const metrics = !ex ? [] : ex.kind === 'weighted'
    ? [...reps.map((r) => ({ value: `best@${r}`, label: `Best weight for ${r}+ reps`, unit: 'kg' })), { value: 'volume', label: 'Session volume (kg × reps, working sets)', unit: 'kg' }]
    : ex.kind === 'bodyweight' ? [{ value: 'reps', label: 'Most reps in a set', unit: 'reps' }] : [{ value: 'seconds', label: 'Longest hold', unit: 's' }];
  const [metric, setMetric] = useState('');
  const m = metrics.find((x) => x.value === metric) ?? metrics.find((x) => x.value === 'volume') ?? metrics[0];
  const series = useMemo(() => (ex && m ? exerciseSeries(db, ex, m.value) : []), [db, ex, m]);
  if (!logged.length) return <Empty title="No data yet" body="Finish a workout and your progress appears here." />;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <Field label="Exercise"><select className="input" value={ex?.id} onChange={(e) => { setExId(e.target.value); setMetric(''); }}>{logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="Measure"><select className="input" value={m?.value} onChange={(e) => setMetric(e.target.value)}>{metrics.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
      </div>
      {m && (
        <section>
          <h2 className="h-section">{ex!.name} — {m.label}</h2>
          <p className="meta text-fg-3 mb-4">{series.length} session{series.length === 1 ? '' : 's'} · only ticked working sets · warm-ups excluded</p>
          {series.length ? <LineChart data={series} unit={m.unit} label={`${ex!.name} ${m.label}`} fmtX={(d) => fmtDate(d, s.date_locale, { day: 'numeric', month: 'short' })} />
            : <p className="text-fg-2">No sessions match this measure yet.</p>}
          {series.length > 0 && (
            <table className="mt-6 w-full max-w-md text-sm">
              <caption className="sr-only">Data table</caption>
              <thead><tr className="label text-left"><th className="py-2 font-normal">Date</th><th className="py-2 font-normal text-right">{m.unit}</th></tr></thead>
              <tbody>{[...series].reverse().map((p, i) => <tr key={i} className="border-t border-ink-700"><td className="py-2 meta">{fmtDate(p.date, s.date_locale)}</td><td className="py-2 text-right tabular-nums">{Math.round(p.value * 10) / 10}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}
      {ex?.kind === 'weighted' && reps.length > 0 && (
        <section>
          <p className="label mb-2">Personal bests by rep count</p>
          <ul className="border-t border-ink-700 max-w-md">
            {reps.map((r) => {
              const best = Math.max(0, ...exerciseSeries(db, ex, `best@${r}`).map((p) => p.value));
              return best ? <li key={r} className="row"><span className="flex-1 text-fg-2">{r}+ reps</span><span className="tabular-nums">{best} kg</span></li> : null;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
