import { useMemo, useState } from 'react';
import { store, useDB, useSettings } from '../lib/store';
import { addDays, fmtDate, fmtTime, nowParts, relativeDay } from '../lib/dates';
import { CATEGORY_META, calendarItems, goalProgress, nextAction, routineProgress, routineScheduledOn } from '../lib/domain';
import { CheckButton, Empty, Icon, Progress, SampleTag, SectionHead, confirmAction } from '../components/ui';
import { openEditor, toggleRoutineItem } from '../components/editors';
import { navigate } from '../lib/router';
import QuoteCard from '../components/QuoteCard';
import { startWorkout } from './Gym';

export default function Today() {
  const db = useDB();
  const s = useSettings();
  const { date: today, time: now, hour } = nowParts(s.timezone);
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const hasSamples = Object.values(db).some((rows: any[]) => rows.some((r) => r.is_sample));
  const [hideSampleNote, setHide] = useState(() => localStorage.getItem('ep.hideSampleNote') === '1');

  return (
    <div className="anim-fade">
      <header className="mb-10 md:mb-14">
        <p className="label mb-3">{fmtDate(today, s.date_locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="h-display">{greeting}, {s.display_name || 'there'}.</h1>
      </header>

      {hasSamples && !hideSampleNote && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-10 py-3 border-y border-ink-700">
          <p className="text-sm text-fg-2 flex-1">Some examples are loaded so you can see how things work. Your morning routine and exercise library stay either way.</p>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={async () => {
              if (await confirmAction({ title: 'Clear example data?', body: 'Removes the example goals, events, workouts and templates. Anything you created yourself stays.', confirm: 'Clear examples' })) {
                store.clearSamples(); store.toast('Examples cleared');
              }
            }}>Clear examples</button>
            <button className="btn-ghost" onClick={() => { localStorage.setItem('ep.hideSampleNote', '1'); setHide(true); }}>Keep</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-x-16 gap-y-12">
        <div className="space-y-12 min-w-0">
          <RoutinesToday today={today} />
          <Priorities today={today} />
          <NextActions />
        </div>
        <div className="space-y-12 min-w-0">
          <WorkoutToday today={today} />
          <UpNext today={today} now={now} />
          <QuoteCard today={today} />
        </div>
      </div>
    </div>
  );
}

function RoutinesToday({ today }: { today: string }) {
  const db = useDB();
  const s = useSettings();
  const routines = db.routines.filter((r) => routineScheduledOn(r, today)).sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
  if (!routines.length)
    return (
      <section aria-labelledby="rt">
        <SectionHead label="Routine" title="Nothing scheduled today" />
        <Empty title="No routines today" body="Rest days count too." action={<button className="btn-outline" onClick={() => navigate('routines')}>Manage routines</button>} />
      </section>
    );
  return (
    <>
      {routines.map((r) => {
        const p = routineProgress(db, r, today);
        const complete = p.total > 0 && p.current === p.total;
        return (
          <section key={r.id} aria-label={r.name}>
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <p className="label mb-1">{r.start_time ? `Routine · ${fmtTime(r.start_time, s.hour12)}` : 'Routine'}</p>
                <h2 className="h-section">{r.name}</h2>
              </div>
              <p className="meta">{p.current} / {p.total}</p>
            </div>
            <Progress ratio={p.total ? p.current / p.total : 0} label={`${r.name} progress`} />
            {complete && <p className="text-sm text-acid mt-3">All done. Nice start.</p>}
            <ul className="mt-2">
              {r.items.map((it) => {
                const done = p.done.has(it.id);
                return (
                  <li key={it.id} className="row">
                    <CheckButton checked={done} onClick={() => toggleRoutineItem(r.id, it.id, it.title, today)} label={it.title} />
                    <span className={`flex-1 min-w-0 transition-colors ${done ? 'text-fg-3 line-through decoration-ink-500' : ''}`}>
                      {it.title}
                      {it.notes && <span className="block text-sm text-fg-3 no-underline">{it.notes}</span>}
                    </span>
                    {it.minutes ? <span className="meta text-fg-3">{it.minutes}m</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function Priorities({ today }: { today: string }) {
  const db = useDB();
  const [text, setText] = useState('');
  const items = db.tasks.filter((t) => t.focus_date === today).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const yesterday = addDays(today, -1);
  const carry = db.tasks.filter((t) => t.focus_date === yesterday && !t.done);
  const room = 3 - items.length;
  const add = () => {
    if (!text.trim() || room <= 0) return;
    store.insert('tasks', { title: text.trim(), done: false, done_at: null, goal_id: null, due_date: null, focus_date: today, sort: 0 });
    setText('');
  };
  const goalName = (id: string | null) => (id ? db.goals.find((g) => g.id === id)?.title : null);
  return (
    <section aria-labelledby="pr">
      <SectionHead label="Focus" title="Today’s priorities" action={<span className="meta">{items.length} / 3</span>} />
      <ul>
        {items.map((t) => (
          <li key={t.id} className="row group">
            <CheckButton checked={t.done} onClick={() => store.update('tasks', t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() })} label={t.title} />
            <button className="flex-1 min-w-0 text-left min-h-[44px]" onClick={() => openEditor({ type: 'task', id: t.id })}>
              <span className={t.done ? 'text-fg-3 line-through decoration-ink-500' : ''}>{t.title}</span>
              {goalName(t.goal_id) && <span className="block font-mono text-[11px] text-fg-3 truncate">{goalName(t.goal_id)}</span>}
            </button>
            <button className="icon-btn" aria-label={`Remove “${t.title}” from today’s priorities`} onClick={() => {
              store.update('tasks', t.id, { focus_date: null });
              store.toast('Removed from today', { label: 'Undo', run: () => store.update('tasks', t.id, { focus_date: today }) });
            }}><Icon name="x" size={16} /></button>
          </li>
        ))}
      </ul>
      {room > 0 && (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2 mt-3">
          <label className="sr-only" htmlFor="prio">Add a priority</label>
          <input id="prio" className="input" placeholder={items.length ? 'Add another (optional)' : 'What matters most today?'} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-outline shrink-0" disabled={!text.trim()}>Add</button>
        </form>
      )}
      {carry.length > 0 && room > 0 && (
        <button className="btn-ghost -ml-3 mt-1 text-sm" onClick={() => carry.slice(0, room).forEach((t) => store.update('tasks', t.id, { focus_date: today }))}>
          Bring over {Math.min(room, carry.length)} unfinished from yesterday
        </button>
      )}
    </section>
  );
}

function NextActions() {
  const db = useDB();
  const order = { high: 0, medium: 1, low: 2 };
  const goals = db.goals.filter((g) => g.stage === 'active').sort((a, b) => order[a.priority] - order[b.priority] || (a.target_date ?? '9').localeCompare(b.target_date ?? '9'));
  return (
    <section aria-labelledby="na">
      <SectionHead label="Goals" title="Next actions" action={<button className="btn-ghost -mr-3 text-sm" onClick={() => navigate('goals')}>All goals</button>} />
      {!goals.length ? (
        <Empty title="No active goals" body="Pick one thing worth working toward." action={<button className="btn-outline" onClick={() => openEditor({ type: 'goal', stage: 'active' })}>Add a goal</button>} />
      ) : (
        <ul>
          {goals.map((g) => {
            const na = nextAction(db, g);
            const pr = goalProgress(db, g);
            return (
              <li key={g.id} className="row items-start py-3">
                {na ? (
                  <CheckButton checked={false} label={`Mark done: ${na.text}`} onClick={() => {
                    if (na.taskId) {
                      store.update('tasks', na.taskId, { done: true, done_at: new Date().toISOString() });
                      store.toast('Nice — next one’s up', { label: 'Undo', run: () => store.update('tasks', na.taskId!, { done: false, done_at: null }) });
                    } else {
                      const prev = g.next_action;
                      store.update('goals', g.id, (x) => ({ next_action: '', notes: [...x.notes, { id: crypto.randomUUID?.() ?? String(Date.now()), date: new Date().toISOString().slice(0, 10), text: `Done: ${prev}` }] }));
                      store.toast('Done. Set the next action when you’re ready', { label: 'Undo', run: () => store.update('goals', g.id, (x) => ({ next_action: prev, notes: x.notes.slice(0, -1) })) });
                    }
                  }} />
                ) : <span className="w-11 shrink-0" />}
                <button className="flex-1 min-w-0 text-left py-1.5" onClick={() => navigate(`goals/${g.id}`)}>
                  <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3 mb-0.5"><span className="truncate">{g.title}</span><SampleTag show={g.is_sample} /></span>
                  <span className="block">{na ? na.text : <span className="text-fg-2">Decide the next step</span>}</span>
                  <span className="block meta text-fg-3 mt-1">{pr.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function WorkoutToday({ today }: { today: string }) {
  const db = useDB();
  const s = useSettings();
  const active = db.workouts.find((w) => w.status === 'in_progress');
  const planned = db.workouts.filter((w) => w.planned_date === today && w.status !== 'in_progress').sort((a, b) => (a.planned_time ?? '').localeCompare(b.planned_time ?? ''));
  const list = [...(active ? [active] : []), ...planned];
  return (
    <section aria-labelledby="wk">
      <SectionHead label="Gym" title={active ? 'Workout in progress' : 'Today’s workout'} />
      {!list.length ? (
        <div className="flex items-center justify-between gap-3 py-3 border-y border-ink-700">
          <span className="text-fg-2">No workout planned.</span>
          <button className="btn-ghost -mr-3" onClick={() => openEditor({ type: 'workout', date: today })}>Plan one</button>
        </div>
      ) : list.map((w) => {
        const sets = w.entries.flatMap((e) => e.sets);
        return (
          <div key={w.id} className="surface p-4 mb-2 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[17px] flex items-center gap-2"><span className="truncate">{w.name}</span><SampleTag show={w.is_sample} /></p>
              <p className="meta mt-0.5">{w.entries.length} exercises · {w.status === 'completed' ? 'Completed' : w.status === 'in_progress' ? `${sets.filter((x) => x.done).length}/${sets.length} sets` : w.planned_time ? fmtTime(w.planned_time, s.hour12) : 'Any time'}</p>
            </div>
            {w.status === 'completed'
              ? <span className="chip text-acid border-acid/40"><Icon name="check" size={14} />Done</span>
              : <button className="btn-primary" onClick={() => (w.status === 'in_progress' ? navigate(`gym/session/${w.id}`) : startWorkout(w))}><Icon name="play" size={16} />{w.status === 'in_progress' ? 'Resume' : 'Start'}</button>}
          </div>
        );
      })}
    </section>
  );
}

function UpNext({ today, now }: { today: string; now: string }) {
  const db = useDB();
  const s = useSettings();
  const items = useMemo(() => calendarItems(db, today, addDays(today, 14), today)
    .filter((i) => i.kind === 'event' || i.kind === 'milestone' || i.kind === 'goal')
    .filter((i) => i.date > today || i.all_day || (i.end_time ?? i.start_time ?? '99') >= now)
    .slice(0, 5), [db, today, now]);
  return (
    <section aria-labelledby="up">
      <SectionHead label="Calendar" title="Coming up" action={<button className="btn-ghost -mr-3 text-sm" onClick={() => navigate('calendar')}>Calendar</button>} />
      {!items.length ? <p className="text-fg-2 py-3 border-y border-ink-700">Nothing in the next two weeks.</p> : (
        <ul>
          {items.map((i) => (
            <li key={i.key}>
              <button className="row w-full text-left" onClick={() => i.kind === 'event' ? openEditor({ type: 'event', id: i.refId, occurrenceDate: i.occ?.originalDate }) : i.kind === 'milestone' ? openEditor({ type: 'milestone', id: i.refId }) : navigate(`goals/${i.refId}`)}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CATEGORY_META[i.category].color }} />
                <span className="flex-1 min-w-0 truncate">{i.title}</span>
                <span className="meta shrink-0 text-right">{relativeDay(i.date, today, s.date_locale)}{i.start_time ? ` · ${fmtTime(i.start_time, s.hour12)}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
