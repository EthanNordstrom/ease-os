import { useEffect, useState } from 'react';
import { store, useDB, useSettings, useStore } from '../lib/store';
import { supabase, LocalAdapter } from '../lib/adapters';
import { timezones, todayISO } from '../lib/dates';
import { BUILTIN_QUOTES } from '../lib/quotes';
import { BRAND } from '../lib/brand';
import { setThemePref, useTheme, type ThemePref } from '../lib/theme';
import { Field, Icon, SectionHead, Segmented, Sheet, Toggle, confirmAction } from '../components/ui';
import { toggleFavourite } from '../components/QuoteCard';
import type { Settings } from '../lib/types';

/** Remove everything this app keeps in this browser (offline copy, unsent edits, timers) — except the theme choice. */
function clearDeviceData(_userId?: string | null) {
  try { Object.keys(localStorage).filter((k) => k.startsWith('ep.') && k !== 'ep.theme').forEach((k) => localStorage.removeItem(k)); } catch { /* storage unavailable */ }
}

export default function SettingsPage() {
  const s = useSettings();
  const st = useStore();
  const db = useDB();
  const theme = useTheme();
  const [f, setF] = useState(s);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  useEffect(() => setF(s), [s.version, s.id]);
  useEffect(() => { supabase?.auth.getUser().then(({ data }) => data.user && setUser({ id: data.user.id, email: data.user.email ?? null })); }, []);
  const dirty = (['display_name', 'app_title', 'timezone', 'week_start', 'date_locale', 'hour12', 'default_rest_seconds'] as (keyof Settings)[]).some((k) => f[k] !== s[k]);
  const save = () => {
    store.update('settings', s.id, { display_name: f.display_name.trim(), app_title: f.app_title.trim() || BRAND.title, timezone: f.timezone, week_start: f.week_start,
      date_locale: f.date_locale, hour12: f.hour12, default_rest_seconds: f.default_rest_seconds });
    store.toast('Settings saved');
  };
  const own = db.quotes.filter((q) => q.own);
  const favs = db.quotes.filter((q) => q.favourite);
  const tzs = timezones();

  const exportData = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ease-os-export-${todayISO(s.timezone)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const signOut = async () => {
    if (st.pending && !(await confirmAction({ title: 'Sign out with unsaved changes?', body: `${st.pending} change(s) haven’t reached the server yet. They stay on this device and upload when you sign back in.`, confirm: 'Sign out' }))) return;
    if (user) { try { localStorage.removeItem(`ep.cache.cloud.${user.id}`); } catch { /* ignore */ } }
    try { localStorage.removeItem('ep.rest'); } catch { /* ignore */ }
    history.replaceState(null, '', location.pathname);
    await supabase?.auth.signOut();
  };

  const eraseData = async () => {
    if (!(await confirmAction({ title: 'Erase all your data?', body: 'Every routine, check-off, event, goal, workout, quote and review in your account is permanently deleted, on every device. Your account stays and you start fresh. Export first if you want a copy.', confirm: 'Erase everything', danger: true }))) return;
    if (st.mode === 'local') { LocalAdapter.wipe(); clearDeviceData(); location.replace(location.pathname); return; }
    const { error } = await supabase!.rpc('erase_my_data');
    if (error) return store.toast(navigator.onLine ? `Couldn’t erase: ${error.message}` : 'You’re offline — connect and try again.', undefined, 'error');
    clearDeviceData(user?.id);
    location.replace(location.pathname);
  };

  const deleteAccount = async () => {
    if (!(await confirmAction({ title: 'Delete your account?', body: 'Your account and all of its data are permanently deleted. This can’t be undone. Export first if you want a copy.', confirm: 'Delete account', danger: true }))) return;
    const { error } = await supabase!.rpc('delete_my_account');
    if (error) return store.toast(navigator.onLine ? `Couldn’t delete: ${error.message}` : 'You’re offline — connect and try again.', undefined, 'error');
    clearDeviceData(user?.id);
    await supabase!.auth.signOut({ scope: 'local' });
    location.replace(location.pathname);
  };

  return (
    <div className="anim-fade max-w-3xl">
      <header className="mb-10"><p className="label mb-3">Settings</p><h1 className="h-display">Preferences</h1></header>

      <section className="mb-14">
        <SectionHead title="Appearance" />
        <Segmented<ThemePref> label="Theme" value={theme.pref} onChange={setThemePref}
          options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Match device' }]} />
        <p className="text-sm text-fg-3 mt-2">Saved on this device.</p>
      </section>

      <section className="mb-14">
        <SectionHead title="General" />
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Your name"><input className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="Shown in the greeting" /></Field>
            <Field label="App title" hint="Use “ / ” to split it, e.g. Studio / Life"><input className="input" value={f.app_title} onChange={(e) => setF({ ...f, app_title: e.target.value })} placeholder={BRAND.title} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Timezone"><select className="input" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{(tzs.includes(f.timezone) ? tzs : [f.timezone, ...tzs]).map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Week starts on"><select className="input" value={f.week_start} onChange={(e) => setF({ ...f, week_start: Number(e.target.value) })}><option value={1}>Monday</option><option value={0}>Sunday</option><option value={6}>Saturday</option></select></Field>
            <Field label="Date format"><select className="input" value={f.date_locale} onChange={(e) => setF({ ...f, date_locale: e.target.value })}>
              {!['en-AU', 'en-NZ', 'en-GB', 'en-IE', 'en-CA', 'en-US'].includes(f.date_locale) && <option value={f.date_locale}>{f.date_locale}</option>}
              <option value="en-AU">Australia (15/11/2026)</option><option value="en-NZ">New Zealand (15/11/2026)</option><option value="en-GB">UK (15/11/2026)</option>
              <option value="en-IE">Ireland (15/11/2026)</option><option value="en-CA">Canada (2026-11-15)</option><option value="en-US">US (11/15/2026)</option>
            </select></Field>
            <Field label="Default rest (seconds)"><input className="input" type="number" inputMode="numeric" step={15} value={f.default_rest_seconds} onChange={(e) => setF({ ...f, default_rest_seconds: Number(e.target.value) || 0 })} /></Field>
          </div>
          <Toggle checked={f.hour12} onChange={(v) => setF({ ...f, hour12: v })} label="12-hour time" />
          <div className="flex gap-2"><button className="btn-primary" disabled={!dirty} onClick={save}>Save settings</button>{dirty && <button className="btn-ghost" onClick={() => setF(s)}>Cancel</button>}</div>
        </div>
      </section>

      <section className="mb-14">
        <SectionHead title="Quotes & reminders" />
        <p className="text-sm text-fg-2 mb-4">{BUILTIN_QUOTES.length} built-in lines plus any you add.</p>
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
        <div className="flex flex-wrap items-center gap-3 justify-between py-3 border-y border-ink-700">
          <div><p>Export everything</p><p className="text-sm text-fg-2">A JSON file with every routine, check-off, event, goal, workout and review.</p></div>
          <button className="btn-outline" onClick={exportData}><Icon name="download" size={16} />Export JSON</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between py-3 border-b border-ink-700">
          <div><p>Erase all data</p><p className="text-sm text-fg-2">Start again from an empty account.</p></div>
          <button className="btn-danger" onClick={eraseData}>Erase all data</button>
        </div>
      </section>

      <section className="mb-14">
        <SectionHead title={st.mode === 'cloud' ? 'Account' : 'Local demo'} />
        {st.mode === 'cloud' ? (
          <div className="space-y-4">
            <p className="text-fg-2">Signed in{user?.email ? ` as ${user.email}` : ''}. Changes sync to every device you sign in on.</p>
            <p className="meta text-fg-3">{st.lastSyncedAt ? `Last synced ${new Date(st.lastSyncedAt).toLocaleTimeString(s.date_locale, { timeZone: s.timezone, hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'} · {st.pending} waiting</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" onClick={() => store.refresh()}><Icon name="refresh" size={16} />Sync now</button>
              <button className="btn-outline" onClick={() => setPwOpen(true)}>Change password</button>
              <button className="btn-ghost" onClick={signOut}>Sign out</button>
            </div>
            <div className="pt-4 border-t border-ink-700 flex flex-wrap items-center justify-between gap-3">
              <div><p>Delete account</p><p className="text-sm text-fg-2">Permanently removes your account and all of its data.</p></div>
              <button className="btn-danger" onClick={deleteAccount}>Delete account</button>
            </div>
          </div>
        ) : (
          <p className="text-fg-2">This copy runs as a <span className="text-fg">local demo</span>: everything is saved in this browser on this device only and does <span className="text-fg">not</span> sync.</p>
        )}
      </section>

      <section className="mb-14">
        <SectionHead title="Install on your phone" />
        <div className="text-fg-2 space-y-2 text-[15px] leading-relaxed">
          <p>iPhone: open the app in Safari → Share → <span className="text-fg">Add to Home Screen</span>. Android or desktop Chrome/Edge: use the install option in the browser menu or address bar.</p>
          <p>Offline: once loaded, the app opens without a connection and shows your last-synced data. Edits made offline are kept on the device and upload when you reconnect. Signing in, and seeing changes from other devices, need a connection.</p>
          <p>The rest timer keeps accurate time when you switch apps, but it can’t send a notification while the app is closed.</p>
        </div>
      </section>

      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw.length < 8) return setMsg('Use at least 8 characters.');
    if (pw !== pw2) return setMsg('The two passwords don’t match.');
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg(error.message); else { store.toast('Password updated'); onClose(); }
  };
  return (
    <Sheet open onClose={onClose} title="Change password"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>Save password</button></>}>
      <div className="space-y-4">
        <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {msg && <p className="text-sm text-bad" role="alert">{msg}</p>}
      </div>
    </Sheet>
  );
}
