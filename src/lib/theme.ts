import { useSyncExternalStore } from 'react';

// Theme is a per-device choice (like most apps), stored in this browser.
export type ThemePref = 'dark' | 'light' | 'system';
const KEY = 'ep.theme';
const listeners = new Set<() => void>();
const mq = () => window.matchMedia('(prefers-color-scheme: light)');

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'system' ? v : 'dark'; } catch { return 'dark'; }
}
export const resolveTheme = (p: ThemePref) => (p === 'system' ? (mq().matches ? 'light' : 'dark') : p);

export function applyTheme(p: ThemePref = getThemePref()) {
  const t = resolveTheme(p);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#F7F7F3' : '#0A0A0B');
}
export function setThemePref(p: ThemePref) {
  try { localStorage.setItem(KEY, p); } catch { /* private mode: still applies for this visit */ }
  applyTheme(p);
  listeners.forEach((l) => l());
}
if (typeof window !== 'undefined') mq().addEventListener('change', () => { if (getThemePref() === 'system') { applyTheme('system'); listeners.forEach((l) => l()); } });

export const useTheme = () => {
  const pref = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getThemePref);
  return { pref, resolved: resolveTheme(pref) as 'light' | 'dark' };
};
