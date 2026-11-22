import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CloudAdapter, LocalAdapter, cloudConfigured, supabase } from './lib/adapters';
import { store, useStore, useSettings } from './lib/store';
import { navigate, useRoute } from './lib/router';
import { ConfirmHost, Field, Icon, SaveIndicator, Sheet, SyncIssues, ThemeToggle, Toasts } from './components/ui';
import Welcome from './pages/Welcome';
import Intro, { resetIntro, shouldShowIntro } from './components/Intro';
import { addDays, nowParts, todayISO } from './lib/dates';
import { moneySettings, pendingAutoTransfers, repeatDates } from './lib/money';
import { applyRemotePrefs } from './lib/prefs';
import { BRAND } from './lib/brand';
import { EditorHost, openEditor } from './components/editors';
import Today from './pages/Today';
import { confirmAction } from './components/ui';
// Everything except Today loads on demand, so the first screen appears fast.
const Routines = lazy(() => import('./pages/Routines'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Goals = lazy(() => import('./pages/Goals'));
const Gym = lazy(() => import('./pages/Gym'));
const Review = lazy(() => import('./pages/Review'));
const FoodPage = lazy(() => import('./pages/Food'));
const Money = lazy(() => import('./pages/Money'));
const Shopping = lazy(() => import('./pages/Shopping'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Auth = lazy(() => import('./pages/Auth'));

const PRIMARY = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'gym', label: 'Gym', icon: 'gym' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
];
const SECONDARY = [
  { id: 'money', label: 'Money', icon: 'money' },
  { id: 'shopping', label: 'Shopping list', icon: 'cart' },
  { id: 'routines', label: 'Routines', icon: 'routine' },
  { id: 'review', label: 'Weekly review', icon: 'review' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(cloudConfigured ? undefined : null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) { store.start(new LocalAdapter(), null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    store.start(new CloudAdapter(supabase, userId), userId);
    return () => store.stop();
  }, [userId]);

  if (cloudConfigured && session === undefined) return <Splash />;
  if (cloudConfigured && !session) return <Suspense fallback={<Splash />}><Auth /></Suspense>;
  return <><Shell />{recovery && <NewPassword onDone={() => setRecovery(false)} />}</>;
}

/** Shown after opening a password-reset email link. */
function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw.length < 8) return setMsg('Use at least 8 characters.');
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg(error.message); else { store.toast('Password updated'); onDone(); }
  };
  return (
    <Sheet open onClose={onDone} title="Choose a new password"
      footer={<><button className="btn-ghost" onClick={onDone}>Later</button><button className="btn-primary" disabled={busy} onClick={save}>Save password</button></>}>
      <Field label="New password"><input className="input" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
      {msg && <p className="text-sm text-bad mt-3" role="alert">{msg}</p>}
    </Sheet>
  );
}

/** Branded loader: a slowly drawing ring with the app mark. */
function Splash() {
  return (
    <div className="min-h-[100dvh] grid place-items-center" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-5 anim-rise">
        <svg width="44" height="44" viewBox="0 0 44 44" className="anim-spin" style={{ animationDuration: '1.4s' }} aria-hidden>
          <circle cx="22" cy="22" r="19" fill="none" stroke="rgb(var(--ink-700))" strokeWidth="2" />
          <path d="M22 3a19 19 0 0 1 19 19" fill="none" stroke="rgb(var(--acid))" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="label">{BRAND.name}</span>
      </div>
    </div>
  );
}

/** Placeholder layout while a section loads. */
function PageSkeleton() {
  return (
    <div aria-hidden className="space-y-6 pt-1">
      <div className="skeleton h-3 w-28" />
      <div className="skeleton h-10 w-2/3 max-w-md" />
      <div className="space-y-3 pt-6">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 w-full" style={{ opacity: 1 - i * 0.15 }} />)}</div>
    </div>
  );
}

async function signOutEverywhereHere() {
  const st = store.state;
  if (st.pending && !(await confirmAction({ title: 'Sign out with unsaved changes?', body: `${st.pending} change(s) haven’t reached the server yet. They stay on this device and upload when you sign back in.`, confirm: 'Sign out' }))) return;
  if (!(await confirmAction({ title: 'Sign out?', body: 'Your data stays safe in your account. Sign back in on any device.', confirm: 'Sign out' }))) return;
  try {
    const { data } = await supabase!.auth.getUser();
    if (data.user) localStorage.removeItem(`ep.cache.cloud.${data.user.id}`);
    localStorage.removeItem('ep.rest');
  } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname);
  resetIntro();
  await supabase!.auth.signOut();
}

