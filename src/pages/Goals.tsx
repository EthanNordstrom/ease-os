import { useEffect, useState } from 'react';
import { store, uid, useDB, useSettings } from '../lib/store';
import { addDays, addMonths, diffDays, fmtDate, rangeDays, startOfMonth, todayISO } from '../lib/dates';
import { GOAL_CATEGORIES, GOAL_COLORS, goalProgress, nextAction } from '../lib/domain';
import type { Goal } from '../lib/types';
import { CheckButton, Empty, Icon, Progress, SectionHead, Segmented, confirmAction } from '../components/ui';
import { openEditor } from '../components/editors';
import { navigate } from '../lib/router';

type Tab = 'active' | 'ideas' | 'done';

export default function Goals({ id }: { id?: string }) {
  if (id) return <GoalDetail id={id} />;
  return <GoalsList />;
}

function useIsDesktop() {
  const [m, setM] = useState(() => matchMedia('(min-width: 900px)').matches);
  useEffect(() => { const mq = matchMedia('(min-width: 900px)'); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
}

function GoalsList() {
  const db = useDB();
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('ep.goalTab') as Tab) || 'active');
  const [view, setView] = useState<'list' | 'timeline'>('list');
  useEffect(() => sessionStorage.setItem('ep.goalTab', tab), [tab]);
  const active = db.goals.filter((g) => g.stage === 'active' || g.stage === 'paused');
  const ideas = db.goals.filter((g) => g.stage === 'idea');
  const done = db.goals.filter((g) => g.stage === 'completed' || g.stage === 'archived');

  return (
    <div className="anim-fade">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="label mb-3">Goals</p>
          <h1 className="h-display">What I’m building toward.</h1>
        </div>
        <button className="btn-primary" onClick={() => openEditor({ type: 'goal', stage: tab === 'ideas' ? 'idea' : 'active' })}><Icon name="plus" size={18} />{tab === 'ideas' ? 'Idea' : 'Goal'}</button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <Segmented label="Goal list" value={tab} onChange={setTab} options={[
          { value: 'active', label: `Active ${active.length}` }, { value: 'ideas', label: `Ideas ${ideas.length}` }, { value: 'done', label: `Done ${done.length}` }]} />
        {tab === 'active' && <Segmented label="Layout" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'timeline', label: 'Timeline' }]} />}
      </div>

      {tab === 'active' && (view === 'list' ? <GoalRows goals={active} /> : <Timeline goals={active} />)}
      {tab === 'ideas' && <Ideas ideas={ideas} />}
      {tab === 'done' && (done.length ? <GoalRows goals={done} /> : <Empty title="Nothing here yet" body="Completed and archived goals will collect here." />)}
    </div>
  );
}

