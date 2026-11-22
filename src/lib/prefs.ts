import { store } from './store';
import { getAccent, getThemePref, setAccent, setThemePref, type ThemePref } from './theme';
import type { Settings } from './types';

// Preferences live on the account (settings row) so they follow you to every device,
// with a local copy so the right theme shows instantly before sign-in.
function save(patch: Partial<Settings>) {
  const s = store.state.db.settings[0];
  if (!s || !store.state.ready) return;
  store.update('settings', s.id, patch);
}

export function chooseTheme(p: ThemePref) { setThemePref(p); save({ theme: p }); }
export function chooseAccent(k: string) { setAccent(k); save({ accent: k }); }
export function setUi(patch: NonNullable<Settings['ui']>) {
  const s = store.state.db.settings[0];
  if (s) save({ ui: { ...(s.ui ?? {}), ...patch } });
}

/** Apply preferences that arrived from another device. */
export function applyRemotePrefs(s: Settings) {
  if (s.theme && s.theme !== getThemePref()) setThemePref(s.theme);
  if (s.accent && s.accent !== getAccent()) setAccent(s.accent);
}
