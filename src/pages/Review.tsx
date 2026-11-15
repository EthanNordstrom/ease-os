import { useEffect, useState } from 'react';
import { store, useDB, useSettings } from '../lib/store';
import { addDays, fmtDate, rangeDays, startOfWeek, todayISO } from '../lib/dates';
import { routineProgress, routineScheduledOn, workoutDate } from '../lib/domain';
import { Field, Icon } from '../components/ui';

export default function Review() {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const [week, setWeek] = useState(() => startOfWeek(today, s.week_start));
  const end = addDays(week, 6);
  const days = rangeDays(week, end);
  const existing = db.reviews.find((r) => r.week_start === week);
  const blank = { went_well: '', got_in_way: '', change_next: '', priorities: ['', '', ''] };
  const [f, setF] = useState(blank);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setF(existing ? { went_well: existing.went_well, got_in_way: existing.got_in_way, change_next: existing.change_next, priorities: [...existing.priorities, '', '', ''].slice(0, 3) } : blank);
    setDirty(false);
  }, [week, existing?.version]);
  const set = (p: Partial<typeof f>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };

  // Modest summary — counts only, no scores.
  let stepsDone = 0, stepsPlanned = 0, fullDays = 0;
  db.routines.forEach((r) => days.filter((d) => d <= today && routineScheduledOn(r, d)).forEach((d) => {
    const p = routineProgress(db, r, d); stepsDone += p.current; stepsPlanned += p.total; if (p.total && p.current === p.total) fullDays++;
  }));
  const workouts = db.workouts.filter((w) => w.status === 'completed' && workoutDate(w) >= week && workoutDate(w) <= end).length;
  const inRange = (iso: string | null) => !!iso && iso.slice(0, 10) >= week && iso.slice(0, 10) <= end;
  const milestones = db.milestones.filter((m) => m.done && inRange(m.done_at)).length;
  const tasks = db.tasks.filter((t) => t.done && inRange(t.done_at)).length;

  const save = () => {
    const data = { ...f, priorities: f.priorities.map((p) => p.trim()) };
    if (existing) store.update('reviews', existing.id, data); else store.insert('reviews', { week_start: week, ...data });
    setDirty(false); store.toast('Review saved');
  };
  const past = [...db.reviews].sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 8);

  return (
    <div className="anim-fade max-w-3xl mx-auto">
      <header className="mb-8">
        <p className="label mb-3">Weekly review</p>
        <h1 className="h-display">Look back, then set up next week.</h1>
      </header>
      <div className="flex items-center gap-1 mb-8">
        <button className="icon-btn border border-ink-600" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><Icon name="left" size={18} /></button>
        <p className="px-3 meta text-fg">{fmtDate(week, s.date_locale, { day: 'numeric', month: 'short' })} – {fmtDate(end, s.date_locale, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        <button className="icon-btn border border-ink-600" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><Icon name="right" size={18} /></button>
        {week !== startOfWeek(today, s.week_start) && <button className="btn-ghost" onClick={() => setWeek(startOfWeek(today, s.week_start))}>This week</button>}
      </div>

      <section aria-label="This week in numbers" className="grid grid-cols-2 sm:grid-cols-4 border-y border-ink-700 mb-12">
        {[
          [`${stepsDone}`, `routine steps${stepsPlanned ? ` of ${stepsPlanned}` : ''}`],
          [`${fullDays}`, 'full routine days'],
          [`${workouts}`, workouts === 1 ? 'workout' : 'workouts'],
          [`${milestones + tasks}`, 'goal steps done'],
        ].map(([n, l], i) => (
          <div key={i} className={`py-5 ${i % 2 ? 'pl-5 border-l border-ink-700' : 'sm:pl-0'} ${i >= 2 ? 'border-t sm:border-t-0 border-ink-700' : ''} ${i === 2 ? 'sm:pl-5 sm:border-l' : ''}`}>
            <p className="text-3xl tracking-tight tabular-nums">{n}</p>
            <p className="meta text-fg-3 mt-1">{l}</p>
          </div>
        ))}
      </section>

      <div className="space-y-6">
        <Field label="What went well?"><textarea className="input min-h-[96px]" value={f.went_well} onChange={(e) => set({ went_well: e.target.value })} /></Field>
        <Field label="What got in the way?"><textarea className="input min-h-[96px]" value={f.got_in_way} onChange={(e) => set({ got_in_way: e.target.value })} /></Field>
        <Field label="What will I change next week?"><textarea className="input min-h-[96px]" value={f.change_next} onChange={(e) => set({ change_next: e.target.value })} /></Field>
        <fieldset>
          <legend className="label mb-2">Three priorities for next week</legend>
          <div className="space-y-2">
            {f.priorities.map((p, i) => (
              <div key={i} className="flex items-center gap-3"><span className="meta w-5">{i + 1}</span>
                <input className="input" aria-label={`Priority ${i + 1}`} value={p} onChange={(e) => set({ priorities: f.priorities.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={save} disabled={!dirty}>{existing ? 'Save changes' : 'Save review'}</button>
          {dirty && <button className="btn-ghost" onClick={() => { setWeek((w) => w); setF(existing ? { ...existing, priorities: [...existing.priorities, '', '', ''].slice(0, 3) } : blank); setDirty(false); }}>Cancel</button>}
        </div>
      </div>

      {past.length > 0 && (
        <section className="mt-16">
          <p className="label mb-2">Past reviews</p>
          <ul className="border-t border-ink-700">
            {past.map((r) => (
              <li key={r.id}><button className="row w-full text-left" onClick={() => setWeek(r.week_start)}>
                <span className="meta w-28 shrink-0">{fmtDate(r.week_start, s.date_locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="flex-1 min-w-0 truncate text-fg-2">{r.priorities.filter(Boolean).join(' · ') || r.went_well || '—'}</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