function GoalRows({ goals }: { goals: Goal[] }) {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  if (!goals.length) return <Empty title="No active goals" body="Promote an idea, or start something new." action={<button className="btn-outline" onClick={() => openEditor({ type: 'goal', stage: 'active' })}>Add a goal</button>} />;
  const order = { high: 0, medium: 1, low: 2 };
  return (
    <ul className="stagger border-t border-ink-700">
      {[...goals].sort((a, b) => order[a.priority] - order[b.priority] || (a.target_date ?? '9').localeCompare(b.target_date ?? '9')).map((g) => {
        const p = goalProgress(db, g);
        const na = nextAction(db, g);
        const days = g.target_date ? diffDays(g.target_date, today) : null;
        return (
          <li key={g.id} className="border-b border-ink-700">
            <button onClick={() => navigate(`goals/${g.id}`)} className="w-full text-left grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_160px] gap-x-8 gap-y-3 py-5 hover:bg-ink-900/60 -mx-3 px-3 rounded transition-colors">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GOAL_COLORS[g.category] }} />{GOAL_CATEGORIES[g.category]}<span>·</span>{g.priority}{g.stage !== 'active' && <><span>·</span>{g.stage}</>}
                </p>
                <p className="text-[19px] tracking-tight">{g.title}</p>
                {na && g.stage === 'active' && <p className="text-sm text-fg-2 mt-1 truncate">Next: {na.text}</p>}
              </div>
              <div className="self-center">
                <p className="meta mb-2">{p.label}</p>
                {p.ratio !== null && <Progress color={GOAL_COLORS[g.category]} ratio={p.ratio} label={`${g.title}: ${p.label}`} />}
              </div>
              <p className="meta md:text-right self-center">
                {g.target_date ? <>{fmtDate(g.target_date, s.date_locale)}<span className="block text-fg-3">{days! >= 0 ? `${days} days left` : `${-days!} days past`}</span></> : 'No deadline'}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Ideas({ ideas }: { ideas: Goal[] }) {
  const [text, setText] = useState('');
  return (
    <div>
      <form className="flex gap-2 mb-6" onSubmit={(e) => {
        e.preventDefault(); if (!text.trim()) return;
        store.insert('goals', { title: text.trim(), description: '', why: '', category: 'personal', stage: 'idea', priority: 'medium', start_date: null, target_date: null,
          progress_method: 'checklist', target_value: null, current_value: 0, unit: '', next_action: '', notes: [], completed_at: null });
        setText(''); store.toast('Idea saved');
      }}>
        <label className="sr-only" htmlFor="idea">New idea</label>
        <input id="idea" className="input" placeholder="Something you might want to do one day" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-outline shrink-0" disabled={!text.trim()}>Save</button>
      </form>
      {!ideas.length ? <Empty title="No ideas parked" body="A place for ambitions you haven’t committed to yet." /> : (
        <ul className="border-t border-ink-700">
          {ideas.map((g) => (
            <li key={g.id} className="row flex-wrap py-4">
              <div className="flex-1 min-w-[200px]">
                <p className="flex items-center gap-2"><span>{g.title}</span></p>
                <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3 mt-0.5"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GOAL_COLORS[g.category] }} />{GOAL_CATEGORIES[g.category]}</p>
                {g.description && <p className="text-sm text-fg-2 mt-1">{g.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button className="btn-ghost" onClick={() => openEditor({ type: 'goal', id: g.id })}>Edit</button>
                <button className="btn-outline" onClick={() => openEditor({ type: 'goal', id: g.id, promote: true })}>Promote<Icon name="arrow" size={16} /></button>
                <button className="icon-btn hover:text-bad" aria-label={`Delete idea “${g.title}”`} onClick={() => store.remove('goals', g.id, { undo: 'Idea deleted' })}><Icon name="trash" size={18} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Timeline ---------------- */
function Timeline({ goals }: { goals: Goal[] }) {
  const desktop = useIsDesktop();
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const dated = goals.filter((g) => g.target_date || db.milestones.some((m) => m.goal_id === g.id && m.due_date));
  if (!dated.length) return <Empty title="Nothing to plot yet" body="Give a goal a target date or dated milestones to see it here." />;

  if (!desktop) {
    // Readable vertical timeline for phones.
    type Ev = { date: string; title: string; goal: Goal; kind: 'start' | 'deadline' | 'milestone'; done: boolean; id: string };
    const evs: Ev[] = [];
    dated.forEach((g) => {
      if (g.target_date) evs.push({ date: g.target_date, title: 'Target date', goal: g, kind: 'deadline', done: g.stage === 'completed', id: 'g' + g.id });
      db.milestones.filter((m) => m.goal_id === g.id && m.due_date).forEach((m) => evs.push({ date: m.due_date!, title: m.title, goal: g, kind: 'milestone', done: m.done, id: m.id }));
    });
    evs.sort((a, b) => a.date.localeCompare(b.date));
    let lastMonth = '';
    let todayShown = false;
    return (
      <ol className="relative border-l border-ink-600 ml-2">
        {evs.map((e) => {
          const month = e.date.slice(0, 7);
          const head = month !== lastMonth; lastMonth = month;
          const showToday = !todayShown && e.date >= today; if (showToday) todayShown = true;
          return (
            <li key={e.id} className="pl-6">
              {head && <p className="label -ml-6 pl-6 pt-6 pb-2 bg-ink-950">{fmtDate(e.date, s.date_locale, { month: 'long', year: 'numeric' })}</p>}
              {showToday && <p className="relative font-mono text-[11px] uppercase tracking-[0.06em] text-acid py-2"><span className="absolute -left-[29px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-acid" />Today</p>}
              <button className="relative w-full text-left py-3 min-h-[44px]" onClick={() => (e.kind === 'milestone' ? openEditor({ type: 'milestone', id: e.id }) : navigate(`goals/${e.goal.id}`))}>
                <span className={`absolute -left-[30px] top-[18px] w-3 h-3 ${e.kind === 'deadline' ? 'rotate-45 rounded-[2px]' : 'rounded-full'} border ${e.done ? 'bg-acid border-acid' : 'bg-ink-950 border-fg-3'}`} />
                <span className="meta">{fmtDate(e.date, s.date_locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className={`block mt-0.5 ${e.done ? 'text-fg-3 line-through decoration-ink-500' : ''}`}>{e.title}</span>
                <span className="block text-sm text-fg-2">{e.goal.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  const starts = dated.map((g) => g.start_date ?? g.created_at.slice(0, 10));
  const ends = dated.flatMap((g) => [g.target_date ?? today, ...db.milestones.filter((m) => m.goal_id === g.id && m.due_date).map((m) => m.due_date!)]);
  const from = startOfMonth([...starts, today].sort()[0]);
  const to = addDays(startOfMonth(addMonths([...ends, today].sort().slice(-1)[0], 1)), -1);
  const span = Math.max(1, diffDays(to, from));
  const pct = (d: string) => `${(Math.min(span, Math.max(0, diffDays(d, from))) / span) * 100}%`;
  const months: string[] = []; for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);

  return (
    <div className="border-t border-ink-700">
      <div className="grid grid-cols-[240px_1fr] items-end">
        <span />
        <div className="relative h-10">
          {months.map((m) => <span key={m} className="absolute bottom-2 label" style={{ left: pct(m) }}>{fmtDate(m, s.date_locale, { month: 'short' })}</span>)}
        </div>
      </div>
      {dated.map((g) => {
        const start = g.start_date ?? g.created_at.slice(0, 10);
        const end = g.target_date;
        return (
          <div key={g.id} className="grid grid-cols-[240px_1fr] items-center border-t border-ink-700 min-h-[64px]">
            <button className="text-left pr-4 py-3 min-w-0" onClick={() => navigate(`goals/${g.id}`)}>
              <span className="block truncate">{g.title}</span>
              <span className="meta text-fg-3">{goalProgress(db, g).label}</span>
            </button>
            <div className="relative h-16">
              {months.map((m) => <span key={m} className="absolute top-0 bottom-0 border-l border-ink-700/70" style={{ left: pct(m) }} />)}
              <span className="absolute top-0 bottom-0 border-l border-acid/70" style={{ left: pct(today) }} aria-hidden />
              {end && <span className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-ink-600" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />}
              {end && (
                <button onClick={() => openEditor({ type: 'goal', id: g.id })} title={`Target ${fmtDate(end, s.date_locale)}`} aria-label={`Target date ${fmtDate(end, s.date_locale)} — edit`}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 grid place-items-center" style={{ left: pct(end) }}>
                  <span className={`w-3 h-3 rotate-45 rounded-[2px] border ${g.stage === 'completed' ? 'bg-acid border-acid' : 'bg-ink-950 border-fg'}`} />
                </button>
              )}
              {db.milestones.filter((m) => m.goal_id === g.id && m.due_date).map((m) => (
                <button key={m.id} onClick={() => openEditor({ type: 'milestone', id: m.id })} title={m.title} aria-label={`Milestone ${m.title}, ${fmtDate(m.due_date!, s.date_locale)}${m.done ? ', done' : ''}`}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 grid place-items-center" style={{ left: pct(m.due_date!) }}>
                  <span className={`w-2.5 h-2.5 rounded-full border ${m.done ? 'bg-acid border-acid' : 'bg-ink-950 border-fg-2'}`} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="meta text-fg-3 mt-4 flex gap-5"><span>◆ target date</span><span>● milestone</span><span className="text-acid">│ today</span></p>
    </div>
  );
}

/* ---------------- Detail ---------------- */
function GoalDetail({ id }: { id: string }) {
  const db = useDB();
  const s = useSettings();
  const g = db.goals.find((x) => x.id === id);
  const [taskText, setTaskText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [na, setNa] = useState(g?.next_action ?? '');
  useEffect(() => setNa(g?.next_action ?? ''), [g?.next_action]);
  if (!g) return <Empty title="Goal not found" body="It may have been deleted on another device." action={<button className="btn-outline" onClick={() => navigate('goals')}>Back to goals</button>} />;
  const gc = GOAL_COLORS[g.category];
  const p = goalProgress(db, g);
  const ms = db.milestones.filter((m) => m.goal_id === g.id).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || a.sort - b.sort);
  const tasks = db.tasks.filter((t) => t.goal_id === g.id).sort((a, b) => Number(a.done) - Number(b.done) || a.sort - b.sort);
  const today = todayISO(s.timezone);
  const moveTask = (i: number, dir: -1 | 1) => {
    const open = tasks.filter((t) => !t.done); const j = i + dir;
    if (j < 0 || j >= open.length) return;
    store.update('tasks', open[i].id, { sort: open[j].sort }); store.update('tasks', open[j].id, { sort: open[i].sort === open[j].sort ? open[i].sort + dir : open[i].sort });
  };

  return (
    <div className="anim-fade" style={{ ['--gc' as any]: gc }}>
      <button className="btn-ghost -ml-3 mb-6" onClick={() => navigate('goals')}><Icon name="left" size={16} />Goals</button>
      <header className="mb-10 goal-hero rounded-xl p-5 md:p-8 -mx-1">
        <p className="flex flex-wrap items-center gap-2 label mb-3"><span className="w-2 h-2 rounded-full anim-pulse" style={{ backgroundColor: gc }} /><span style={{ color: gc }}>{GOAL_CATEGORIES[g.category]}</span> · {g.priority} priority · {g.stage}</p>
        <h1 className="h-display max-w-[22ch]">{g.title}</h1>
        {g.description && <p className="text-fg-2 mt-4 max-w-2xl text-[17px] leading-relaxed">{g.description}</p>}
        <div className="flex flex-wrap gap-2 mt-6">
          <button className="btn-outline" onClick={() => openEditor({ type: 'goal', id: g.id })}><Icon name="edit" size={16} />Edit</button>
          {g.stage !== 'completed' && <button className="btn-outline" onClick={() => { store.update('goals', g.id, { stage: 'completed', completed_at: new Date().toISOString() }); store.toast('Goal completed. Well done.', { label: 'Undo', run: () => store.update('goals', g.id, { stage: 'active', completed_at: null }) }); }}><Icon name="check" size={16} />Mark complete</button>}
          {g.stage !== 'archived' && <button className="btn-ghost" onClick={() => { store.update('goals', g.id, { stage: 'archived' }); store.toast('Archived', { label: 'Undo', run: () => store.update('goals', g.id, { stage: g.stage }) }); }}>Archive</button>}
          {(g.stage === 'archived' || g.stage === 'completed') && <button className="btn-ghost" onClick={() => store.update('goals', g.id, { stage: 'active', completed_at: null })}>Reactivate</button>}
          <button className="btn-ghost hover:text-bad" onClick={async () => {
            if (await confirmAction({ title: 'Delete this goal?', body: 'Its milestones, tasks and notes will be deleted too.', confirm: 'Delete goal', danger: true })) {
              store.remove('goals', g.id, { undo: 'Goal deleted' }); navigate('goals');
            }
          }}><Icon name="trash" size={16} />Delete</button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-x-12 xl:gap-x-24 2xl:gap-x-32 gap-y-12">
        <div className="space-y-12 min-w-0">
          <section>
            <SectionHead label="Next action" title="The very next step" />
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="na">Next action</label>
              <input id="na" className="input" value={na} placeholder={nextAction(db, { ...g, next_action: '' })?.text ?? 'What’s the next physical step?'}
                onChange={(e) => setNa(e.target.value)} onBlur={() => na !== g.next_action && store.update('goals', g.id, { next_action: na })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </div>
            <p className="text-sm text-fg-3 mt-2">{g.next_action ? 'Shown on Today.' : 'Blank = your first open task is shown on Today.'}</p>
          </section>

          <section>
            <SectionHead label="Milestones" title={`${ms.filter((m) => m.done).length} of ${ms.length} reached`} action={<button className="btn-ghost -mr-3" onClick={() => openEditor({ type: 'milestone', goalId: g.id })}><Icon name="plus" size={16} />Milestone</button>} />
            {!ms.length ? <p className="text-fg-2 py-3 border-y border-ink-700">No milestones yet. Dated milestones appear on the calendar.</p> : (
              <ul className="border-t border-ink-700">
                {ms.map((m) => (
                  <li key={m.id} className="row">
                    <CheckButton color={gc} checked={m.done} label={m.title} onClick={() => store.update('milestones', m.id, { done: !m.done, done_at: m.done ? null : new Date().toISOString() })} />
                    <button className="flex-1 min-w-0 text-left min-h-[44px]" onClick={() => openEditor({ type: 'milestone', id: m.id })}>
                      <span className={m.done ? 'text-fg-3 line-through decoration-ink-500' : ''}>{m.title}</span>
                    </button>
                    <span className={`meta shrink-0 ${m.due_date && !m.done && m.due_date < today ? 'text-warn' : ''}`}>{m.due_date ? fmtDate(m.due_date, s.date_locale, { day: 'numeric', month: 'short' }) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHead label="Tasks" title="Actionable steps" />
            <ul className="border-t border-ink-700">
              {tasks.map((t) => {
                const openIdx = tasks.filter((x) => !x.done).indexOf(t);
                return (
                  <li key={t.id} className="row">
                    <CheckButton color={gc} checked={t.done} label={t.title} onClick={() => store.update('tasks', t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() })} />
                    <button className="flex-1 min-w-0 text-left min-h-[44px]" onClick={() => openEditor({ type: 'task', id: t.id })}>
                      <span className={t.done ? 'text-fg-3 line-through decoration-ink-500' : ''}>{t.title}</span>
                      {t.focus_date === today && <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-acid">Today’s priority</span>}
                    </button>
                    {!t.done && <>
                      <button className="icon-btn" aria-label={`Move “${t.title}” up`} onClick={() => moveTask(openIdx, -1)}><Icon name="up" size={16} /></button>
                      <button className="icon-btn" aria-label={`Move “${t.title}” down`} onClick={() => moveTask(openIdx, 1)}><Icon name="down" size={16} /></button>
                    </>}
                  </li>
                );
              })}
            </ul>
            <form className="flex gap-2 mt-3" onSubmit={(e) => {
              e.preventDefault(); if (!taskText.trim()) return;
              store.insert('tasks', { title: taskText.trim(), goal_id: g.id, done: false, done_at: null, due_date: null, focus_date: null, sort: Math.max(0, ...tasks.map((t) => t.sort)) + 1 });
              setTaskText('');
            }}>
              <label className="sr-only" htmlFor="newtask">New task</label>
              <input id="newtask" className="input" placeholder="Add a task" value={taskText} onChange={(e) => setTaskText(e.target.value)} />
              <button className="btn-outline shrink-0" disabled={!taskText.trim()}>Add</button>
            </form>
          </section>
        </div>

        <div className="space-y-12 min-w-0">
          <section>
            <SectionHead label="Progress" title={p.label} />
            {p.ratio !== null && <p className="text-5xl font-light tracking-tight mb-2 tabular-nums" style={{ color: gc }}>{Math.round(p.ratio * 100)}<span className="text-2xl text-fg-3">%</span></p>}
            <p className="meta text-fg-3 mb-3">Method: {p.detail}</p>
            {p.ratio !== null && <Progress color={gc} ratio={p.ratio} label={p.label} />}
            {g.progress_method === 'numeric' && (
              <div className="flex items-center gap-2 mt-4">
                <button className="icon-btn border border-ink-600" aria-label="Decrease" onClick={() => store.update('goals', g.id, (x) => ({ current_value: Math.max(0, x.current_value - 1) }))}><span className="text-xl leading-none">−</span></button>
                <label className="sr-only" htmlFor="cur">Current value</label>
                <input id="cur" type="number" inputMode="decimal" className="input w-24 text-center" value={g.current_value} onChange={(e) => store.update('goals', g.id, { current_value: Number(e.target.value) || 0 })} />
                <button className="icon-btn border border-ink-600" aria-label="Increase" onClick={() => store.update('goals', g.id, (x) => ({ current_value: x.current_value + 1 }))}><Icon name="plus" size={18} /></button>
                <span className="text-fg-2">of {g.target_value ?? '—'} {g.unit}</span>
              </div>
            )}
          </section>

          <section>
            <SectionHead label="Timeline" title="Dates" />
            <dl className="border-t border-ink-700">
              <div className="row"><dt className="flex-1 text-fg-2">Start</dt><dd className="meta">{g.start_date ? fmtDate(g.start_date, s.date_locale) : '—'}</dd></div>
              <div className="row"><dt className="flex-1 text-fg-2">Target</dt><dd className="meta">{g.target_date ? fmtDate(g.target_date, s.date_locale) : '—'}</dd></div>
            </dl>
          </section>

          {g.why && (
            <section>
              <p className="label mb-3">Why it matters</p>
              <p className="text-[17px] leading-relaxed">{g.why}</p>
            </section>
          )}

          <section>
            <SectionHead label="Notes" title="Progress notes" />
            <form className="space-y-2 mb-4" onSubmit={(e) => {
              e.preventDefault(); if (!noteText.trim()) return;
              store.update('goals', g.id, (x) => ({ notes: [...x.notes, { id: uid(), date: today, text: noteText.trim() }] })); setNoteText('');
            }}>
              <label className="sr-only" htmlFor="note">New note</label>
              <textarea id="note" className="input min-h-[72px]" placeholder="What happened, what you learned" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button className="btn-outline" disabled={!noteText.trim()}>Add note</button>
            </form>
            <ul className="border-t border-ink-700">
              {[...g.notes].reverse().map((n) => (
                <li key={n.id} className="py-3 border-b border-ink-700 flex gap-3">
                  <div className="flex-1">
                    <p className="meta text-fg-3">{fmtDate(n.date, s.date_locale)}</p>
                    <p className="mt-1 whitespace-pre-wrap">{n.text}</p>
                  </div>
                  <button className="icon-btn hover:text-bad" aria-label="Delete note" onClick={() => {
                    const prev = g.notes;
                    store.update('goals', g.id, { notes: g.notes.filter((x) => x.id !== n.id) });
                    store.toast('Note deleted', { label: 'Undo', run: () => store.update('goals', g.id, { notes: prev }) });
                  }}><Icon name="trash" size={16} /></button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export { rangeDays };
