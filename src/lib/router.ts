import { useSyncExternalStore } from 'react';

const get = () => (location.hash.replace(/^#\/?/, '') || 'today');
const sub = (l: () => void) => { window.addEventListener('hashchange', l); return () => window.removeEventListener('hashchange', l); };
export const useRoute = () => useSyncExternalStore(sub, get).split('/');
export const navigate = (path: string) => { location.hash = '/' + path; window.scrollTo(0, 0); };
