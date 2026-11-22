import { useMemo, useState } from 'react';
import { store, uid, useDB, useSettings } from '../lib/store';
import { AISLES, SLOTS, fmtKcal, guessAisle, r0, r1, sum } from '../lib/food';
import { fmtDate } from '../lib/dates';
import type { Food, FoodLog, Ingredient, MealPlan, PlanItem, Slot } from '../lib/types';
import { Empty, Field, Icon, Segmented, Sheet, Toggle, confirmAction, num } from './ui';

const numStr = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const Footer = ({ onCancel, onSave, saveLabel = 'Save', onDelete, disabled }: { onCancel: () => void; onSave: () => void; saveLabel?: string; onDelete?: () => void; disabled?: boolean }) => (
  <>
    {onDelete && <button className="btn-danger mr-auto" onClick={onDelete}><Icon name="trash" size={16} />Delete</button>}
    <button className="btn-ghost" onClick={onCancel}>Cancel</button>
    <button className="btn-primary" onClick={onSave} disabled={disabled}>{saveLabel}</button>
  </>
);

/** Log a saved food (or a quick entry) to a date and meal. */
export function logFood(date: string, slot: Slot, f: Pick<Food, 'name' | 'calories' | 'protein' | 'carbs' | 'fat'> & { id?: string }, servings: number) {
  return store.insert('food_logs', {
    date, slot, food_id: f.id ?? null, name: f.name, servings,
    calories: r1(Number(f.calories) * servings), protein: r1(Number(f.protein) * servings), carbs: r1(Number(f.carbs) * servings), fat: r1(Number(f.fat) * servings),
  });
}

