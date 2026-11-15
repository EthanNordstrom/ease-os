import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CloudAdapter, LocalAdapter, cloudConfigured, supabase } from './lib/adapters';
import { store, useStore, useSettings } from './lib/store';
import { navigate, useRoute } from './lib/router';
import { ConfirmHost, Icon, SaveIndicator, Sheet, SyncIssues, Toasts } from './components/ui';
import { EditorHost, openEditor } from './components/editors';
import Today from './pages/Today';
import Routines from './pages/Routines';
import CalendarPage from './pages/Calendar';
import Goals from './pages/Goals';
import Gym from './pages/Gym';
import Review from './pages/Review';
import SettingsPage from './pages/Settings';
import Auth from './pages/Auth';

const PRIMARY = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'gym', label: 'Gym', icon: 'gym' },
];
const SECONDARY = [
  { id: 'routines', label: 'Routines', icon: 'routine' },
  { id: 'review', label: 'Weekly review', icon: 'review' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(cloudConfigured ? undefined : null);

  useEffect(() => {
    if (!supabase) { store.start(new LocalAdapter(), null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    store.start(new CloudAdapter(supabase, userId), userId);
    return () => store.stop();
  }, [userId]);

  if (cloudConfigured && session === undefined) return <Splash />;
  if (cloudConfigured && !session) return <Auth />;
  return <Shell />;
}

function Splash({ text = 'Loading' }: { text?: string }) {
  return <div className="min-h-[100dvh] grid place-items-center"><span className="label">{text}…</span></div>;
}

function Shell() {
  const st = useStore();
  const s = useSettings();
  const route = useRoute();
  const [menu, setMenu] = useState(false);
  useEffect(() => { document.title = s.app_title; }, [s.app_title]);

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

  const page = route[0];
  let content: ReactNode;
  switch (page) {
    case 'calendar': content = <CalendarPage />; break;
    case 'goals': content = <Goals id={route[1]} />; break;
    case 'gym': content = <Gym sub={route[1]} id={route[2]} />; break;
    case 'routines': content = <Routines />; break;
    case 'review': content = <Review />; break;
    case 'settings': content = <SettingsPage />; break;
    default: content = <Today />;
  }
  const [first, ...rest] = s.app_title.split(' / ');

  return (
    <div className="min-h-[100dvh] md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] btn-primary">Skip to content</a>

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
          <SaveIndicator />
          {st.mode === 'local' && <DemoBadge />}
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
            <button className="icon-btn" aria-label="More: routines, review, settings" onClick={() => setMenu(true)}><Icon name="menu" /></button>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 min-w-0 px-4 md:px-10 lg:px-14 pt-6 md:pt-12 pb-[calc(110px+var(--safe-bottom))] md:pb-16"
        style={{ paddingLeft: 'max(16px, var(--safe-left))', paddingRight: 'max(16px, var(--safe-right))' }}>
        <div className="max-w-[1180px] mx-auto">
          {st.mode === 'local' && <div className="md:hidden mb-4"><DemoBadge /></div>}
          <SyncIssues />
          {content}
        </div>
      </main>

      {/* Mobile quick add + bottom nav */}
      <button onClick={() => openEditor({ type: 'quickAdd' })} aria-label="Quick add"
        className="md:hidden fixed z-30 right-4 bottom-[calc(76px+var(--safe-bottom))] w-14 h-14 rounded-full bg-acid text-acid-ink grid place-items-center shadow-lg shadow-black/40">
        <Icon name="plus" size={24} strokeWidth={2} />
      </button>
      <nav aria-label="Main" className="md:hidden fixed z-30 bottom-0 inset-x-0 bg-ink-950/95 backdrop-blur-sm border-t border-ink-700 pb-safe">
        <div className="grid grid-cols-4 h-16">
          {PRIMARY.map((n) => {
            const active = page === n.id || (!page && n.id === 'today');
            return (
              <button key={n.id} onClick={() => navigate(n.id)} aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-fg' : 'text-fg-3'}`}>
                <Icon name={n.icon} size={22} />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]">{n.label}</span>
                <span className={`h-0.5 w-5 rounded-full ${active ? 'bg-acid' : 'bg-transparent'}`} />
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
        </div>
      </Sheet>

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
