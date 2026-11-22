import { useState } from 'react';
import { store, DEFAULT_SETTINGS } from '../lib/store';
import { timezones } from '../lib/dates';
import { Field, ThemeToggle } from '../components/ui';
import { BRAND } from '../lib/brand';
import { getAccent, getThemePref } from '../lib/theme';

const LOCALES: [string, string][] = [
  ['en-AU', 'Australia (15/11/2026)'], ['en-NZ', 'New Zealand (15/11/2026)'], ['en-GB', 'UK (15/11/2026)'],
  ['en-IE', 'Ireland (15/11/2026)'], ['en-CA', 'Canada (2026-11-15)'], ['en-US', 'US (11/15/2026)'],
];

/** First run for a new account: everyone sets up their own space. */
export default function Welcome() {
  const detected = DEFAULT_SETTINGS.date_locale;
  const [f, setF] = useState({
    display_name: '', timezone: DEFAULT_SETTINGS.timezone, week_start: 1,
    date_locale: LOCALES.some(([l]) => l === detected) ? detected : 'en-AU', hour12: detected === 'en-US',
  });
  const tzs = timezones();
  const start = (e: React.FormEvent) => {
    e.preventDefault();
    store.insert('settings', { ...DEFAULT_SETTINGS, ...f, display_name: f.display_name.trim(), theme: getThemePref(), accent: getAccent(), ui: {} });
  };
  return (
    <div className="min-h-[100dvh] flex flex-col justify-center px-6 py-12 pt-safe relative">
      <ThemeToggle className="absolute right-3 top-[max(12px,var(--safe-top))]" />
      <form onSubmit={start} className="w-full max-w-md mx-auto anim-fade">
        <p className="label mb-6">{BRAND.name}</p>
        <h1 className="h-display">Welcome.</h1>
        <p className="text-fg-2 mt-3 mb-10 text-[17px] leading-relaxed">A calm place for your routines, goals and training. It starts empty — you set it up your way.</p>
        <div className="space-y-5">
          <Field label="What should we call you?"><input className="input" autoComplete="given-name" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="Your first name (optional)" /></Field>
          <Field label="Timezone" hint="Used for “today”, routines and deadlines.">
            <select className="input" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
              {(tzs.includes(f.timezone) ? tzs : [f.timezone, ...tzs]).map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Week starts">
              <select className="input" value={f.week_start} onChange={(e) => setF({ ...f, week_start: Number(e.target.value) })}><option value={1}>Monday</option><option value={0}>Sunday</option><option value={6}>Saturday</option></select>
            </Field>
            <Field label="Date format">
              <select className="input" value={f.date_locale} onChange={(e) => setF({ ...f, date_locale: e.target.value })}>{LOCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
          </div>
          <button className="btn-primary w-full mt-2">Get started</button>
          <p className="text-sm text-fg-3">You can change all of this later in Settings.</p>
        </div>
      </form>
    </div>
  );
}
