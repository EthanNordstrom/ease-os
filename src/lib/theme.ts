import { useSyncExternalStore } from 'react';
import { TAG_COLORS } from './palette';

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
  applyAccent(getAccent(), t);
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

/* ---------------- Accent colour (per device, like the theme) ---------------- */

export const ACCENTS = [{ key: 'acid', name: 'Acid (default)', hex: '#B9DB6E' }, ...TAG_COLORS];
const AKEY = 'ep.accent';
type RGB = [number, number, number];
const toRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const lum = (c: RGB) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const str = (c: RGB) => c.join(' ');

/** Shades of the chosen colour that stay readable: as text on the background and as a button with text on it. */
export function accentVars(key: string, theme: 'light' | 'dark') {
  const base = ACCENTS.find((a) => a.key === key);
  if (!base || key === 'acid') return null;
  const white: RGB = [255, 255, 255], black: RGB = [0, 0, 0];
  let c = toRgb(base.hex);
  if (theme === 'dark') {
    const bg: RGB = [10, 10, 11];
    for (let i = 0; i < 12 && contrast(c, bg) < 6.5; i++) c = mix(c, white, 0.1);
    const ink: RGB = contrast(c, [12, 12, 13]) >= 4.5 ? [12, 12, 13] : white;
    return { acid: str(c), dim: str(mix(c, bg, 0.3)), ink: str(ink) };
  }
  for (let i = 0; i < 12 && contrast(c, white) < 4.8; i++) c = mix(c, black, 0.1);
  return { acid: str(c), dim: str(mix(c, white, 0.3)), ink: str(white) };
}

export function getAccent(): string { try { return localStorage.getItem(AKEY) || 'acid'; } catch { return 'acid'; } }

function applyAccent(key: string, theme: 'light' | 'dark') {
  const v = accentVars(key, theme);
  const st = document.documentElement.style;
  if (!v) { ['--acid', '--acid-dim', '--acid-ink'].forEach((n) => st.removeProperty(n)); return; }
  st.setProperty('--acid', v.acid); st.setProperty('--acid-dim', v.dim); st.setProperty('--acid-ink', v.ink);
}

export function setAccent(key: string) {
  try {
    localStorage.setItem(AKEY, key);
    // Pre-computed for the no-flash loader (public/theme-init.js).
    localStorage.setItem('ep.accentVars', JSON.stringify(key === 'acid' ? null : { dark: accentVars(key, 'dark'), light: accentVars(key, 'light') }));
  } catch { /* private mode: applies for this visit only */ }
  applyAccent(key, resolveTheme(getThemePref()));
  listeners.forEach((l) => l());
}

export const useAccent = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getAccent);
