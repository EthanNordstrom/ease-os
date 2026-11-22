import { useState } from 'react';
import { store, useDB } from '../lib/store';
import { AISLES, guessAisle } from '../lib/food';
import type { Aisle, ShoppingItem } from '../lib/types';
import { CheckButton, Empty, Field, Icon, Sheet, confirmAction } from '../components/ui';

export function addShoppingItem(name: string, amount = '', source = '') {
  const n = name.trim();
  if (!n) return null;
  const dup = store.state.db.shopping_items.find((x) => !x.done && x.name.toLowerCase() === n.toLowerCase());
  if (dup) { store.toast(`${n} is already on your list`); return dup; }
  return store.insert('shopping_items', { name: n, amount: amount.trim(), aisle: guessAisle(n), done: false, source, sort: 0 });
}

export default function Shopping() {
  const db = useDB();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [edit, setEdit] = useState<ShoppingItem | null>(null);
  const open = db.shopping_items.filter((x) => !x.done);
  const done = db.shopping_items.filter((x) => x.done);
  const add = (e: React.FormEvent) => { e.preventDefault(); if (addShoppingItem(name, amount)) { setName(''); setAmount(''); } };
  const toggle = (x: ShoppingItem) => store.update('shopping_items', x.id, { done: !x.done });

  return (
    <div className="anim-fade max-w-3xl mx-auto">
      <header className="mb-8">
        <p className="label mb-3">Shopping list</p>
        <h1 className="h-display">{open.length ? `${open.length} to get.` : 'All sorted.'}</h1>
      </header>
      <form onSubmit={add} className="flex flex-wrap sm:flex-nowrap gap-2 mb-10">
        <label className="sr-only" htmlFor="shop-name">Item</label>
        <input id="shop-name" className="input flex-1 min-w-[180px]" placeholder="Add an item, e.g. Bananas" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="sr-only" htmlFor="shop-amount">Amount</label>
        <input id="shop-amount" className="input sm:w-32 flex-1 sm:flex-none" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={!name.trim()}><Icon name="plus" size={16} />Add</button>
      </form>

      {!db.shopping_items.length && <Empty title="Your list is empty" body="Add items here, from Today, or straight from a recipe’s ingredients." />}

      <div className="space-y-8">
        {AISLES.map((a) => {
          const items = open.filter((x) => x.aisle === a.key).sort((p, q) => p.created_at.localeCompare(q.created_at));
          if (!items.length) return null;
          return (
            <section key={a.key} aria-label={a.label}>
              <p className="label pb-2 border-b border-ink-700">{a.label} · {items.length}</p>
              <ul className="stagger">
                {items.map((x) => (
                  <li key={x.id} className="row">
                    <CheckButton checked={false} label={`Got ${x.name}`} onClick={() => toggle(x)} />
                    <button className="flex-1 min-w-0 text-left min-h-[44px]" onClick={() => setEdit(x)}>
                      <span className="block truncate">{x.name}</span>
                      {(x.amount || x.source) && <span className="meta text-fg-3 truncate block">{[x.amount, x.source && `for ${x.source}`].filter(Boolean).join(' · ')}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {done.length > 0 && (
        <section className="mt-12" aria-label="In the trolley">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-ink-700">
            <p className="label">In the trolley · {done.length}</p>
            <button className="btn-ghost -mr-3 text-sm" onClick={async () => {
              if (done.length > 3 && !(await confirmAction({ title: `Clear ${done.length} ticked items?`, body: 'They’ll be removed from the list.', confirm: 'Clear' }))) return;
              const rows = [...done];
              rows.forEach((x) => store.remove('shopping_items', x.id));
              store.toast(`Cleared ${rows.length} item${rows.length > 1 ? 's' : ''}`, { label: 'Undo', run: () => rows.forEach((x) => store.insert('shopping_items', { ...x })) });
            }}>Clear ticked</button>
          </div>
          <ul>
            {done.map((x) => (
              <li key={x.id} className="row">
                <CheckButton checked label={`Put back ${x.name}`} onClick={() => toggle(x)} />
                <span className="flex-1 text-fg-3 line-through decoration-ink-500 truncate">{x.name}{x.amount && ` · ${x.amount}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {edit && <EditItem item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditItem({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const [f, setF] = useState({ name: item.name, amount: item.amount, aisle: item.aisle });
  const save = () => { if (!f.name.trim()) return; store.update('shopping_items', item.id, { name: f.name.trim(), amount: f.amount.trim(), aisle: f.aisle }); onClose(); };
  return (
    <Sheet open onClose={onClose} title="Edit item" footer={<>
      <button className="btn-danger mr-auto" onClick={() => { store.remove('shopping_items', item.id, { undo: `Removed ${item.name}` }); onClose(); }}><Icon name="trash" size={16} />Remove</button>
      <button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.name.trim()} onClick={save}>Save</button></>}>
      <div className="space-y-5">
        <Field label="Item"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Amount"><input className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="optional" /></Field>
        <Field label="Aisle"><select className="input" value={f.aisle} onChange={(e) => setF({ ...f, aisle: e.target.value as Aisle })}>{AISLES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></Field>
      </div>
    </Sheet>
  );
}