/* ---------------- Add food to a day ---------------- */
export function AddFoodSheet({ date, slot: initialSlot, onClose }: { date: string; slot: Slot; onClose: () => void }) {
  const db = useDB();
  const s = useSettings();
  const [slot, setSlot] = useState<Slot>(initialSlot);
  const [tab, setTab] = useState<'saved' | 'quick'>(db.foods.length ? 'saved' : 'quick');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [servings, setServings] = useState('1');
  const [quick, setQuick] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', save: false });
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const foods = useMemo(() => [...db.foods].filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)), [db.foods, q]);
  const sv = num(servings) ?? 0;

  const addPicked = () => {
    if (!picked || sv <= 0) return;
    logFood(date, slot, picked, sv);
    store.toast(`Added ${picked.name}`);
    onClose();
  };
  const addQuick = () => {
    const cal = num(quick.calories);
    if (!quick.name.trim() || cal === null) return;
    const base = { name: quick.name.trim(), calories: cal, protein: num(quick.protein) ?? 0, carbs: num(quick.carbs) ?? 0, fat: num(quick.fat) ?? 0 };
    const saved = quick.save ? store.insert('foods', { ...base, kind: 'food', serving: '1 serve', servings_per_batch: 1, ingredients: [], method: '', favourite: false }) : null;
    logFood(date, slot, { ...base, id: saved?.id }, 1);
    store.toast(`Added ${base.name}`);
    onClose();
  };

  return (
    <>
      <Sheet open onClose={onClose} title={`Add food · ${fmtDate(date, s.date_locale, { weekday: 'short', day: 'numeric', month: 'short' })}`}
        footer={tab === 'saved'
          ? <Footer onCancel={onClose} onSave={addPicked} disabled={!picked || sv <= 0} saveLabel={picked ? `Add ${fmtKcal(Number(picked.calories) * sv, s.date_locale)} kcal` : 'Add'} />
          : <Footer onCancel={onClose} onSave={addQuick} disabled={!quick.name.trim() || num(quick.calories) === null} saveLabel="Add" />}>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Meal">
            {SLOTS.map((m) => (
              <button key={m.key} role="radio" aria-checked={slot === m.key} onClick={() => setSlot(m.key)}
                className={`h-10 px-3.5 rounded-full border text-sm transition-all duration-150 active:scale-95 ${slot === m.key ? 'border-fg-2 bg-ink-800 text-fg' : 'border-ink-600 text-fg-2 hover:text-fg'}`}>{m.label}</button>
            ))}
          </div>
          <Segmented label="Add from" value={tab} onChange={setTab} options={[{ value: 'saved', label: 'My foods' }, { value: 'quick', label: 'Quick add' }]} />

          {tab === 'saved' ? (
            <div>
              <div className="flex gap-2 mb-3">
                <input className="input" placeholder="Search your foods" aria-label="Search your foods" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn-outline shrink-0" onClick={() => setEditing('new')}><Icon name="plus" size={16} />New</button>
              </div>
              {!db.foods.length ? <Empty title="No saved foods yet" body="Save foods and meals you eat often, then add them in two taps." action={<button className="btn-primary" onClick={() => setEditing('new')}>Create a food</button>} /> : (
                <ul className="border-t border-ink-700 max-h-[42vh] overflow-y-auto">
                  {foods.map((f) => (
                    <li key={f.id}>
                      <button onClick={() => { setPicked(f); setServings('1'); }} aria-pressed={picked?.id === f.id}
                        className={`row w-full text-left px-2 -mx-0 ${picked?.id === f.id ? 'bg-ink-800' : 'hover:bg-ink-850'}`}>
                        <span className={`w-4 h-4 rounded-full border shrink-0 grid place-items-center ${picked?.id === f.id ? 'bg-acid border-acid' : 'border-ink-500'}`}>{picked?.id === f.id && <span className="w-1.5 h-1.5 rounded-full bg-acid-ink" />}</span>
                        <span className="flex-1 min-w-0"><span className="block truncate">{f.favourite ? '★ ' : ''}{f.name}</span><span className="meta text-fg-3">{f.serving}</span></span>
                        <span className="meta text-right shrink-0">{fmtKcal(Number(f.calories), s.date_locale)} kcal<span className="block text-fg-3">{r0(Number(f.protein))} g protein</span></span>
                      </button>
                    </li>
                  ))}
                  {!foods.length && <li className="py-4 text-sm text-fg-3">No matches. Try Quick add.</li>}
                </ul>
              )}
              {picked && (
                <div className="mt-4 flex items-end gap-3 anim-rise">
                  <Field label={`Servings (${picked.serving})`} className="w-40"><input className="input" type="number" inputMode="decimal" step="0.25" min="0.25" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
                  <p className="meta pb-3">{fmtKcal(Number(picked.calories) * sv, s.date_locale)} kcal · {r0(Number(picked.protein) * sv)} g protein</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="What did you eat?"><input className="input" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder="e.g. Chicken wrap" /></Field>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Calories"><input className="input" type="number" inputMode="numeric" value={quick.calories} onChange={(e) => setQuick({ ...quick, calories: e.target.value })} /></Field>
                <Field label="Protein g"><input className="input" type="number" inputMode="decimal" value={quick.protein} onChange={(e) => setQuick({ ...quick, protein: e.target.value })} /></Field>
                <Field label="Carbs g"><input className="input" type="number" inputMode="decimal" value={quick.carbs} onChange={(e) => setQuick({ ...quick, carbs: e.target.value })} /></Field>
                <Field label="Fat g"><input className="input" type="number" inputMode="decimal" value={quick.fat} onChange={(e) => setQuick({ ...quick, fat: e.target.value })} /></Field>
              </div>
              <Toggle checked={quick.save} onChange={(v) => setQuick({ ...quick, save: v })} label="Also save to my foods" />
            </div>
          )}
        </div>
      </Sheet>
      {editing && <FoodEditor food={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(f) => { setTab('saved'); setPicked(f); setServings('1'); }} />}
    </>
  );
}

/* ---------------- Edit a logged entry ---------------- */
export function LogEntrySheet({ entry, onClose }: { entry: FoodLog; onClose: () => void }) {
  const s = useSettings();
  const per = (v: number) => Number(v) / Number(entry.servings || 1);
  const [servings, setServings] = useState(String(entry.servings));
  const [slot, setSlot] = useState<Slot>(entry.slot);
  const sv = num(servings) ?? 0;
  const save = () => {
    if (sv <= 0) return;
    store.update('food_logs', entry.id, { slot, servings: sv, calories: r1(per(entry.calories) * sv), protein: r1(per(entry.protein) * sv), carbs: r1(per(entry.carbs) * sv), fat: r1(per(entry.fat) * sv) });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={entry.name}
      footer={<Footer onCancel={onClose} onSave={save} disabled={sv <= 0} onDelete={() => { store.remove('food_logs', entry.id, { undo: `Removed ${entry.name}` }); onClose(); }} />}>
      <div className="space-y-5">
        <Segmented<Slot> label="Meal" value={slot} onChange={setSlot} options={SLOTS.map((m) => ({ value: m.key, label: m.label }))} />
        <div className="flex items-end gap-3">
          <Field label="Servings" className="w-40"><input className="input" type="number" inputMode="decimal" step="0.25" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
          <p className="meta pb-3">{fmtKcal(per(entry.calories) * sv, s.date_locale)} kcal · {r0(per(entry.protein) * sv)} g protein</p>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Daily targets ---------------- */
export function GoalsSheet({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const g = db.nutrition_goals[0];
  const [f, setF] = useState({ calories: numStr(g?.calories ?? null), protein: numStr(g?.protein), carbs: numStr(g?.carbs), fat: numStr(g?.fat) });
  const cal = num(f.calories);
  const valid = cal !== null && cal >= 500 && cal <= 10000;
  const save = () => {
    if (!valid) return;
    const data = { calories: Math.round(cal!), protein: num(f.protein) === null ? null : Math.round(num(f.protein)!), carbs: num(f.carbs) === null ? null : Math.round(num(f.carbs)!), fat: num(f.fat) === null ? null : Math.round(num(f.fat)!) };
    if (g) store.update('nutrition_goals', g.id, data); else store.insert('nutrition_goals', data);
    store.toast('Daily targets saved');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Daily targets" footer={<Footer onCancel={onClose} onSave={save} disabled={!valid} />}>
      <div className="space-y-5">
        <Field label="Calories per day" hint="Between 500 and 10,000."><input className="input" type="number" inputMode="numeric" value={f.calories} onChange={(e) => setF({ ...f, calories: e.target.value })} placeholder="e.g. 3500" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Protein g"><input className="input" type="number" inputMode="numeric" value={f.protein} onChange={(e) => setF({ ...f, protein: e.target.value })} placeholder="optional" /></Field>
          <Field label="Carbs g"><input className="input" type="number" inputMode="numeric" value={f.carbs} onChange={(e) => setF({ ...f, carbs: e.target.value })} placeholder="optional" /></Field>
          <Field label="Fat g"><input className="input" type="number" inputMode="numeric" value={f.fat} onChange={(e) => setF({ ...f, fat: e.target.value })} placeholder="optional" /></Field>
        </div>
        <p className="text-sm text-fg-3 leading-relaxed">Set whatever target fits your plan. Weekly averages matter more than any single day. If you have health conditions or a history with dieting, a doctor or dietitian can help you choose.</p>
      </div>
    </Sheet>
  );
}

/* ---------------- Saved food / meal / recipe ---------------- */
export function FoodEditor({ food, onClose, onSaved }: { food: Food | null; onClose: () => void; onSaved?: (f: Food) => void }) {
  const [f, setF] = useState({
    name: food?.name ?? '', kind: food?.kind ?? ('food' as Food['kind']), serving: food?.serving ?? '1 serve',
    calories: numStr(food?.calories), protein: numStr(food?.protein), carbs: numStr(food?.carbs), fat: numStr(food?.fat),
    servings_per_batch: String(food?.servings_per_batch ?? 4), ingredients: food?.ingredients ?? ([] as Ingredient[]), method: food?.method ?? '', favourite: food?.favourite ?? false,
  });
  const [ing, setIng] = useState({ name: '', amount: '' });
  const [shopOpen, setShopOpen] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const valid = f.name.trim() && num(f.calories) !== null;
  const addIng = () => { if (!ing.name.trim()) return; set({ ingredients: [...f.ingredients, { id: uid(), name: ing.name.trim(), amount: ing.amount.trim() }] }); setIng({ name: '', amount: '' }); };
  const save = () => {
    if (!valid) return;
    const data = {
      name: f.name.trim(), kind: f.kind, serving: f.serving.trim() || '1 serve',
      calories: num(f.calories) ?? 0, protein: num(f.protein) ?? 0, carbs: num(f.carbs) ?? 0, fat: num(f.fat) ?? 0,
      servings_per_batch: f.kind === 'recipe' ? Math.max(1, Math.round(num(f.servings_per_batch) ?? 1)) : 1,
      ingredients: f.kind === 'recipe' ? f.ingredients : [], method: f.kind === 'recipe' ? f.method : '', favourite: f.favourite,
    };
    if (food) { store.update('foods', food.id, data); onSaved?.({ ...food, ...data }); }
    else { const n = store.insert('foods', data); onSaved?.(n); }
    store.toast(food ? 'Saved' : `${data.name} saved to your foods`);
    onClose();
  };
  const del = async () => {
    if (!food) return;
    if (!(await confirmAction({ title: `Delete “${food.name}”?`, body: 'Days you already logged keep their numbers. Day plans that include it will skip it.', confirm: 'Delete', danger: true }))) return;
    store.remove('foods', food.id, { undo: 'Food deleted' });
    onClose();
  };
  return (
    <>
      <Sheet open onClose={onClose} wide title={food ? `Edit ${f.kind}` : 'New food, meal or recipe'}
        footer={<Footer onCancel={onClose} onSave={save} disabled={!valid} onDelete={food ? del : undefined} />}>
        <div className="space-y-5">
          <Segmented<Food['kind']> label="Type" value={f.kind} onChange={(v) => set({ kind: v })}
            options={[{ value: 'food', label: 'Food' }, { value: 'meal', label: 'Meal' }, { value: 'recipe', label: 'Recipe' }]} />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
            <Field label="Name"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={f.kind === 'recipe' ? 'e.g. Beef taco pasta' : f.kind === 'meal' ? 'e.g. Peanut butter banana oats' : 'e.g. Greek yoghurt 170 g'} /></Field>
            <Field label="Serving"><input className="input" value={f.serving} onChange={(e) => set({ serving: e.target.value })} placeholder="1 serve" /></Field>
          </div>
          <div>
            <span className="label block mb-1.5">Per serving</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Calories"><input className="input" type="number" inputMode="numeric" value={f.calories} onChange={(e) => set({ calories: e.target.value })} /></Field>
              <Field label="Protein g"><input className="input" type="number" inputMode="decimal" value={f.protein} onChange={(e) => set({ protein: e.target.value })} /></Field>
              <Field label="Carbs g"><input className="input" type="number" inputMode="decimal" value={f.carbs} onChange={(e) => set({ carbs: e.target.value })} /></Field>
              <Field label="Fat g"><input className="input" type="number" inputMode="decimal" value={f.fat} onChange={(e) => set({ fat: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-fg-3 mt-2">Use the numbers from the label, or your best estimate.</p>
          </div>
          {f.kind === 'recipe' && (
            <>
              <Field label="Serves (per batch)" className="w-40"><input className="input" type="number" inputMode="numeric" min={1} value={f.servings_per_batch} onChange={(e) => set({ servings_per_batch: e.target.value })} /></Field>
              <div>
                <span className="label block mb-2">Ingredients for one batch</span>
                <ul className="border-t border-ink-700">
                  {f.ingredients.map((it, i) => (
                    <li key={it.id} className="row">
                      <input className="input flex-1" aria-label={`Ingredient ${i + 1}`} value={it.name} onChange={(e) => set({ ingredients: f.ingredients.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)) })} />
                      <input className="input w-28" aria-label={`Amount for ${it.name}`} value={it.amount} onChange={(e) => set({ ingredients: f.ingredients.map((x) => (x.id === it.id ? { ...x, amount: e.target.value } : x)) })} />
                      <button className="icon-btn hover:text-bad" aria-label={`Remove ${it.name}`} onClick={() => set({ ingredients: f.ingredients.filter((x) => x.id !== it.id) })}><Icon name="trash" size={16} /></button>
                    </li>
                  ))}
                </ul>
                <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); addIng(); }}>
                  <input className="input flex-1" aria-label="New ingredient" placeholder="Ingredient" value={ing.name} onChange={(e) => setIng({ ...ing, name: e.target.value })} />
                  <input className="input w-28" aria-label="Amount" placeholder="600 g" value={ing.amount} onChange={(e) => setIng({ ...ing, amount: e.target.value })} />
                  <button className="btn-outline shrink-0" disabled={!ing.name.trim()}>Add</button>
                </form>
              </div>
              <Field label="Method (optional)"><textarea className="input min-h-[120px]" value={f.method} onChange={(e) => set({ method: e.target.value })} placeholder="1. Boil the pasta…" /></Field>
              {f.ingredients.length > 0 && <button className="btn-outline" onClick={() => setShopOpen(true)}><Icon name="list" size={16} />Add ingredients to shopping list</button>}
            </>
          )}
          <Toggle checked={f.favourite} onChange={(v) => set({ favourite: v })} label="Favourite (shown first)" />
        </div>
      </Sheet>
      {shopOpen && <RecipeToShopping name={f.name || 'Recipe'} ingredients={f.ingredients} onClose={() => setShopOpen(false)} />}
    </>
  );
}

/** Add a recipe's ingredients to the shopping list, skipping anything already on it. */
export function addToShopping(items: { name: string; amount: string }[], source: string) {
  const open = store.state.db.shopping_items.filter((x) => !x.done);
  let added = 0;
  items.forEach((it) => {
    const existing = open.find((x) => x.name.toLowerCase() === it.name.toLowerCase());
    if (existing) {
      if (it.amount && !existing.amount.includes(it.amount)) store.update('shopping_items', existing.id, { amount: existing.amount ? `${existing.amount} + ${it.amount}` : it.amount });
      return;
    }
    store.insert('shopping_items', { name: it.name, amount: it.amount, aisle: guessAisle(it.name), done: false, source, sort: 0 });
    added++;
  });
  return added;
}

export function RecipeToShopping({ name, ingredients, onClose }: { name: string; ingredients: Ingredient[]; onClose: () => void }) {
  const [batches, setBatches] = useState(1);
  const scale = (amount: string) => {
    if (batches === 1) return amount;
    const m = amount.match(/^([\d.]+)\s*(.*)$/);
    return m ? `${r1(Number(m[1]) * batches)}${m[2] ? ' ' + m[2] : ''}` : `${amount} ×${batches}`;
  };
  return (
    <Sheet open onClose={onClose} title="Add to shopping list"
      footer={<Footer onCancel={onClose} saveLabel={`Add ${ingredients.length} items`} onSave={() => {
        const n = addToShopping(ingredients.map((i) => ({ name: i.name, amount: scale(i.amount) })), name);
        store.toast(n ? `Added ${n} item${n > 1 ? 's' : ''} to your list` : 'Everything is already on your list');
        onClose();
      }} />}>
      <div className="flex items-center gap-3 mb-4">
        <span className="label">Batches</span>
        <button className="icon-btn border border-ink-600" aria-label="Fewer batches" onClick={() => setBatches((b) => Math.max(1, b - 1))}><span className="text-xl leading-none">−</span></button>
        <span className="w-8 text-center tabular-nums">{batches}</span>
        <button className="icon-btn border border-ink-600" aria-label="More batches" onClick={() => setBatches((b) => Math.min(10, b + 1))}><Icon name="plus" size={16} /></button>
      </div>
      <ul className="border-t border-ink-700">
        {ingredients.map((i) => <li key={i.id} className="row"><span className="flex-1">{i.name}</span><span className="meta">{scale(i.amount)}</span></li>)}
      </ul>
    </Sheet>
  );
}

/* ---------------- Day plans ---------------- */
export function PlanEditor({ plan, onClose }: { plan: MealPlan | null; onClose: () => void }) {
  const db = useDB();
  const s = useSettings();
  const [name, setName] = useState(plan?.name ?? 'My usual day');
  const [items, setItems] = useState<PlanItem[]>(plan?.items ?? []);
  const [pick, setPick] = useState({ food_id: db.foods[0]?.id ?? '', slot: 'breakfast' as Slot, servings: '1' });
  const foodById = new Map(db.foods.map((f) => [f.id, f]));
  const totals = sum(items.map((it) => { const f = foodById.get(it.food_id); return f ? { calories: Number(f.calories) * it.servings, protein: Number(f.protein) * it.servings, carbs: Number(f.carbs) * it.servings, fat: Number(f.fat) * it.servings } : { calories: 0, protein: 0, carbs: 0, fat: 0 }; }));
  const save = () => {
    if (!name.trim()) return;
    if (plan) store.update('meal_plans', plan.id, { name: name.trim(), items }); else store.insert('meal_plans', { name: name.trim(), items });
    store.toast('Day plan saved');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} wide title={plan ? 'Edit day plan' : 'New day plan'}
      footer={<Footer onCancel={onClose} onSave={save} disabled={!name.trim()} onDelete={plan ? () => { store.remove('meal_plans', plan.id, { undo: 'Plan deleted' }); onClose(); } : undefined} />}>
      <div className="space-y-5">
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="meta">Total: {fmtKcal(totals.calories, s.date_locale)} kcal · {r0(totals.protein)} g protein</p>
        {SLOTS.map((m) => {
          const list = items.filter((i) => i.slot === m.key);
          if (!list.length) return null;
          return (
            <div key={m.key}>
              <p className="label mb-1">{m.label}</p>
              <ul className="border-t border-ink-700">
                {list.map((it) => {
                  const f = foodById.get(it.food_id);
                  return (
                    <li key={it.id} className="row">
                      <span className="flex-1 min-w-0 truncate">{f?.name ?? 'Deleted food'}</span>
                      <input className="input w-20 text-center" type="number" inputMode="decimal" step="0.25" aria-label={`Servings of ${f?.name}`} value={it.servings}
                        onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, servings: num(e.target.value) ?? 1 } : x)))} />
                      <span className="meta w-20 text-right">{f ? fmtKcal(Number(f.calories) * it.servings, s.date_locale) : 0} kcal</span>
                      <button className="icon-btn hover:text-bad" aria-label="Remove" onClick={() => setItems(items.filter((x) => x.id !== it.id))}><Icon name="trash" size={16} /></button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {!db.foods.length ? <p className="text-sm text-fg-2">Save some foods or meals first, then build a day from them.</p> : (
          <div className="surface p-3 grid grid-cols-1 sm:grid-cols-[1fr_140px_90px_auto] gap-2 items-end">
            <Field label="Food"><select className="input" value={pick.food_id} onChange={(e) => setPick({ ...pick, food_id: e.target.value })}>{db.foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
            <Field label="Meal"><select className="input" value={pick.slot} onChange={(e) => setPick({ ...pick, slot: e.target.value as Slot })}>{SLOTS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></Field>
            <Field label="Servings"><input className="input" type="number" inputMode="decimal" step="0.25" value={pick.servings} onChange={(e) => setPick({ ...pick, servings: e.target.value })} /></Field>
            <button className="btn-outline" onClick={() => pick.food_id && setItems([...items, { id: uid(), food_id: pick.food_id, slot: pick.slot, servings: num(pick.servings) ?? 1 }])}>Add</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function logPlan(plan: MealPlan, date: string) {
  const foods = new Map(store.state.db.foods.map((f) => [f.id, f]));
  let n = 0;
  plan.items.forEach((it) => { const f = foods.get(it.food_id); if (f) { logFood(date, it.slot, f, it.servings); n++; } });
  return n;
}

export { AISLES };
