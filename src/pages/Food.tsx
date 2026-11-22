import { useMemo, useState } from 'react';
import { store, useDB, useSettings } from '../lib/store';
import { addDays, diffDays, fmtDate, nowParts, relativeDay, todayISO } from '../lib/dates';
import { SLOTS, dayTotals, fmtKcal, r0, r1, slotForHour, weekAverage } from '../lib/food';
import type { Food, FoodLog, MealPlan, Slot } from '../lib/types';
import { Empty, Field, Icon, Progress, SectionHead, Segmented, Sheet } from '../components/ui';
import { AddFoodSheet, FoodEditor, GoalsSheet, LogEntrySheet, PlanEditor, logFood, logPlan } from '../components/FoodSheets';
import LineChart from '../components/LineChart';
import { navigate } from '../lib/router';

type Tab = 'day' | 'foods' | 'plans' | 'weight';

export default function FoodPage({ sub }: { sub?: string }) {
  const tab = (['foods', 'plans', 'weight'].includes(sub ?? '') ? sub : 'day') as Tab;
  return (
    <div className="anim-fade">
      <header className="mb-8">
        <p className="label mb-3">Food</p>
        <h1 className="h-display">Fuel the work.</h1>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar">
          <Segmented label="Food section" value={tab} onChange={(t) => navigate(t === 'day' ? 'food' : `food/${t}`)} options={[
            { value: 'day', label: 'Day' }, { value: 'foods', label: 'My foods' }, { value: 'plans', label: 'Day plans' }, { value: 'weight', label: 'Weight' }]} />
        </div>
        <button className="btn-ghost" onClick={() => navigate('shopping')}><Icon name="list" size={16} />Shopping list</button>
      </div>
      {tab === 'day' && <Day />}
      {tab === 'foods' && <Foods />}
      {tab === 'plans' && <Plans />}
      {tab === 'weight' && <Weight />}
    </div>
  );
}