function Shell() {
  const st = useStore();
  const s = useSettings();
  const route = useRoute();
  const [menu, setMenu] = useState(false);
  const [intro, setIntro] = useState(shouldShowIntro);
  useEffect(() => { document.title = s.app_title; }, [s.app_title]);
  useEffect(() => { if (st.ready && st.db.settings.length) applyRemotePrefs(s); }, [st.ready, s.theme, s.accent]);

  // Auto-log planned savings for paydays that have passed (never twice: unique per goal + payday).
  useEffect(() => {
    if (!st.ready || !st.db.settings.length) return;
    const m = moneySettings(st.db);
    if (!m.auto_log || !m.next_payday || m.pay_frequency === 'none' || !st.db.money_settings.length) return;
    const today = todayISO(s.timezone);
    const pending = pendingAutoTransfers(st.db, today);
    for (const p of pending) store.insert('savings_transfers', { goal_id: p.goal.id, date: p.payday, amount: p.amount, note: 'Auto', payday: p.payday });
    const since = m.last_auto_payday ? addDays(m.last_auto_payday, 1) : addDays(today, -1);
    const days = repeatDates(m.next_payday, m.pay_frequency, since, today);
    const latest = days[days.length - 1];
    if (latest && latest !== m.last_auto_payday) store.update('money_settings', st.db.money_settings[0].id, { last_auto_payday: latest });
  }, [st.ready, st.db.money_settings, st.db.savings_goals, s.timezone]);

  if (!st.ready) {
    if (st.loadError) return (
      <div className="min-h-[100dvh] grid place-items-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-lg">Couldn’t load your data</p>
          <p className="text-fg-2 mt-2 text-sm">{st.loadError}</p>
          <button className="btn-primary mt-5" onClick={() => store.refresh(true)}>Try again</button>
        </div>
      </div>
    );
    return <Splash />;
  }
  if (st.db.settings.length === 0) return <><Welcome /><Toasts /></>;

  const page = route[0];
  let content: ReactNode;
  switch (page) {
    case 'calendar': content = <CalendarPage />; break;
    case 'goals': content = <Goals id={route[1]} />; break;
    case 'gym': content = <Gym sub={route[1]} id={route[2]} />; break;
    case 'routines': content = <Routines startNew={route[1] === 'new'} />; break;
    case 'review': content = <Review />; break;
    case 'food': content = <FoodPage sub={route[1]} />; break;
    case 'money': content = <Money sub={route[1]} />; break;
    case 'shopping': content = <Shopping />; break;
    case 'settings': content = <SettingsPage />; break;
    default: content = <Today />;
  }
  const [first, ...rest] = s.app_title.split(' / ');

  return (
    <div className="min-h-[100dvh] md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] btn-primary whitespace-nowrap">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-[232px] lg:w-[248px] shrink-0 sticky top-0 h-[100dvh] border-r border-ink-700 px-4 py-6">
        <button onClick={() => navigate('today')} className="text-left px-2 mb-10 text-[15px] tracking-tight">
          <span className="text-fg">{first}</span>{rest.length > 0 && <span className="text-fg-3"> / {rest.join(' / ')}</span>}
        </button>
        <nav aria-label="Main" className="space-y-0.5">
          {PRIMARY.map((n) => <NavItem key={n.id} {...n} active={page === n.id || (!page && n.id === 'today')} />)}
          <div className="h-6" />
          {SECONDARY.map((n) => <NavItem key={n.id} {...n} active={page === n.id} />)}
        </nav>
        <div className="mt-auto space-y-4 px-2">
          <button className="btn-outline w-full" onClick={() => openEditor({ type: 'quickAdd' })}><Icon name="plus" size={18} />Add</button>
          <div className="flex items-center justify-between"><SaveIndicator /><ThemeToggle className="-mr-2" /></div>
          {st.mode === 'local' && <DemoBadge />}
          {st.mode === 'cloud' && (
            <button onClick={signOutEverywhereHere} className="w-full flex items-center gap-3 h-10 px-2 -mx-2 rounded text-[15px] text-fg-2 hover:text-fg hover:bg-ink-900 transition-colors">
              <Icon name="logout" size={18} />Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-30 bg-ink-950/95 backdrop-blur-sm border-b border-ink-700 pt-safe">
        <div className="flex items-center justify-between h-14 pl-4 pr-1" style={{ paddingLeft: 'max(16px, var(--safe-left))', paddingRight: 'max(4px, var(--safe-right))' }}>
          <button onClick={() => navigate('today')} className="text-[15px] tracking-tight min-h-[44px] truncate">
            <span>{first}</span>{rest.length > 0 && <span className="text-fg-3"> / {rest.join(' / ')}</span>}
          </button>
          <div className="flex items-center gap-1">
            <SaveIndicator compact />
            <ThemeToggle />
            <button className="icon-btn" aria-label="More: shopping, routines, review, settings" onClick={() => setMenu(true)}><Icon name="menu" /></button>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 min-w-0 px-4 md:px-10 lg:px-14 2xl:px-20 pt-6 md:pt-12 pb-[calc(110px+var(--safe-bottom))] md:pb-16"
        style={{ paddingLeft: 'max(16px, var(--safe-left))', paddingRight: 'max(16px, var(--safe-right))' }}>
        <div className="max-w-[1180px] xl:max-w-[1360px] 2xl:max-w-[1640px] mx-auto">
          {st.mode === 'local' && <div className="md:hidden mb-4"><DemoBadge /></div>}
          <SyncIssues />
          <Suspense fallback={<PageSkeleton />}>
            <div key={page || 'today'} className="anim-page">{content}</div>
          </Suspense>
        </div>
      </main>

      {/* Mobile quick add + bottom nav */}
      <button onClick={() => openEditor({ type: 'quickAdd' })} aria-label="Quick add"
        className="md:hidden fixed z-30 right-4 bottom-[calc(76px+var(--safe-bottom))] w-14 h-14 rounded-full bg-acid text-acid-ink grid place-items-center shadow-lg shadow-black/40">
        <Icon name="plus" size={24} strokeWidth={2} />
      </button>
      <nav aria-label="Main" className="md:hidden fixed z-30 bottom-0 inset-x-0 bg-ink-950/95 backdrop-blur-sm border-t border-ink-700 pb-safe">
        <div className="grid grid-cols-5 h-16">
          {PRIMARY.map((n) => {
            const active = page === n.id || (!page && n.id === 'today');
            return (
              <button key={n.id} onClick={() => navigate(n.id)} aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-fg' : 'text-fg-3'}`}>
                <Icon name={n.icon} size={22} />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]">{n.label}</span>
                <span className={`h-0.5 rounded-full transition-all duration-500 ${active ? 'w-5 bg-acid' : 'w-0 bg-acid/0'}`} style={{ transitionTimingFunction: 'var(--ease-out)' }} />
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={menu} onClose={() => setMenu(false)} title="More">
        <div className="-my-2">
          {SECONDARY.map((n) => (
            <button key={n.id} className="w-full row text-left" onClick={() => { setMenu(false); navigate(n.id); }}>
              <Icon name={n.icon} className="text-fg-2" /><span className="flex-1 text-[16px]">{n.label}</span><Icon name="right" className="text-fg-3" />
            </button>
          ))}
          {st.mode === 'cloud' && (
            <button className="w-full row text-left" onClick={() => { setMenu(false); signOutEverywhereHere(); }}>
              <Icon name="logout" className="text-fg-2" /><span className="flex-1 text-[16px]">Sign out</span>
            </button>
          )}
        </div>
      </Sheet>

      {intro && <Intro title={s.app_title} onDone={() => setIntro(false)} greeting={(() => {
        const h = nowParts(s.timezone).hour;
        const g = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        return s.display_name ? `${g}, ${s.display_name}` : g;
      })()} />}
      <EditorHost />
      <ConfirmHost />
      <Toasts />
    </div>
  );
}

function NavItem({ id, label, icon, active }: { id: string; label: string; icon: string; active: boolean }) {
  return (
    <button onClick={() => navigate(id)} aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-3 h-10 px-2 rounded text-[15px] transition-colors duration-150 ${active ? 'text-fg bg-ink-850' : 'text-fg-2 hover:text-fg hover:bg-ink-900'}`}>
      <Icon name={icon} size={18} className={active ? 'text-acid' : ''} />{label}
    </button>
  );
}

function DemoBadge() {
  return (
    <button onClick={() => navigate('settings')} className="text-left font-mono text-[11px] leading-relaxed uppercase tracking-[0.06em] text-warn border border-warn/30 rounded px-2.5 py-1.5 w-full">
      Local demo · saved in this browser only · doesn’t sync
    </button>
  );
}
