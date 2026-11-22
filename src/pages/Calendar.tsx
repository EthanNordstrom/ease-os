import { useEffect, useMemo, useState } from 'react';
import { store, useDB, useSettings } from '../lib/store';
import { addDays, addMonths, fmtDate, fmtMonth, fmtTime, monthGrid, rangeDays, startOfWeek, todayISO, weekdayShort } from '../lib/dates';
import { CATEGORY_META, calendarItems, type CalItem } from '../lib/domain';
import type { Category, ISODate } from '../lib/types';
import { Icon, Segmented } from '../components/ui';
import { openEditor } from '../components/editors';
import { navigate } from '../lib/router';
import { tagHex } from '../lib/palette';
import { TagEditor, TagManager } from '../components/Tags';
import { setUi } from '../lib/prefs';
import { materialiseTemplate } from '../lib/workouts';

type View = 'month' | 'week' | 'agenda';
const useIsDesktop = () => {
  const q = '(min-width: 768px)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
};

export function openItem(i: CalItem) {
  if (i.kind === 'event') openEditor({ type: 'event', id: i.refId, occurrenceDate: i.occ?.recurring ? i.occ.originalDate : undefined });
  else if (i.kind === 'routine') openEditor({ type: 'routineDay', routineId: i.refId, date: i.date });
  else if (i.kind === 'workout') { if (i.virtual) { const w = materialiseTemplate(i.virtual.templateId, i.date); if (w) navigate(`gym/session/${w.id}`); } else navigate(`gym/session/${i.refId}`); }
  else if (i.kind === 'goal') navigate(`goals/${i.refId}`);
  else if (i.kind === 'bill' || i.kind === 'payday' || i.kind === 'saving') navigate('money');
  else openEditor({ type: 'milestone', id: i.refId });
}

// Drag-and-drop (desktop convenience) writes to the same underlying record as the edit forms.
function moveItem(i: CalItem, to: ISODate) {
  if (i.date === to) return;
  if (i.kind === 'event' && i.occ) {
    const e = i.occ.event;
    if (e.recurrence) store.update('events', e.id, (x) => ({ exceptions: { ...x.exceptions, [i.occ!.originalDate]: { ...(x.exceptions[i.occ!.originalDate] ?? {}), date: to } } }));
    else store.update('events', e.id, { date: to });
  } else if (i.kind === 'workout' && !i.virtual) store.update('workouts', i.refId, { planned_date: to });
  else if (i.kind === 'goal') store.update('goals', i.refId, { target_date: to });
  else if (i.kind === 'milestone') store.update('milestones', i.refId, { due_date: to });
  else return;
  store.toast(`Moved to ${to.split('-').reverse().join('/')}`);
}

