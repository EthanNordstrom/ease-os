import { useMemo, useState } from 'react';
import { store, useDB, useSettings } from '../lib/store';
import { addDays, diffDays, fmtDate, fmtTime, nowParts, relativeDay, timeToMin } from '../lib/dates';
import { calendarItems, goalProgress, nextAction, pickCurrentRoutine, routineProgress, routineScheduledOn } from '../lib/domain';
import type { Routine } from '../lib/types';
import { CheckButton, Empty, Icon, Progress, SectionHead, confirmAction } from '../components/ui';
import { openEditor, toggleRoutineItem } from '../components/editors';
import { navigate } from '../lib/router';
import QuoteCard from '../components/QuoteCard';
import { startWorkout } from '../lib/workouts';
import { dayTotals, fmtKcal, guessAisle, r0 } from '../lib/food';
import { setUi } from '../lib/prefs';
import { dueSoon, fmtMoney, moneySettings, nextPayday, paydayPlan } from '../lib/money';
import { markBillPaid } from '../lib/moneyActions';

export default function Today() {
  const db = useDB();
  const s = useSettings();
  const { date: today, time: now, hour } = nowParts(s.timezone);
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="anim-fade">
      <header className="mb-10 md:mb-14">
        <p className="label mb-3">{fmtDate(today, s.date_locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="h-display">{greeting}{s.display_name ? `, ${s.display_name}` : ''}.</h1>
      </header>

      <GettingStarted />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-x-12 xl:gap-x-24 2xl:gap-x-32 gap-y-12">
        <div className="space-y-12 min-w-0">
          <RoutinesToday today={today} nowMin={timeToMin(now)} />
          <Priorities today={today} />
          <NextActions />
        </div>
        <div className="space-y-12 min-w-0">
          <QuoteCard today={today} compact />
          <FoodToday today={today} />
          <WorkoutToday today={today} />
          <MoneyToday today={today} />
          <ShoppingPeek />
          <UpNext today={today} now={now} />
        </div>
      </div>
    </div>
  );
}

function GettingStarted() {
  const db = useDB();
  const s = useSettings();
  const hidden = !!s.ui?.hideSetup;
  const steps = [
    { done: db.routines.length > 0, label: 'Create your routine', go: () => navigate('routines/new') },
    { done: db.goals.some((g) => g.stage !== 'idea'), label: 'Add a goal you’re working toward', go: () => openEditor({ type: 'goal', stage: 'active' }) },
    { done: db.workout_templates.length > 0 || db.workouts.length > 0, label: 'Set up a workout', go: () => navigate('gym/templates') },
    { done: db.nutrition_goals.length > 0, label: 'Set a daily calorie target', go: () => navigate('food') },
    { done: db.bills.length > 0 || db.savings_goals.length > 0, label: 'Add your bills or a savings goal', go: () => navigate('money') },
    { done: db.events.length > 0, label: 'Put something on your calendar', go: () => openEditor({ type: 'event' }) },
  ];
  if (hidden || steps.every((x) => x.done)) return null;
  return (
    <section aria-label="Get set up" className="mb-12 py-4 border-y border-ink-700">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="label">Get set up · {steps.filter((x) => x.done).length} of {steps.length}</p>
        <button className="btn-ghost -mr-3 text-sm" onClick={() => setUi({ hideSetup: true })}>Hide</button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        {steps.map((st) => (
          <li key={st.label}>
            <button onClick={st.go} disabled={st.done} className="row w-full text-left border-b-0 disabled:opacity-100">
              <span className={`w-5 h-5 rounded-full grid place-items-center border ${st.done ? 'bg-acid border-acid text-acid-ink' : 'border-ink-500'}`}>{st.done && <Icon name="check" size={12} strokeWidth={3} />}</span>
              <span className={st.done ? 'text-fg-3 line-through decoration-ink-500' : ''}>{st.label}</span>
              {!st.done && <Icon name="right" size={16} className="ml-auto text-fg-3" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoutineChecklist({ r, today }: { r: Routine; today: string }) {
  const db = useDB();
  const p = routineProgress(db, r, today);
  const complete = p.total > 0 && p.current === p.total;
  return (
    <>
      <Progress ratio={p.total ? p.current / p.total : 0} label={`${r.name} progress`} />
      {complete && <p className="flex items-center gap-2 text-sm text-acid mt-3 anim-rise"><span className="relative w-2 h-2 rounded-full bg-acid"><span className="absolute inset-0 rounded-full border border-acid anim-ring" /></span>All done. Nice work.</p>}
      <ul className="mt-2 stagger">
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
    </>
  );
}

function RoutinesToday({ today, nowMin }: { today: string; nowMin: number }) {
  const db = useDB();
  const s = useSettings();
  const [open, setOpen] = useState<string | null>(null);
  const routines = db.routines.filter((r) => routineScheduledOn(r, today)).sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
  if (!db.routines.length)
    return (
      <section aria-labelledby="rt">
        <SectionHead label="Routine" title="Your routine" />
        <Empty title="No routine yet" body="Add the steps you want to tick off — a morning routine, an evening wind-down, anything." action={<button className="btn-primary" onClick={() => navigate('routines/new')}>Create a routine</button>} />
      </section>
    );
  if (!routines.length)
    return (
      <section aria-labelledby="rt">
        <SectionHead label="Routine" title="Nothing scheduled today" />
        <p className="text-fg-2 py-3 border-y border-ink-700">No routines today — rest days count too.</p>
      </section>
    );
  // Show the routine that fits the time of day; the rest stay one tap away.
  const current = pickCurrentRoutine(routines, nowMin)!;
  const others = routines.filter((r) => r.id !== current.id);
  const p = routineProgress(db, current, today);
  return (
    <section aria-label={current.name}>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="label mb-1">{current.start_time ? `Routine · ${fmtTime(current.start_time, s.hour12)}` : 'Routine'}</p>
          <h2 className="h-section">{current.name}</h2>
        </div>
        <p className="meta">{p.current} / {p.total}</p>
      </div>
      <RoutineChecklist r={current} today={today} />
      {others.length > 0 && (
        <div className="mt-5">
          <p className="label mb-1">Also today</p>
          <ul className="border-t border-ink-700">
            {others.map((r) => {
              const op = routineProgress(db, r, today);
              const isOpen = open === r.id;
              return (
                <li key={r.id} className="border-b border-ink-700">
                  <button className="w-full flex items-center gap-3 min-h-[48px] text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <span className="flex-1 min-w-0 truncate">{r.name}</span>
                    {r.start_time && <span className="meta text-fg-3">{fmtTime(r.start_time, s.hour12)}</span>}
                    <span className={`meta ${op.total && op.current === op.total ? 'text-acid' : ''}`}>{op.current}/{op.total}</span>
                    <Icon name={isOpen ? 'up' : 'down'} size={16} className="text-fg-3" />
                  </button>
                  {isOpen && <div className="pb-3 anim-rise"><RoutineChecklist r={r} today={today} /></div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
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
      <ul className="stagger">
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
        <ul className="stagger">
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
                  <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3 mb-0.5"><span className="truncate">{g.title}</span></span>
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

function FoodToday({ today }: { today: string }) {
  const db = useDB();
  const s = useSettings();
  const g = db.nutrition_goals[0];
  const t = dayTotals(db, today);
  const left = g ? g.calories - t.calories : 0;
  return (
    <section aria-labelledby="fd">
      <SectionHead label="Food" title="Today’s fuel" action={<button className="btn-ghost -mr-3 text-sm" onClick={() => navigate('food')}>Food log</button>} />
      <div className="surface p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[34px] leading-none tracking-[-0.03em] font-medium tabular-nums">{fmtKcal(t.calories, s.date_locale)}</p>
            <p className="meta mt-2">{g ? `of ${fmtKcal(g.calories, s.date_locale)} kcal` : 'kcal eaten'}</p>
          </div>
          {g && <div className="text-right"><p className="text-[18px] tabular-nums">{fmtKcal(Math.abs(left), s.date_locale)}</p><p className="meta mt-1">{left >= 0 ? 'to go' : 'over target'}</p></div>}
        </div>
        {g && <div className="mt-4"><Progress ratio={Math.min(1, t.calories / g.calories)} label="Calories eaten compared with your target" /></div>}
        <div className="grid grid-cols-3 gap-4 mt-5">
          {([['Protein', t.protein, g?.protein], ['Carbs', t.carbs, g?.carbs], ['Fat', t.fat, g?.fat]] as const).map(([label, v, goal]) => (
            <div key={label}>
              <p className="meta text-fg-3">{label}</p>
              <p className="tabular-nums mt-1">{r0(v)}<span className="text-fg-3 text-sm">{goal ? ` / ${goal}` : ''} g</span></p>
              {goal ? <div className="mt-2"><Progress ratio={Math.min(1, v / goal)} label={`${label} compared with target`} /></div> : null}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <button className="btn-primary" onClick={() => openEditor({ type: 'food', date: today })}><Icon name="plus" size={16} />Log food</button>
          {!g && <button className="btn-ghost" onClick={() => navigate('food')}>Set a target</button>}
        </div>
      </div>
    </section>
  );
}

function ShoppingPeek() {
  const db = useDB();
  const [text, setText] = useState('');
  const open = db.shopping_items.filter((x) => !x.done).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = text.trim();
    if (!n) return;
    if (open.some((x) => x.name.toLowerCase() === n.toLowerCase())) store.toast(`${n} is already on your list`);
    else store.insert('shopping_items', { name: n, amount: '', aisle: guessAisle(n), done: false, source: '', sort: 0 });
    setText('');
  };
  return (
    <section aria-labelledby="sh">
      <SectionHead label="Shopping" title={open.length ? `${open.length} to get` : 'Shopping list'} action={<button className="btn-ghost -mr-3 text-sm" onClick={() => navigate('shopping')}>Full list</button>} />
      {open.length > 0 && (
        <ul className="stagger">
          {open.slice(0, 5).map((x) => (
            <li key={x.id} className="row">
              <CheckButton checked={false} label={`Got ${x.name}`} onClick={() => {
                store.update('shopping_items', x.id, { done: true });
                store.toast(`Ticked off ${x.name}`, { label: 'Undo', run: () => store.update('shopping_items', x.id, { done: false }) });
              }} />
              <span className="flex-1 min-w-0 truncate">{x.name}</span>
              {x.amount && <span className="meta text-fg-3 shrink-0">{x.amount}</span>}
            </li>
          ))}
          {open.length > 5 && <li className="pt-2"><button className="btn-ghost -ml-3 text-sm" onClick={() => navigate('shopping')}>+{open.length - 5} more</button></li>}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2 mt-3">
        <label className="sr-only" htmlFor="shop-quick">Add to shopping list</label>
        <input id="shop-quick" className="input" placeholder="Add to shopping list" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-outline shrink-0" disabled={!text.trim()}>Add</button>
      </form>
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
              <p className="text-[17px] flex items-center gap-2"><span className="truncate">{w.name}</span></p>
              <p className="meta mt-0.5">{w.entries.length} exercises · {w.status === 'completed' ? 'Completed' : w.status === 'in_progress' ? `${sets.filter((x) => x.done).length}/${sets.length} sets` : w.planned_time ? fmtTime(w.planned_time, s.hour12) : 'Any time'}</p>
            </div>
            {w.status === 'completed'
              ? <span className="chip text-acid border-acid/40"><Icon name="check" size={14} />Done</span>
              : <div className="flex items-center gap-1">
                  {w.status === 'in_progress' && !sets.some((x) => x.done) && <button className="btn-ghost" onClick={async () => {
                    if (await confirmAction({ title: 'Discard this workout?', body: 'Nothing has been logged in it yet.', confirm: 'Discard', danger: true })) store.remove('workouts', w.id, { undo: 'Workout discarded' });
                  }}>Discard</button>}
                  <button className="btn-primary" onClick={() => (w.status === 'in_progress' ? navigate(`gym/session/${w.id}`) : startWorkout(w))}><Icon name="play" size={16} />{w.status === 'in_progress' ? 'Resume' : 'Start'}</button>
                </div>}
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
        <ul className="stagger">
          {items.map((i) => (
            <li key={i.key}>
              <button className="row w-full text-left" onClick={() => i.kind === 'event' ? openEditor({ type: 'event', id: i.refId, occurrenceDate: i.occ?.originalDate }) : i.kind === 'milestone' ? openEditor({ type: 'milestone', id: i.refId }) : navigate(`goals/${i.refId}`)}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: i.color }} />
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

function MoneyToday({ today }: { today: string }) {
  const db = useDB();
  const s = useSettings();
  if (!db.bills.length && !db.savings_goals.length) return null;
  const m = moneySettings(db);
  const fm = (n: number) => fmtMoney(n, m.currency, s.date_locale, true);
  const plan = paydayPlan(db, today);
  const pay = nextPayday(m, today);
  const soon = dueSoon(db, today, 3).filter((d) => !d.paid);
  const payNear = pay && diffDays(pay, today) <= 3 && plan.total > 0;
  if (!soon.length && !payNear) return (
    <section aria-label="Money"><SectionHead label="Money" title="All calm" action={<button className="btn-ghost -mr-3 text-sm" onClick={() => navigate('money')}>Open</button>} /></section>
  );
  return (
    <section aria-label="Money">
      <SectionHead label="Money" title="Coming up" action={<button className="btn-ghost -mr-3 text-sm" onClick={() => navigate('money')}>Open</button>} />
      <ul className="border-t border-ink-700">
        {payNear && <li className="row"><span className="flex-1 min-w-0"><span className="block">Payday · move {fm(plan.total)}</span><span className="meta text-fg-3">{relativeDay(pay!, today, s.date_locale)} · bills and savings</span></span></li>}
        {soon.map((d) => (
          <li key={d.bill.id + d.due} className="row">
            {d.bill.autopay ? <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3 w-11 text-center">Auto</span>
              : <CheckButton checked={false} label={`Paid ${d.bill.name}`} onClick={() => markBillPaid(d.bill, d.due, true)} />}
            <span className="flex-1 min-w-0"><span className="block truncate">{d.bill.name}</span><span className={`meta ${d.overdue ? 'text-warn' : 'text-fg-3'}`}>{d.overdue ? 'Overdue · ' : ''}{relativeDay(d.due, today, s.date_locale)}</span></span>
            <span className="tabular-nums">{fm(Number(d.bill.amount))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
