import { useState } from 'react';
import { store, useDB } from '../lib/store';
import { TAG_COLORS, tagHex } from '../lib/palette';
import type { Tag } from '../lib/types';
import { Empty, Field, Icon, Sheet, confirmAction } from './ui';

/** Create or edit a tag: a name plus one of the palette colours. */
export function TagEditor({ tag, onClose, onSaved }: { tag?: Tag | null; onClose: () => void; onSaved?: (t: Tag) => void }) {
  const db = useDB();
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color ?? TAG_COLORS[(db.tags.length * 3) % TAG_COLORS.length].key);
  const clean = name.trim().slice(0, 40);
  const duplicate = db.tags.some((t) => t.id !== tag?.id && t.name.toLowerCase() === clean.toLowerCase());
  const save = () => {
    if (!clean || duplicate) return;
    if (tag) { store.update('tags', tag.id, { name: clean, color }); onSaved?.({ ...tag, name: clean, color }); }
    else { const t = store.insert('tags', { name: clean, color, sort: db.tags.length }); onSaved?.(t); }
    store.toast(tag ? 'Tag updated' : 'Tag created');
    onClose();
  };
  const del = async () => {
    if (!tag) return;
    const used = db.events.filter((e) => e.tag_id === tag.id).length;
    if (!(await confirmAction({ title: `Delete “${tag.name}”?`, body: used ? `${used} event${used > 1 ? 's' : ''} will keep their details but lose this tag.` : 'This tag isn’t used by any events.', confirm: 'Delete tag', danger: true }))) return;
    store.remove('tags', tag.id, { undo: 'Tag deleted' });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={tag ? 'Edit tag' : 'New tag'}
      footer={<>
        {tag && <button className="btn-danger mr-auto" onClick={del}><Icon name="trash" size={16} />Delete</button>}
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!clean || duplicate} onClick={save}>{tag ? 'Save' : 'Create tag'}</button>
      </>}>
      <div className="space-y-6">
        <Field label="Name"><input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Studio, Work, Family" /></Field>
        {duplicate && <p className="text-sm text-bad -mt-4">You already have a tag with that name.</p>}
        <div>
          <span className="label block mb-3">Colour</span>
          <div role="radiogroup" aria-label="Tag colour" className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {TAG_COLORS.map((c) => (
              <button key={c.key} role="radio" aria-checked={color === c.key} aria-label={c.name} title={c.name} onClick={() => setColor(c.key)}
                className={`relative aspect-square min-h-[44px] rounded-full grid place-items-center transition-transform duration-150 hover:scale-110 active:scale-95 ${color === c.key ? 'ring-2 ring-offset-2 ring-offset-ink-900 ring-fg' : ''}`}
                style={{ background: c.hex }}>
                {color === c.key && <Icon name="check" size={16} strokeWidth={2.6} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label block mb-2">Preview</span>
          <TagChip name={clean || 'Tag name'} color={color} />
        </div>
      </div>
    </Sheet>
  );
}

export function TagChip({ name, color, active = true }: { name: string; color: string; active?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border text-sm ${active ? 'border-ink-500 text-fg' : 'border-ink-700 text-fg-3'}`}>
      <span className="w-2 h-2 rounded-full" style={{ background: tagHex(color) }} />{name}
    </span>
  );
}

/** List of the user's tags with edit and create. */
export function TagManager({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [editing, setEditing] = useState<Tag | 'new' | null>(null);
  const tags = [...db.tags].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  return (
    <>
      <Sheet open onClose={onClose} title="Tags" footer={<><button className="btn-ghost" onClick={onClose}>Done</button><button className="btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />New tag</button></>}>
        <p className="text-sm text-fg-2 mb-4">Tags are your own calendar categories. Pick one when you create or edit an event, and filter the calendar by it.</p>
        {!tags.length ? <Empty title="No tags yet" body="Create one for anything you want to colour-code." /> : (
          <ul className="border-t border-ink-700">
            {tags.map((t) => (
              <li key={t.id}>
                <button className="row w-full text-left" onClick={() => setEditing(t)}>
                  <span className="w-3 h-3 rounded-full" style={{ background: tagHex(t.color) }} />
                  <span className="flex-1">{t.name}</span>
                  <span className="meta text-fg-3">{db.events.filter((e) => e.tag_id === t.id).length} events</span>
                  <Icon name="edit" size={16} className="text-fg-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      {editing && <TagEditor tag={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