export default function CalendarPage() {
  const db = useDB();
  const s = useSettings();
  const desktop = useIsDesktop();
  const today = todayISO(s.timezone);
  const [view, setView] = useState<View>(() => (matchMedia('(min-width: 768px)').matches ? 'month' : 'agenda'));
  const [anchor, setAnchor] = useState<ISODate>(today);
  const [selected, setSelected] = useState<ISODate>(today);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [newTag, setNewTag] = useState(false);
  // Calendar filters are saved to the account, so they match on every device.
  const hidden = s.ui?.calHidden ?? [];
  const setHidden = (fn: (h: string[]) => string[]) => setUi({ calHidden: fn(hidden) });

  const { from, to } = useMemo(() => {
    if (view === 'month') { const g = monthGrid(anchor, s.week_start); return { from: g[0], to: g[g.length - 1] }; }
    if (view === 'week') { const f = startOfWeek(anchor, s.week_start); return { from: f, to: addDays(f, 6) }; }
    return { from: anchor, to: addDays(anchor, 34) };
  }, [view, anchor, s.week_start]);
  const items = useMemo(() => calendarItems(db, from, to, today).filter((i) => !hidden.includes(i.filter)), [db, from, to, today, hidden]);
  const byDay = useMemo(() => { const m = new Map<ISODate, CalItem[]>(); items.forEach((i) => m.set(i.date, [...(m.get(i.date) ?? []), i])); return m; }, [items]);

  const step = (dir: -1 | 1) => setAnchor((a) => (view === 'month' ? addMonths(a, dir) : view === 'week' ? addDays(a, 7 * dir) : addDays(a, 14 * dir)));
  const title = view === 'month' ? fmtMonth(anchor, s.date_locale)
    : `${fmtDate(from, s.date_locale, { day: 'numeric', month: 'short' })} – ${fmtDate(to, s.date_locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="anim-fade">
      <header className="mb-6">
        <p className="label mb-3">Calendar</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] md:text-[36px] tracking-[-0.025em] font-medium">{title}</h1>
          <div className="flex items-center gap-1">
            <button className="icon-btn border border-ink-600" aria-label="Previous" onClick={() => step(-1)}><Icon name="left" size={18} /></button>
            <button className="btn-outline" onClick={() => { setAnchor(today); setSelected(today); }}>Today</button>
            <button className="icon-btn border border-ink-600" aria-label="Next" onClick={() => step(1)}><Icon name="right" size={18} /></button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <Segmented label="Calendar view" value={view} onChange={setView} options={[{ value: 'agenda', label: 'Agenda' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        <button className="btn-primary" onClick={() => openEditor({ type: 'event', date: view === 'agenda' ? today : selected })}><Icon name="plus" size={18} />Event</button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 mb-6" role="group" aria-label="Show categories">
        {[...(Object.keys(CATEGORY_META) as Category[]).map((c) => ({ key: c as string, label: CATEGORY_META[c].label, color: CATEGORY_META[c].color })),
          ...[...db.tags].sort((a, b) => a.sort - b.sort).map((t) => ({ key: `tag:${t.id}`, label: t.name, color: tagHex(t.color) }))].map((c) => {
          const on = !hidden.includes(c.key);
          return (
            <button key={c.key} aria-pressed={on} onClick={() => setHidden((h) => (on ? [...h, c.key] : h.filter((x) => x !== c.key)))}
              className={`shrink-0 h-10 px-3 rounded-full border text-sm flex items-center gap-2 transition-all duration-150 active:scale-95 ${on ? 'border-ink-500 text-fg' : 'border-ink-700 text-fg-3 line-through'}`}>
              <span className="w-2 h-2 rounded-full transition-colors" style={{ background: on ? c.color : 'transparent', border: `1px solid ${c.color}` }} />
              {c.label}
            </button>
          );
        })}
        <button onClick={() => setNewTag(true)} className="shrink-0 h-10 px-3 rounded-full border border-dashed border-ink-500 text-sm text-fg-2 hover:text-fg flex items-center gap-1.5 transition-colors"><Icon name="plus" size={14} />Tag</button>
        {db.tags.length > 0 && <button onClick={() => setTagsOpen(true)} className="shrink-0 icon-btn" aria-label="Manage tags"><Icon name="edit" size={16} /></button>}
      </div>
      {tagsOpen && <TagManager onClose={() => setTagsOpen(false)} />}
      {newTag && <TagEditor onClose={() => setNewTag(false)} />}

      <Legend />

      {view === 'month' && <MonthView anchor={anchor} byDay={byDay} today={today} selected={selected} setSelected={setSelected} desktop={desktop} />}
      {view === 'week' && <WeekView from={from} byDay={byDay} today={today} desktop={desktop} />}
      {view === 'agenda' && <Agenda days={rangeDays(from, to)} byDay={byDay} today={today} />}
    </div>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 mb-4 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-fg-3" />Scheduled</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-acid grid place-items-center" />Completed</span>
    </p>
  );
}

function ItemRow({ i, compact = false }: { i: CalItem; compact?: boolean }) {
  const s = useSettings();
  const color = i.color;
  const draggable = ['event', 'workout', 'goal', 'milestone'].includes(i.kind) && !i.virtual;
  return (
    <button onClick={(e) => { e.stopPropagation(); openItem(i); }} draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.key); (window as any).__dragItem = i; }}
      title={i.title}
      aria-label={`${i.title}${i.start_time ? ', ' + fmtTime(i.start_time, s.hour12) : ''}${i.completed ? ', completed' : ', scheduled'}${i.progress ? ', ' + i.progress : ''}`}
      className={`w-full flex items-center gap-2 text-left rounded transition-colors hover:bg-ink-800 ${compact ? 'px-1.5 py-0.5 text-[12px] min-h-[22px]' : 'px-2 py-2 min-h-[48px]'}`}>
      {i.completed
        ? <span className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} shrink-0 rounded-full grid place-items-center bg-acid text-acid-ink`}><Icon name="check" size={compact ? 9 : 11} strokeWidth={3} /></span>
        : <span className={`${compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} shrink-0 rounded-full border-[1.5px]`} style={{ borderColor: color }} />}
      {!compact && i.start_time && <span className="meta w-12 shrink-0">{fmtTime(i.start_time, s.hour12)}</span>}
      <span className={`flex-1 min-w-0 truncate ${i.completed ? 'text-fg-3' : ''}`}>{compact && i.start_time ? <span className="text-fg-3">{fmtTime(i.start_time, s.hour12)} </span> : null}{i.title}</span>
      {!compact && i.progress && <span className="meta text-fg-3 shrink-0">{i.progress}</span>}
      {!compact && <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3 shrink-0 hidden sm:inline">{i.completed ? 'Done' : i.kind === 'event' ? i.label : i.kind}</span>}
    </button>
  );
}

