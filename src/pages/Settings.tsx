import { useEffect, useState } from 'react';
import { store, useDB, useSettings, useStore } from '../lib/store';
import { supabase } from '../lib/adapters';
import { LocalAdapter } from '../lib/adapters';
import { timezones, todayISO } from '../lib/dates';
import { BUILTIN_QUOTES } from '../lib/quotes';
import { Field, Icon, SectionHead, Toggle, confirmAction } from '../components/ui';
import { toggleFavourite } from '../components/QuoteCard';
import type { Settings } from '../lib/types';

export default function SettingsPage() {
  const s = useSettings();
  const st = useStore();
  const db = useDB();
  const [f, setF] = useState(s);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => setF(s), [s.version, s.id]);
  useEffect(() => { supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const dirty = (['display_name', 'app_title', 'timezone', 'week_start', 'date_locale', 'hour12', 'default_rest_seconds'] as (keyof Settings)[]).some((k) => f[k] !== s[k]);
  const save = () => { store.update('settings', s.id, { display_name: f.display_name.trim(), app_title: f.app_title.trim() || 'Ethan / Personal', timezone: f.timezone, week_start: f.week_start, date_locale: f.date_locale, hour12: f.hour12, default_rest_seconds: f.default_rest_seconds }); store.toast('Settings saved'); };
  const hasSamples = Object.values(db).some((rows: any[]) => rows.some((r) => r.is_sample));
  const own = db.quotes.filter((q) => q.own);
  const favs = db.quotes.filter((q) => q.favourite);

  const exportData = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ethan-personal-export-${todayISO(s.timezone)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="anim-fade max-w-3xl">
      <header className="mb-10"><p className="label mb-3">Settings</p><h1 className="h-display">Preferences</h1></header>

      <section className="mb-14">
        <SectionHead title="General" />
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Your name"><input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
            <Field label="App title" hint="Use “ / ” to split the title, e.g. EASE / Studio"><input className="input" value={f.app_title} onChange={(e) => setF({ ...f, app_title: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Timezone"><select className="input" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{timezones().map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Week starts on"><select className="input" value={f.week_start} onChange={(e) => setF({ ...f, week_start: Number(e.target.value) })}><option value={1}>Monday</option><option value={0}>Sunday</option><option value={6}>Saturday</option></select></Field>
            <Field label="Date format"><select className="input" value={f.date_locale} onChange={(e) => setF({ ...f, date_locale: e.target.value })}>
              <option value="en-AU">Australian (15/11/2026)</option><option value="en-GB">British (15/11/2026)</option><option value="en-NZ">New Zealand</option><option value="en-US">US (11/15/2026)</option>
            </select></Field>
            <Field label="Default rest (seconds)"><input className="input" type="number" inputMode="numeric" step={15} value={f.default_rest_seconds} onChange={(e) => setF({ ...f, default_rest_seconds: Number(e.target.value) || 0 })} /></Field>
          </div>
          <Toggle checked={f.hour12} onChange={(v) => setF({ ...f, hour12: v })} label="12-hour time" />
          <div className="flex gap-2"><button className="btn-primary" disabled={!dirty} onClick={save}>Save settings</button>{dirty && <button className="btn-ghost" onClick={() => setF(s)}>Cancel</button>}</div>
        </div>
      </section>

      <section className="mb-14">
        <SectionHead title="Quotes & reminders" />
        <p className="text-sm text-fg-2 mb-4">{BUILTIN_QUOTES.length} built-in lines (original, unattributed) plus your own.</p>
        <p className="label mb-2">Your own ({own.length})</p>
        <ul className="border-t border-ink-700 mb-6">
          {own.length === 0 && <li className="py-3 text-fg-3 text-sm">Add your own from the quote on Today.</li>}
          {own.map((q) => (
            <li key={q.id} className="row">
              <input className="input flex-1" aria-label="Edit quote" defaultValue={q.text} onBlur={(e) => e.target.value.trim() && e.target.value !== q.text && store.update('quotes', q.id, { text: e.target.value.trim() })} />
              <button className={`icon-btn ${q.favourite ? 'text-acid' : ''}`} aria-pressed={q.favourite} aria-label="Favourite" onClick={() => toggleFavourite({ id: q.id, text: q.text })}><Icon name="heart" size={18} /></button>
              <button className="icon-btn hover:text-bad" aria-label="Delete quote" onClick={() => store.remove('quotes', q.id, { undo: 'Quote deleted' })}><Icon name="trash" size={18} /></button>
            </li>
          ))}
        </ul>
        <p className="label mb-2">Favourites ({favs.length})</p>
        <ul className="border-t border-ink-700">
          {favs.length === 0 && <li className="py-3 text-fg-3 text-sm">Tap the heart on a quote to keep it here.</li>}
          {favs.map((q) => <li key={q.id} className="row"><span className="flex-1">{q.text}</span>
            <button className="icon-btn text-acid" aria-label="Remove from favourites" onClick={() => toggleFavourite({ id: q.builtin_id ?? q.id, text: q.text })}><Icon name="heart" size={18} /></button></li>)}
        </ul>
      </section>

      <section className="mb-14">
        <SectionHead title="Your data" />
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between py-3 border-y border-ink-700">
            <div><p>Export everything</p><p className="text-sm text-fg-2">A JSON file with every routine, check-off, event, goal, workout and review.</p></div>
            <button className="btn-outline" onClick={exportData}><Icon name="download" size={16} />Export JSON</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-between py-3 border-b border-ink-700">
            <div><p>Example data</p><p className="text-sm text-fg-2">{hasSamples ? 'Examples are loaded. Clearing keeps anything you created.' : 'No examples loaded.'}</p></div>
            {hasSamples
              ? <button className="btn-outline" onClick={async () => { if (await confirmAction({ title: 'Clear example data?', body: 'Removes the example goals, events, workouts and templates.', confirm: 'Clear examples' })) { store.clearSamples(); store.toast('Examples cleared'); } }}>Clear examples</button>
              : <button className="btn-ghost" onClick={async () => { const { loadSamples } = await import('../lib/sample'); loadSamples(store); store.toast('Examples loaded'); }}>Load examples</button>}
          </div>
        </div>
      </section>

      <section className="mb-14">
        <SectionHead title={st.mode === 'cloud' ? 'Account & sync' : 'Local demo'} />
        {st.mode === 'cloud' ? (
          <div className="space-y-3">
            <p className="text-fg-2">Signed in{email ? ` as ${email}` : ''}. Changes sync to every device you sign in on.</p>
            <p className="meta text-fg-3">{st.lastSyncedAt ? `Last synced ${new Date(st.lastSyncedAt).toLocaleTimeString(s.date_locale, { timeZone: s.timezone, hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'} · {st.pending} waiting</p>
            <div className="flex gap-2">
              <button className="btn-outline" onClick={() => store.refresh()}><Icon name="refresh" size={16} />Sync now</button>
              <button className="btn-ghost" onClick={async () => {
                if (st.pending && !(await confirmAction({ title: 'Sign out with unsaved changes?', body: `${st.pending} change(s) haven’t reached the server yet. They stay on this device and upload when you sign back in.`, confirm: 'Sign out' }))) return;
                supabase?.auth.signOut();
              }}>Sign out</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-fg-2">
            <p>This copy runs as a <span className="text-fg">local demo</span>: everything is saved in this browser on this device only. It does <span className="text-fg">not</span> sync between your phone and computer.</p>
            <p>For syncing, connect the app to its database (see the setup guide) and sign in.</p>
            <button className="btn-danger" onClick={async () => {
              if (await confirmAction({ title: 'Reset the demo?', body: 'Deletes all demo data in this browser. Export first if you want to keep it.', confirm: 'Reset demo', danger: true })) {
                LocalAdapter.wipe(); localStorage.removeItem('ep.outbox.local'); location.reload();
              }
            }}>Reset demo data</button>
          </div>
        )}
      </section>

      <section className="mb-14">
        <SectionHead title="Install on your phone" />
        <div className="text-fg-2 space-y-2 text-[15px] leading-relaxed">
          <p>iPhone: open the app in Safari → Share → <span className="text-fg">Add to Home Screen</span>. On desktop Chrome or Edge, use the install icon in the address bar.</p>
          <p>Offline: the app opens without a connection once it’s been loaded, and shows your last-synced data. Edits made offline are kept on the device and upload when you reconnect. Signing in for the first time, and seeing changes from other devices, need a connection.</p>
          <p>The rest timer keeps accurate time when you switch apps, but it can’t send a notification while the app is closed.</p>
        </div>
      </section>
    </div>
  );
}
