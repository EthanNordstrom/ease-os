import { useState } from 'react';
import { store, uid, useDB, useSettings } from '../lib/store';
import { addDays, fmtDate, fmtTime, rangeDays, todayISO, weekdaysLabel } from '../lib/dates';
import { routineProgress, routineScheduledOn } from '../lib/domain';
import type { Routine, RoutineItem } from '../lib/types';
import { Empty, Field, Icon, Sheet, Toggle, WeekdayPicker, confirmAction } from '../components/ui';
import { openEditor } from '../components/editors';
import { navigate } from '../lib/router';

export default function Routines({ startNew = false }: { startNew?: boolean }) {
  const db = useDB();
  const [editing, setEditing] = useState<string | 'new' | null>(startNew ? 'new' : null);
  const routines = [...db.routines].sort((a, b) => Number(b.active) - Number(a.active) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
  return (
    <div className="anim-fade">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <p className="label mb-3">Routines</p>
          <h1 className="h-display">Small things, most days.</h1>
          <p className="text-fg-2 mt-3 max-w-xl">Today shows the routine that fits the time: each one from its start time for about 5½ hours, otherwise the next one coming up. Your other routines sit just below it.</p>
        </div>
        <button className="btn-outline" onClick={() => setEditing('new')}><Icon name="plus" size={18} />New routine</button>
      </header>
      {!routines.length && <Empty title="No routines yet" body="Start with a morning or evening routine." action={<button className="btn-primary" onClick={() => setEditing('new')}>Create a routine</button>} />}
      <div className="space-y-14">
        {routines.map((r) => <RoutineBlock key={r.id} r={r} onEdit={() => setEditing(r.id)} />)}
      </div>
      {editing && <RoutineEditor routine={editing === 'new' ? null : db.routines.find((r) => r.id === editing) ?? null} onClose={() => { setEditing(null); if (startNew) navigate('routines'); }} />}
    </div>
  );
}

function RoutineBlock({ r, onEdit }: { r: Routine; onEdit: () => void }) {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const [page, setPage] = useState(0);
  const end = addDays(today, -page * 14);
  const days = rangeDays(addDays(end, -13), end);
  const scheduled = days.filter((d) => routineScheduledOn(r, d) || db.routine_completions.some((c) => c.routine_id === r.id && c.date === d));
  const stats = scheduled.map((d) => routineProgress(db, r, d)).map((p) => {
    const hist = p.current; return { full: p.total > 0 && hist >= p.total, any: hist > 0 };
  });
  const full = stats.filter((x) => x.full).length;
  const partly = stats.filter((x) => x.any && !x.full).length;
  const totalMin = r.items.reduce((a, i) => a + (i.minutes ?? 0), 0);

  return (
    <section aria-label={r.name} className={r.active ? '' : 'opacity-70'}>
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-ink-700">
        <div className="min-w-0">
          <h2 className="text-2xl tracking-tight">{r.name}</h2>
          <p className="meta mt-1">
            {weekdaysLabel(r.weekdays, s.date_locale)}{r.start_time ? ` · ${fmtTime(r.start_time, s.hour12)}` : ''} · {r.items.length} steps{totalMin ? ` · ~${totalMin} min` : ''}{!r.active ? ' · Paused' : ''}{r.show_on_calendar === false ? ' · Not on calendar' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Toggle checked={r.active} onChange={(v) => store.update('routines', r.id, { active: v })} label={r.active ? 'Active' : 'Inactive'} />
          <button className="btn-ghost" onClick={onEdit}><Icon name="edit" size={16} />Edit</button>
        </div>
      </div>
      <ol className="stagger mt-2">
        {r.items.map((it, i) => (
          <li key={it.id} className="row">
            <span className="w-8 meta text-fg-3">{String(i + 1).padStart(2, '0')}</span>
            <span className="flex-1 min-w-0">{it.title}{it.notes && <span className="block text-sm text-fg-3">{it.notes}</span>}</span>
            {it.minutes ? <span className="meta text-fg-3">{it.minutes}m</span> : null}
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="label">History · {fmtDate(days[0], s.date_locale, { day: 'numeric', month: 'short' })} – {fmtDate(end, s.date_locale, { day: 'numeric', month: 'short' })}</p>
          <div className="flex">
            <button className="icon-btn" aria-label="Earlier fortnight" onClick={() => setPage((p) => p + 1)}><Icon name="left" size={18} /></button>
            <button className="icon-btn" aria-label="Later fortnight" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><Icon name="right" size={18} className={page === 0 ? 'opacity-30' : ''} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 max-w-md">
          {days.map((d) => {
            const sched = routineScheduledOn(r, d);
            const p = routineProgress(db, r, d);
            const ratio = p.total ? p.current / p.total : 0;
            return (
              <button key={d} onClick={() => openEditor({ type: 'routineDay', routineId: r.id, date: d })} disabled={d > today}
                aria-label={`${fmtDate(d, s.date_locale, { weekday: 'long', day: 'numeric', month: 'long' })}: ${p.current} of ${p.total} done`}
                className={`relative aspect-square min-h-[44px] rounded border text-[11px] font-mono flex flex-col items-center justify-center transition-colors
                  ${d === today ? 'border-fg-3' : 'border-ink-700'} ${sched || p.current ? 'hover:border-fg-3' : 'border-dashed'} disabled:opacity-40`}>
                <span className="absolute inset-x-1 bottom-1 h-1 rounded-full bg-ink-700 overflow-hidden"><span className="block h-full bg-acid" style={{ width: `${ratio * 100}%` }} /></span>
                <span className={sched || p.current ? 'text-fg' : 'text-fg-3'}>{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-fg-2 mt-3">
          {scheduled.length === 0 ? 'Nothing scheduled in this period.' :
            full + partly === 0 ? 'A fresh start — tap any day to tick off what you did.' :
            `Fully done on ${full} day${full === 1 ? '' : 's'}${partly ? `, partly on ${partly}` : ''}. Every bit counts.`}
        </p>
      </div>
    </section>
  );
}

function RoutineEditor({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
  const s = useSettings();
  const [d, setD] = useState(() => routine ? structuredClone({ name: routine.name, items: routine.items, weekdays: routine.weekdays, start_time: routine.start_time ?? '', active: routine.active, show_on_calendar: routine.show_on_calendar !== false })
    : { name: '', items: [] as RoutineItem[], weekdays: [0, 1, 2, 3, 4, 5, 6], start_time: '', active: true, show_on_calendar: true });
  const [newItem, setNewItem] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const setItem = (i: number, p: Partial<RoutineItem>) => setD((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...p } : it)) }));
  const move = (i: number, dir: -1 | 1) => setD((x) => {
    const items = [...x.items]; const j = i + dir;
    if (j < 0 || j >= items.length) return x;
    [items[i], items[j]] = [items[j], items[i]];
    return { ...x, items };
  });
  const addItem = () => { if (!newItem.trim()) return; setD((x) => ({ ...x, items: [...x.items, { id: uid(), title: newItem.trim(), notes: '', minutes: null }] })); setNewItem(''); };
  const valid = d.name.trim() && d.items.every((i) => i.title.trim());

  const save = () => {
    if (!valid) return;
    const data = { name: d.name.trim(), items: d.items.map((i) => ({ ...i, title: i.title.trim() })), weekdays: d.weekdays, start_time: d.start_time || null, active: d.active, show_on_calendar: d.show_on_calendar };
    if (routine) store.update('routines', routine.id, data);
    else store.insert('routines', { ...data, sort: store.state.db.routines.length });
    store.toast('Routine saved');
    onClose();
  };
  const del = async () => {
    if (!routine) return;
    if (await confirmAction({ title: `Delete “${routine.name}”?`, body: 'This also removes its completion history. To keep the history, switch it to inactive instead.', confirm: 'Delete routine', danger: true })) {
      store.remove('routines', routine.id, { undo: 'Routine deleted' });
      onClose();
    }
  };

  return (
    <Sheet open onClose={onClose} wide title={routine ? 'Edit routine' : 'New routine'}
      footer={<>
        {routine && <button className="btn-danger mr-auto" onClick={del}><Icon name="trash" size={18} />Delete</button>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!valid} onClick={save}>Save routine</button>
      </>}>
      <div className="space-y-6">
        <Field label="Name"><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Evening routine" /></Field>
        <div className="space-y-2">
          <span className="label block">Days</span>
          <WeekdayPicker value={d.weekdays} onChange={(v) => setD({ ...d, weekdays: v })} locale={s.date_locale} weekStart={s.week_start} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <Field label="Start time (optional)"><input type="time" className="input" value={d.start_time} onChange={(e) => setD({ ...d, start_time: e.target.value })} /></Field>
          <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="Active" />
        </div>
        <div>
          <Toggle checked={d.show_on_calendar} onChange={(v) => setD({ ...d, show_on_calendar: v })} label="Show on calendar" />
          <p className="text-sm text-fg-3">Turn off to keep this routine off your calendar. It still appears on Today.</p>
        </div>

        <div>
          <span className="label block mb-2">Steps</span>
          {routine && <p className="text-sm text-fg-3 mb-3">Renaming, reordering or removing steps keeps your past check-offs.</p>}
          <ol className="space-y-2">
            {d.items.map((it, i) => (
              <li key={it.id} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIdx === null || dragIdx === i) return; setD((x) => { const items = [...x.items]; const [m] = items.splice(dragIdx, 1); items.splice(i, 0, m); return { ...x, items }; }); setDragIdx(null); }}
                className="surface p-3">
                <div className="flex items-center gap-2">
                  <span className="hidden md:grid place-items-center w-6 text-fg-3 cursor-grab" aria-hidden><Icon name="drag" size={16} /></span>
                  <label className="sr-only" htmlFor={`it-${it.id}`}>Step {i + 1}</label>
                  <input id={`it-${it.id}`} className="input flex-1" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                  <button className="icon-btn" aria-label={`Move “${it.title}” up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={18} className={i === 0 ? 'opacity-30' : ''} /></button>
                  <button className="icon-btn" aria-label={`Move “${it.title}” down`} disabled={i === d.items.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={18} className={i === d.items.length - 1 ? 'opacity-30' : ''} /></button>
                  <button className="icon-btn hover:text-bad" aria-label={`Remove “${it.title}”`} onClick={() => setD((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}><Icon name="trash" size={18} /></button>
                </div>
                <div className="grid grid-cols-[1fr_96px] gap-2 mt-2 md:pl-8">
                  <input className="input text-sm" aria-label={`Notes for ${it.title}`} placeholder="Notes (optional)" value={it.notes ?? ''} onChange={(e) => setItem(i, { notes: e.target.value })} />
                  <input className="input text-sm" type="number" inputMode="numeric" min={0} aria-label={`Minutes for ${it.title}`} placeholder="min" value={it.minutes ?? ''} onChange={(e) => setItem(i, { minutes: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </li>
            ))}
          </ol>
          <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); addItem(); }}>
            <label className="sr-only" htmlFor="newstep">New step</label>
            <input id="newstep" className="input" placeholder="Add a step" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <button className="btn-outline shrink-0" disabled={!newItem.trim()}>Add</button>
          </form>
        </div>
      </div>
    </Sheet>
  );
}
