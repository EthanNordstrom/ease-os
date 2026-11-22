import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { store, useStore } from '../lib/store';
import { weekdayShort } from '../lib/dates';
import { setThemePref, useTheme } from '../lib/theme';

/* ---------------- Icons (1.5px strokes, minimal) ---------------- */
const paths: Record<string, string> = {
  today: 'M4 6h16M4 12h10M4 18h7',
  calendar: 'M4 7h16v13H4zM4 11h16M9 4v4M15 4v4',
  goals: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  gym: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12',
  routine: 'M5 7l2 2 4-4M5 15l2 2 4-4M14 7h6M14 15h6',
  review: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  timer: 'M12 8v5l3 2M9 3h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  play: 'M8 5l11 7-11 7z',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  timeline: 'M4 6h8M8 12h10M6 18h6',
  drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  food: 'M7 3v7a2 2 0 0 0 2 2M5 3v5M9 3v5M7 12v9M17 21V3c-2.2 1-3.5 3.8-3.5 7.5V13H17',
  cart: 'M3 4h2.2l2.3 11h10.3L20 7.5H6.4M9.5 20h.01M17 20h.01',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
};
export function Icon({ name, size = 20, className = '', strokeWidth = 1.5 }: { name: keyof typeof paths | string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

/* ---------------- Sheet / dialog ---------------- */
export function Sheet({ open, onClose, title, children, footer, wide = false, labelledBy }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      // Don't steal focus if the person has already started using a field in this dialog.
      if (ref.current?.contains(document.activeElement)) return;
      const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button:not([data-close])');
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  // Rendered into <body> so it always covers the whole screen and sits centred, whatever page it's opened from.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] anim-backdrop" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id}
        className={`relative w-full ${wide ? 'md:max-w-3xl' : 'md:max-w-xl'} max-h-[100dvh] md:max-h-[88vh] flex flex-col bg-ink-900 border-ink-700
        border-t md:border rounded-t-xl md:rounded-xl anim-sheet md:anim-fade`}>
        <div className="flex items-center justify-between gap-3 px-5 pt-[max(14px,var(--safe-top))] md:pt-4 pb-3 border-b border-ink-700">
          <h2 id={labelledBy ?? id} className="text-lg font-medium tracking-tight truncate">{title}</h2>
          <button data-close className="icon-btn -mr-2" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-5 flex-1">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-ink-700 pb-[max(12px,var(--safe-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Confirm ---------------- */
type ConfirmReq = { title: string; body?: string; confirm?: string; danger?: boolean; resolve: (v: boolean) => void } | null;
let confirmState: ConfirmReq = null;
const confirmListeners = new Set<() => void>();
export function confirmAction(opts: Omit<NonNullable<ConfirmReq>, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => { confirmState = { ...opts, resolve }; confirmListeners.forEach((l) => l()); });
}
export function ConfirmHost() {
  const req = useSyncExternalStore((l) => { confirmListeners.add(l); return () => confirmListeners.delete(l); }, () => confirmState);
  const close = (v: boolean) => { req?.resolve(v); confirmState = null; confirmListeners.forEach((l) => l()); };
  return (
    <Sheet open={!!req} onClose={() => close(false)} title={req?.title ?? ''}
      footer={<><button className="btn-ghost" onClick={() => close(false)}>Cancel</button>
        <button className={req?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} data-autofocus>{req?.confirm ?? 'Confirm'}</button></>}>
      <p className="text-fg-2 leading-relaxed">{req?.body}</p>
    </Sheet>
  );
}

/* ---------------- Fields ---------------- */
export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded border border-ink-600 bg-ink-850 max-w-full overflow-x-auto no-scrollbar">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-[40px] px-3 rounded-[4px] text-sm whitespace-nowrap transition-colors duration-150 ${value === o.value ? 'bg-ink-700 text-fg' : 'text-fg-2 hover:text-fg'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 min-h-[44px] text-left">
      <span className={`relative w-10 h-6 rounded-full border transition-colors duration-150 ${checked ? 'bg-acid border-acid' : 'bg-ink-800 border-ink-600'}`}>
        <span className={`absolute top-[3px] w-4 h-4 rounded-full transition-all duration-150 ${checked ? 'left-[19px] bg-acid-ink' : 'left-[3px] bg-fg-3'}`} />
      </span>
      <span className="text-[15px]">{label}</span>
    </button>
  );
}

