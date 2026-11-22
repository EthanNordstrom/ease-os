import { useState } from 'react';
import { store, useDB } from '../lib/store';
import { BUILTIN_QUOTES, hashDate } from '../lib/quotes';
import { Field, Icon, Sheet } from './ui';

export function useQuotePool() {
  const db = useDB();
  const own = db.quotes.filter((q) => q.own).map((q) => ({ id: q.id, text: q.text }));
  return [...BUILTIN_QUOTES, ...own];
}

export function toggleFavourite(q: { id: string; text: string }) {
  const db = store.state.db;
  const own = db.quotes.find((x) => x.id === q.id && x.own);
  if (own) return store.update('quotes', own.id, { favourite: !own.favourite });
  const fav = db.quotes.find((x) => x.builtin_id === q.id);
  if (fav) store.remove('quotes', fav.id);
  else store.insert('quotes', { text: q.text, builtin_id: q.id, favourite: true, own: false });
}
export function isFavourite(id: string) {
  const db = store.state.db;
  return db.quotes.some((x) => (x.id === id && x.own && x.favourite) || (x.builtin_id === id && x.favourite));
}

export default function QuoteCard({ today, compact = false }: { today: string; compact?: boolean }) {
  useDB();
  const pool = useQuotePool();
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const q = pool[(hashDate(today) + offset) % pool.length];
  const fav = isFavourite(q.id);
  const addSheet = (
    <Sheet open={adding} onClose={() => setAdding(false)} title="Add a quote or reminder"
      footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
        <button className="btn-primary" disabled={!text.trim()} onClick={() => {
          store.insert('quotes', { text: text.trim(), builtin_id: null, favourite: false, own: true });
          setText(''); setAdding(false); store.toast('Added to your daily lines');
        }}>Add</button></>}>
      <Field label="Your words" hint="Shown in the daily rotation alongside the built-in lines. Manage them in Settings.">
        <textarea className="input min-h-[96px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Finish the drop before you start a new idea." />
      </Field>
    </Sheet>
  );
  if (compact) return (
    <section aria-label="Daily line" className="-mb-4">
      <div className="flex items-center justify-between gap-2">
        <p className="label">For today</p>
        <div className="flex -mr-2">
          <button className="icon-btn" aria-label="Another line" title="Another" onClick={() => setOffset((o) => o + 1 + Math.floor(Math.random() * (pool.length - 1)))}><Icon name="refresh" size={14} /></button>
          <button className={`icon-btn ${fav ? 'text-acid hover:text-acid' : ''}`} aria-pressed={fav} aria-label={fav ? 'Remove from favourites' : 'Save to favourites'} onClick={() => toggleFavourite(q)}><Icon name="heart" size={14} /></button>
          <button className="icon-btn" aria-label="Add your own line" title="Add your own" onClick={() => setAdding(true)}><Icon name="plus" size={14} /></button>
        </div>
      </div>
      <p key={q.id} className="text-fg-2 text-[15px] leading-snug mt-0.5 anim-rise">{q.text}</p>
      {addSheet}
    </section>
  );
  return (
    <section aria-label="Daily line" className="pt-6 border-t border-ink-700">
      <p className="label mb-4">For today</p>
      <blockquote className="text-[19px] leading-snug tracking-[-0.01em] text-fg max-w-[34ch]">{q.text}</blockquote>
      <div className="flex items-center gap-1 mt-4 -ml-3">
        <button className="btn-ghost text-sm" onClick={() => setOffset((o) => o + 1 + Math.floor(Math.random() * (pool.length - 1)))}><Icon name="refresh" size={16} />Another</button>
        <button className={`icon-btn ${fav ? 'text-acid hover:text-acid' : ''}`} aria-pressed={fav} aria-label={fav ? 'Remove from favourites' : 'Save to favourites'} onClick={() => toggleFavourite(q)}>
          <Icon name="heart" size={18} />
        </button>
        <button className="btn-ghost text-sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add your own</button>
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a quote or reminder"
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          <button className="btn-primary" disabled={!text.trim()} onClick={() => {
            store.insert('quotes', { text: text.trim(), builtin_id: null, favourite: false, own: true });
            setText(''); setAdding(false); store.toast('Added to your daily lines');
          }}>Add</button></>}>
        <Field label="Your words" hint="Shown in the daily rotation alongside the built-in lines. Manage them in Settings.">
          <textarea className="input min-h-[96px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Finish the drop before you start a new idea." />
        </Field>
      </Sheet>
    </section>
  );
}