const dropProps = (date: ISODate) => ({
  onDragOver: (e: React.DragEvent) => e.preventDefault(),
  onDrop: (e: React.DragEvent) => { e.preventDefault(); const it = (window as any).__dragItem as CalItem | undefined; if (it) moveItem(it, date); (window as any).__dragItem = undefined; },
});

function MonthView({ anchor, byDay, today, selected, setSelected, desktop }: { anchor: ISODate; byDay: Map<ISODate, CalItem[]>; today: ISODate; selected: ISODate; setSelected: (d: ISODate) => void; desktop: boolean }) {
  const s = useSettings();
  const days = monthGrid(anchor, s.week_start);
  const month = anchor.slice(0, 7);
  const sel = byDay.get(selected) ?? [];
  return (
    <div>
      <div className="grid grid-cols-7 border-t border-l border-ink-700" aria-label={fmtMonth(anchor, s.date_locale)}>
        {Array.from({ length: 7 }, (_, i) => (i + s.week_start) % 7).map((wd) => (
          <div key={wd} aria-hidden className="border-r border-b border-ink-700 py-2 text-center label">{weekdayShort(wd, s.date_locale).slice(0, desktop ? 3 : 1)}</div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const out = d.slice(0, 7) !== month;
          const isSel = d === selected;
          return (
            <div key={d} {...(desktop ? dropProps(d) : {})}
              className={`border-r border-b border-ink-700 ${desktop ? 'min-h-[118px]' : 'min-h-[56px]'} ${out ? 'bg-ink-950' : 'bg-ink-900/40'} ${isSel ? 'outline outline-1 outline-fg-3 -outline-offset-1' : ''}`}>
              <button onClick={() => setSelected(d)} aria-pressed={isSel} aria-label={`${fmtDate(d, s.date_locale, { weekday: 'long', day: 'numeric', month: 'long' })}, ${list.length} items`}
                className="w-full min-h-[44px] flex flex-col items-start p-1.5 text-left">
                <span className={`font-mono text-xs w-6 h-6 grid place-items-center rounded-full ${d === today ? 'bg-acid text-acid-ink' : out ? 'text-fg-3' : 'text-fg-2'}`}>{Number(d.slice(8))}</span>
                {!desktop && list.length > 0 && (
                  <span className="flex flex-wrap gap-0.5 mt-1 px-0.5">{list.slice(0, 4).map((i) => <span key={i.key} className={`w-1.5 h-1.5 rounded-full ${i.completed ? 'bg-acid' : ''}`} style={i.completed ? {} : { border: `1px solid ${i.color}` }} />)}</span>
                )}
              </button>
              {desktop && (
                <div className="px-1 pb-1 space-y-0.5 -mt-1">
                  {list.slice(0, 3).map((i) => <ItemRow key={i.key} i={i} compact />)}
                  {list.length > 3 && <button className="px-1.5 text-[11px] font-mono text-fg-3 hover:text-fg" onClick={() => setSelected(d)}>+{list.length - 3} more</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <section className="mt-8" aria-live="polite">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="h-section">{fmtDate(selected, s.date_locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <button className="btn-ghost -mr-3" onClick={() => openEditor({ type: 'event', date: selected })}><Icon name="plus" size={16} />Add</button>
        </div>
        {sel.length ? <div className="border-t border-ink-700">{sel.map((i) => <div key={i.key} className="border-b border-ink-700"><ItemRow i={i} /></div>)}</div>
          : <p className="text-fg-2 py-3 border-t border-ink-700">Nothing scheduled.</p>}
      </section>
    </div>
  );
}

function WeekView({ from, byDay, today, desktop }: { from: ISODate; byDay: Map<ISODate, CalItem[]>; today: ISODate; desktop: boolean }) {
  const s = useSettings();
  const days = rangeDays(from, addDays(from, 6));
  if (!desktop) return <Agenda days={days} byDay={byDay} today={today} showEmpty />;
  return (
    <div className="grid grid-cols-7 border-t border-l border-ink-700">
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <div key={d} className="border-r border-b border-ink-700 min-h-[420px] flex flex-col" {...dropProps(d)}>
            <button onClick={() => openEditor({ type: 'event', date: d })} className="text-left px-3 py-3 border-b border-ink-700 hover:bg-ink-900 transition-colors" aria-label={`Add event on ${d}`}>
              <span className="label block">{weekdayShort(Number(new Date(d + 'T00:00:00Z').getUTCDay()), s.date_locale)}</span>
              <span className={`text-2xl tracking-tight ${d === today ? 'text-acid' : ''}`}>{Number(d.slice(8))}</span>
            </button>
            <div className="p-1 space-y-0.5 flex-1">
              {list.map((i) => <ItemRow key={i.key} i={i} compact />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Agenda({ days, byDay, today, showEmpty = false }: { days: ISODate[]; byDay: Map<ISODate, CalItem[]>; today: ISODate; showEmpty?: boolean }) {
  const s = useSettings();
  const shown = days.filter((d) => showEmpty || (byDay.get(d)?.length ?? 0) > 0 || d === today);
  if (!shown.length) return <p className="text-fg-2 py-6 border-t border-ink-700">Nothing scheduled in this period.</p>;
  return (
    <div className="stagger space-y-8">
      {shown.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <section key={d} aria-label={fmtDate(d, s.date_locale, { weekday: 'long', day: 'numeric', month: 'long' })}>
            <div className="flex items-baseline gap-3 pb-2 border-b border-ink-700">
              <span className={`text-[22px] tracking-tight w-9 ${d === today ? 'text-acid' : ''}`}>{Number(d.slice(8))}</span>
              <span className="label">{fmtDate(d, s.date_locale, { weekday: 'long', month: 'short' })}{d === today ? ' · Today' : ''}</span>
              <button className="ml-auto icon-btn -mr-2" aria-label={`Add event on ${d}`} onClick={() => openEditor({ type: 'event', date: d })}><Icon name="plus" size={16} /></button>
            </div>
            {list.length ? list.map((i) => <div key={i.key} className="border-b border-ink-700/60"><ItemRow i={i} /></div>)
              : <p className="text-sm text-fg-3 py-3">Nothing scheduled.</p>}
          </section>
        );
      })}
    </div>
  );
}