export function CheckButton({ checked, onClick, label, size = 'md' }: { checked: boolean; onClick: () => void; label: string; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
  return (
    <button onClick={onClick} aria-pressed={checked} aria-label={label}
      className={`shrink-0 ${dim} grid place-items-center rounded transition-colors duration-150 group`}>
      <span key={String(checked)} className={`grid place-items-center ${size === 'lg' ? 'w-9 h-9' : 'w-6 h-6'} rounded-[5px] border transition-colors duration-200
        ${checked ? 'bg-acid border-acid text-acid-ink anim-pop' : 'border-ink-500 group-hover:border-fg-3 group-active:scale-90 text-transparent'}`}>
        {checked && <svg width={size === 'lg' ? 22 : 16} height={size === 'lg' ? 22 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      </span>
    </button>
  );
}

export function WeekdayPicker({ value, onChange, locale, weekStart }: { value: number[]; onChange: (v: number[]) => void; locale: string; weekStart: number }) {
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdays">
      {order.map((d) => {
        const on = value.includes(d);
        return (
          <button key={d} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={`w-11 h-11 rounded text-sm transition-colors duration-150 border ${on ? 'bg-acid text-acid-ink border-acid' : 'border-ink-600 text-fg-2 hover:text-fg'}`}>
            {weekdayShort(d, locale).slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ ratio, label }: { ratio: number; label: string }) {
  return (
    <div className="h-1 rounded-full bg-ink-700 overflow-hidden" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
      <div className="h-full bg-acid transition-[width] duration-700" style={{ width: `${Math.round(ratio * 100)}%`, transitionTimingFunction: 'var(--ease-out)' }} />
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="py-8 text-center border border-dashed border-ink-700 rounded-lg px-5">
      <p className="text-fg">{title}</p>
      {body && <p className="mt-1 text-sm text-fg-2">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SectionHead({ label, title, action }: { label?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        {label && <div className="label mb-1">{label}</div>}
        <h2 className="h-section">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export const SampleTag = ({ show }: { show?: boolean }) => (show ? <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3 border border-ink-600 rounded px-1.5 py-0.5">Example</span> : null);

/* ---------------- Save status ---------------- */
export function SaveIndicator({ compact = false }: { compact?: boolean }) {
  const s = useStore();
  const map: Record<string, { text: string; dot: string }> = {
    loading: { text: 'Loading', dot: 'bg-fg-3' },
    saved: { text: s.mode === 'local' ? 'Saved on this device' : 'Saved', dot: 'bg-acid' },
    saving: { text: 'Saving…', dot: 'bg-fg-2 animate-pulse' },
    offline: { text: `Offline · ${s.pending} waiting`, dot: 'bg-warn' },
    error: { text: 'Couldn’t save', dot: 'bg-bad' },
    conflict: { text: 'Needs a decision', dot: 'bg-warn' },
  };
  const m = map[s.status];
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-2" role="status" aria-live="polite">
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{m.text}</span>
    </div>
  );
}

export function SyncIssues() {
  const s = useStore();
  if (!s.failed.length && !s.conflicts.length) return null;
  return (
    <div className="space-y-2 mb-6" role="alert">
      {s.failed.length > 0 && (
        <div className="surface border-bad/40 p-4">
          <p className="text-fg">{s.failed.length} change{s.failed.length > 1 ? 's' : ''} couldn’t be saved.</p>
          <p className="text-sm text-fg-2 mt-1">{s.failed[0].error}</p>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary" onClick={() => store.retryFailed()}>Try again</button>
            <button className="btn-ghost" onClick={async () => {
              if (await confirmAction({ title: 'Discard unsaved changes?', body: 'These edits will be lost and your data will reload from the server.', confirm: 'Discard', danger: true })) store.discardFailed();
            }}>Discard</button>
          </div>
        </div>
      )}
      {s.conflicts.map((c) => (
        <div key={c.key} className="surface border-warn/40 p-4">
          <p className="text-fg">This {c.label} was {c.theirs ? 'changed' : 'deleted'} on another device{c.mine ? '' : ' after you deleted it here'}.</p>
          <p className="text-sm text-fg-2 mt-1">
            {c.mine && c.theirs ? 'Choose which version to keep.' : c.mine ? 'Keep your edited version, or let it stay deleted.' : 'Delete it anyway, or keep the other device’s version.'}
            {(c.mine as any)?.title || (c.mine as any)?.name || (c.theirs as any)?.title || (c.theirs as any)?.name ? ` (“${(c.mine as any)?.title ?? (c.mine as any)?.name ?? (c.theirs as any)?.title ?? (c.theirs as any)?.name}”)` : ''}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-primary" onClick={() => store.resolveConflict(c.key, 'mine')}>{c.mine ? 'Keep my version' : 'Delete it'}</button>
            <button className="btn-outline" onClick={() => store.resolveConflict(c.key, 'theirs')}>{c.theirs ? 'Use other device’s' : 'Leave it deleted'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Toasts() {
  const s = useStore();
  return (
    <div className="fixed z-[60] left-0 right-0 top-[calc(60px+var(--safe-top))] md:top-auto md:bottom-6 flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
      {s.toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto anim-rise flex items-center gap-3 max-w-md w-full md:w-auto bg-ink-800 border ${t.tone === 'error' ? 'border-bad/50' : 'border-ink-600'} rounded-lg pl-4 pr-1 py-1 shadow-2xl shadow-black/50`}>
          <span className="text-sm flex-1 py-2">{t.message}</span>
          {t.action && <button className="btn-ghost text-acid hover:text-acid" onClick={() => { t.action!.run(); store.dismiss(t.id); }}>{t.action.label}</button>}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => store.dismiss(t.id)}><Icon name="x" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button className={`icon-btn ${className}`} onClick={() => setThemePref(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={19} />
    </button>
  );
}

export function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