/* ---------------- Day ---------------- */
function Day() {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState<Slot | null>(null);
  const [entry, setEntry] = useState<FoodLog | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [planFor, setPlanFor] = useState(false);
  const goal = db.nutrition_goals[0];
  const logs = db.food_logs.filter((l) => l.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const t = dayTotals(db, date);
  const yesterday = db.food_logs.filter((l) => l.date === addDays(date, -1));

  const copyYesterday = () => {
    yesterday.forEach((l) => store.insert('food_logs', { date, slot: l.slot, food_id: l.food_id, name: l.name, servings: l.servings, calories: l.calories, protein: l.protein, carbs: l.carbs, fat: l.fat }));
    store.toast(`Copied ${yesterday.length} item${yesterday.length > 1 ? 's' : ''} from the day before`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-x-12 xl:gap-x-24 2xl:gap-x-32 gap-y-12">
      <div className="min-w-0 space-y-10">
        <div className="flex flex-wrap items-center gap-1">
          <button className="icon-btn border border-ink-600" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon name="left" size={18} /></button>
          <p className="px-3 text-[17px] min-w-[150px] text-center">{relativeDay(date, today, s.date_locale)}<span className="block meta text-fg-3">{fmtDate(date, s.date_locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span></p>
          <button className="icon-btn border border-ink-600" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><Icon name="right" size={18} /></button>
          {date !== today && <button className="btn-ghost" onClick={() => setDate(today)}>Today</button>}
        </div>

        <Summary totals={t} onGoals={() => setGoalsOpen(true)} />

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setAdding(date === today ? slotForHour(nowParts(s.timezone).hour) : 'breakfast')}><Icon name="plus" size={16} />Add food</button>
          {db.meal_plans.length > 0 && <button className="btn-outline" onClick={() => setPlanFor(true)}>Log a day plan</button>}
          {yesterday.length > 0 && !logs.length && <button className="btn-ghost" onClick={copyYesterday}>Copy the day before</button>}
        </div>

        <div className="space-y-8">
          {SLOTS.map((m) => {
            const list = logs.filter((l) => l.slot === m.key);
            const st = list.reduce((a, l) => a + Number(l.calories), 0);
            return (
              <section key={m.key} aria-label={m.label}>
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-ink-700">
                  <h2 className="h-section">{m.label}</h2>
                  <div className="flex items-center gap-1">
                    {st > 0 && <span className="meta">{fmtKcal(st, s.date_locale)} kcal</span>}
                    <button className="icon-btn -mr-2" aria-label={`Add to ${m.label}`} onClick={() => setAdding(m.key)}><Icon name="plus" size={18} /></button>
                  </div>
                </div>
                {list.length ? (
                  <ul className="stagger">
                    {list.map((l) => (
                      <li key={l.id}>
                        <button className="row w-full text-left" onClick={() => setEntry(l)}>
                          <span className="flex-1 min-w-0"><span className="block truncate">{l.name}</span>{Number(l.servings) !== 1 && <span className="meta text-fg-3">× {r1(Number(l.servings))}</span>}</span>
                          <span className="meta text-right shrink-0">{fmtKcal(Number(l.calories), s.date_locale)} kcal<span className="block text-fg-3">{r0(Number(l.protein))} g protein</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <button className="w-full text-left py-3 text-sm text-fg-3 hover:text-fg transition-colors" onClick={() => setAdding(m.key)}>Nothing logged — add {m.label.toLowerCase()}</button>}
              </section>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 space-y-12">
        <WeekChart end={date} />
        <QuickFavourites date={date} />
      </div>

      {adding && <AddFoodSheet date={date} slot={adding} onClose={() => setAdding(null)} />}
      {entry && <LogEntrySheet entry={entry} onClose={() => setEntry(null)} />}
      {goalsOpen && <GoalsSheet onClose={() => setGoalsOpen(false)} />}
      {planFor && <PickPlan date={date} onClose={() => setPlanFor(false)} />}
    </div>
  );
}

export function Summary({ totals, onGoals, compact = false }: { totals: ReturnType<typeof dayTotals>; onGoals: () => void; compact?: boolean }) {
  const db = useDB();
  const s = useSettings();
  const g = db.nutrition_goals[0];
  if (!g) return (
    <div className="surface p-5 flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-[17px]">{fmtKcal(totals.calories, s.date_locale)} kcal eaten</p><p className="text-sm text-fg-2 mt-1">Set a daily target to see what’s left.</p></div>
      <button className="btn-primary" onClick={onGoals}>Set daily target</button>
    </div>
  );
  const left = g.calories - totals.calories;
  const macros = ([['Protein', totals.protein, g.protein], ['Carbs', totals.carbs, g.carbs], ['Fat', totals.fat, g.fat]] as const).filter(([, , goal]) => goal);
  return (
    <section aria-label="Calories today">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <p className={`${compact ? 'text-[34px]' : 'text-[44px]'} leading-none tracking-[-0.03em] font-medium tabular-nums`}>{fmtKcal(totals.calories, s.date_locale)}</p>
          <p className="meta mt-2">of {fmtKcal(g.calories, s.date_locale)} kcal</p>
        </div>
        <div className="text-right">
          <p className="text-[20px] tabular-nums">{fmtKcal(Math.abs(left), s.date_locale)}</p>
          <p className="meta mt-1">{left >= 0 ? 'kcal to go' : 'kcal over target'}</p>
        </div>
      </div>
      <Progress ratio={Math.min(1, totals.calories / g.calories)} label="Calories eaten compared with your target" />
      {macros.length > 0 && (
        <div className={`grid gap-4 mt-5 ${macros.length === 1 ? 'grid-cols-1' : macros.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {macros.map(([label, v, goal]) => (
            <div key={label}>
              <p className="flex justify-between meta mb-1.5"><span>{label}</span><span className="text-fg tabular-nums">{r0(v)}<span className="text-fg-3"> / {goal} g</span></span></p>
              <Progress ratio={Math.min(1, v / (goal as number))} label={`${label} compared with target`} />
            </div>
          ))}
        </div>
      )}
      {!compact && <button className="btn-ghost -ml-3 mt-3 text-sm" onClick={onGoals}><Icon name="edit" size={14} />Edit targets</button>}
    </section>
  );
}

function WeekChart({ end }: { end: string }) {
  const db = useDB();
  const s = useSettings();
  const g = db.nutrition_goals[0];
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const vals = days.map((d) => dayTotals(db, d).calories);
  const avg = weekAverage(db, end);
  const max = Math.max(g?.calories ?? 0, ...vals, 1) * 1.1;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <section aria-label="Last 7 days">
      <SectionHead label="Last 7 days" title={avg ? `${fmtKcal(avg.calories, s.date_locale)} kcal average` : 'No days logged yet'} />
      {avg && <p className="meta text-fg-3 -mt-2 mb-4">Average of {avg.days} logged day{avg.days > 1 ? 's' : ''} · {r0(avg.protein)} g protein</p>}
      <div className="relative h-40 flex items-end gap-2 border-b border-ink-700" role="img" aria-label={days.map((d, i) => `${fmtDate(d, s.date_locale, { weekday: 'short' })} ${Math.round(vals[i])} kcal`).join(', ')}>
        {g && <span className="absolute left-0 right-0 border-t border-dashed border-fg-3/60" style={{ bottom: `${(g.calories / max) * 100}%` }}><span className="absolute right-0 -top-5 meta text-fg-3">target</span></span>}
        {days.map((d, i) => (
          <div key={d} className="flex-1 h-full flex flex-col justify-end items-center relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && <span className="absolute -top-1 -translate-y-full meta bg-ink-800 border border-ink-600 rounded px-2 py-1 whitespace-nowrap z-10">{fmtKcal(vals[i], s.date_locale)} kcal</span>}
            <span className={`w-full max-w-[28px] rounded-t-[4px] transition-[height] duration-700 ${d === end ? 'bg-acid' : 'bg-ink-500'}`} style={{ height: `${(vals[i] / max) * 100}%`, transitionTimingFunction: 'var(--ease-out)' }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">{days.map((d) => <span key={d} className="flex-1 text-center meta text-fg-3">{fmtDate(d, s.date_locale, { weekday: 'narrow' })}</span>)}</div>
    </section>
  );
}

function QuickFavourites({ date }: { date: string }) {
  const db = useDB();
  const s = useSettings();
  const favs = db.foods.filter((f) => f.favourite).slice(0, 6);
  if (!favs.length) return null;
  return (
    <section>
      <SectionHead label="One tap" title="Favourites" />
      <ul className="border-t border-ink-700">
        {favs.map((f) => (
          <li key={f.id} className="row">
            <span className="flex-1 min-w-0 truncate">{f.name}</span>
            <span className="meta text-fg-3">{fmtKcal(Number(f.calories), s.date_locale)} kcal</span>
            <button className="icon-btn border border-ink-600" aria-label={`Add ${f.name}`} onClick={() => {
              const h = nowParts(s.timezone).hour;
              logFood(date, slotForHour(h), f, 1); store.toast(`Added ${f.name}`);
            }}><Icon name="plus" size={16} /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PickPlan({ date, onClose }: { date: string; onClose: () => void }) {
  const db = useDB();
  const s = useSettings();
  const foods = new Map(db.foods.map((f) => [f.id, f]));
  return (
    <SheetList title="Log a day plan" onClose={onClose}>
      {db.meal_plans.map((p) => {
        const kcal = p.items.reduce((a, it) => a + Number(foods.get(it.food_id)?.calories ?? 0) * it.servings, 0);
        return (
          <li key={p.id}><button className="row w-full text-left" onClick={() => { const n = logPlan(p, date); store.toast(`Logged ${n} item${n === 1 ? '' : 's'} from ${p.name}`); onClose(); }}>
            <span className="flex-1">{p.name}<span className="block meta text-fg-3">{p.items.length} items</span></span>
            <span className="meta">{fmtKcal(kcal, s.date_locale)} kcal</span><Icon name="right" size={16} className="text-fg-3" />
          </button></li>
        );
      })}
    </SheetList>
  );
}

function SheetList({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <Sheet open onClose={onClose} title={title}><ul className="-my-2">{children}</ul></Sheet>;
}

/* ---------------- My foods ---------------- */
function Foods() {
  const db = useDB();
  const s = useSettings();
  const [edit, setEdit] = useState<Food | 'new' | null>(null);
  const [q, setQ] = useState('');
  const list = useMemo(() => db.foods.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)), [db.foods, q]);
  const groups: [Food['kind'], string][] = [['meal', 'Meals'], ['recipe', 'Recipes'], ['food', 'Foods']];
  return (
    <div>
      <div className="flex gap-2 mb-6 max-w-xl">
        <input className="input" placeholder="Search" aria-label="Search foods" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary shrink-0" onClick={() => setEdit('new')}><Icon name="plus" size={16} />New</button>
      </div>
      {!db.foods.length ? <Empty title="Nothing saved yet" body="Save the foods, meals and recipes you eat often. Recipes can send their ingredients to your shopping list." action={<button className="btn-primary" onClick={() => setEdit('new')}>Create your first</button>} /> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10">
          {groups.map(([k, label]) => {
            const items = list.filter((f) => f.kind === k);
            return (
              <section key={k}>
                <p className="label mb-2">{label} · {items.length}</p>
                <ul className="border-t border-ink-700 stagger">
                  {items.map((f) => (
                    <li key={f.id}><button className="row w-full text-left" onClick={() => setEdit(f)}>
                      <span className="flex-1 min-w-0"><span className="block truncate">{f.favourite ? '★ ' : ''}{f.name}</span><span className="meta text-fg-3">{f.kind === 'recipe' ? `Serves ${f.servings_per_batch} · ${f.ingredients.length} ingredients` : f.serving}</span></span>
                      <span className="meta text-right">{fmtKcal(Number(f.calories), s.date_locale)} kcal<span className="block text-fg-3">{r0(Number(f.protein))} g protein</span></span>
                    </button></li>
                  ))}
                  {!items.length && <li className="py-3 text-sm text-fg-3">None yet.</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {edit && <FoodEditor food={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/* ---------------- Day plans ---------------- */
function Plans() {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const [edit, setEdit] = useState<MealPlan | 'new' | null>(null);
  const foods = new Map(db.foods.map((f) => [f.id, f]));
  return (
    <div className="max-w-3xl">
      <p className="text-fg-2 mb-6">Eat the same things most days? Save them as a plan and log the whole day in one tap.</p>
      <div className="mb-6"><button className="btn-primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} />New day plan</button></div>
      {!db.meal_plans.length ? <Empty title="No day plans yet" body="Build one from your saved foods and meals." /> : (
        <ul className="border-t border-ink-700 stagger">
          {db.meal_plans.map((p) => {
            const kcal = p.items.reduce((a, it) => a + Number(foods.get(it.food_id)?.calories ?? 0) * it.servings, 0);
            const prot = p.items.reduce((a, it) => a + Number(foods.get(it.food_id)?.protein ?? 0) * it.servings, 0);
            return (
              <li key={p.id} className="row py-4 flex-wrap">
                <button className="flex-1 min-w-[180px] text-left" onClick={() => setEdit(p)}>
                  <span className="block text-[17px]">{p.name}</span>
                  <span className="meta text-fg-3">{p.items.length} items · {fmtKcal(kcal, s.date_locale)} kcal · {r0(prot)} g protein</span>
                </button>
                <button className="btn-outline" onClick={() => { const n = logPlan(p, today); store.toast(`Logged ${n} items for today`); }}>Log for today</button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <PlanEditor plan={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/* ---------------- Weight ---------------- */
function Weight() {
  const db = useDB();
  const s = useSettings();
  const today = todayISO(s.timezone);
  const existing = db.weigh_ins.find((w) => w.date === today);
  const [kg, setKg] = useState(existing ? String(existing.kg) : '');
  const list = [...db.weigh_ins].sort((a, b) => a.date.localeCompare(b.date));
  const avg = (from: string, to: string) => { const xs = list.filter((w) => w.date > from && w.date <= to).map((w) => Number(w.kg)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const thisWeek = avg(addDays(today, -7), today);
  const lastWeek = avg(addDays(today, -14), addDays(today, -7));
  const save = () => {
    const v = Number(kg.replace(',', '.'));
    if (!(v >= 20 && v <= 400)) return store.toast('Enter a weight between 20 and 400 kg', undefined, 'error');
    if (existing) store.update('weigh_ins', existing.id, { kg: v }); else store.insert('weigh_ins', { date: today, kg: v });
    store.toast('Weigh-in saved');
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-12 xl:gap-x-24 2xl:gap-x-32 gap-y-10">
      <div className="space-y-8">
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex items-end gap-2 max-w-sm">
          <Field label="Today’s weight (kg)" className="flex-1"><input className="input" type="number" inputMode="decimal" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 72.4" /></Field>
          <button className="btn-primary">{existing ? 'Update' : 'Save'}</button>
        </form>
        <p className="text-sm text-fg-3 leading-relaxed">Weigh in at the same time each morning. Day-to-day numbers jump around; the 7-day average is the one to watch.</p>
        <dl className="grid grid-cols-2 border-y border-ink-700">
          <div className="py-5"><dt className="meta text-fg-3">7-day average</dt><dd className="text-3xl tracking-tight tabular-nums mt-1">{thisWeek ? r1(thisWeek) : '—'}<span className="text-base text-fg-3"> kg</span></dd></div>
          <div className="py-5 pl-5 border-l border-ink-700"><dt className="meta text-fg-3">vs previous 7 days</dt><dd className="text-3xl tracking-tight tabular-nums mt-1">{thisWeek && lastWeek ? `${thisWeek - lastWeek >= 0 ? '+' : '−'}${r1(Math.abs(thisWeek - lastWeek))}` : '—'}<span className="text-base text-fg-3"> kg</span></dd></div>
        </dl>
      </div>
      <div>
        {list.length >= 2 ? <LineChart data={list.slice(-60).map((w) => ({ date: w.date, value: Number(w.kg) }))} unit="kg" label="Body weight" fmtX={(d) => fmtDate(d, s.date_locale, { day: 'numeric', month: 'short' })} />
          : <Empty title="Not enough weigh-ins yet" body="Your trend appears after two weigh-ins." />}
        {list.length > 0 && (
          <ul className="border-t border-ink-700 mt-6 max-w-md">
            {[...list].reverse().slice(0, 10).map((w) => (
              <li key={w.id} className="row"><span className="flex-1 meta">{fmtDate(w.date, s.date_locale, { weekday: 'short', day: 'numeric', month: 'short' })}{diffDays(today, w.date) === 0 ? ' · today' : ''}</span><span className="tabular-nums">{r1(Number(w.kg))} kg</span>
                <button className="icon-btn hover:text-bad" aria-label={`Delete weigh-in ${w.date}`} onClick={() => store.remove('weigh_ins', w.id, { undo: 'Weigh-in deleted' })}><Icon name="trash" size={16} /></button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
