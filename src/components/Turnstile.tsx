import { useEffect, useRef } from 'react';

// Cloudflare Turnstile CAPTCHA. Active only when VITE_TURNSTILE_SITE_KEY is set; Supabase then
// verifies the token on sign-up, sign-in and password-reset (Authentication → Attack Protection).
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void } }
}

let loading: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('Could not load the security check.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Renders the check and reports a fresh token (or null when it expires / is reset). */
export function Turnstile({ onToken, theme, resetKey }: { onToken: (t: string | null) => void; theme: 'light' | 'dark'; resetKey: number }) {
  const el = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !el.current || !window.turnstile) return;
      id.current = window.turnstile.render(el.current, {
        sitekey: TURNSTILE_SITE_KEY, theme, appearance: 'interaction-only',
        callback: (t: string) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null),
      });
    }).catch(() => onToken(null));
    return () => { cancelled = true; if (id.current) window.turnstile?.remove(id.current); id.current = null; };
  }, [theme]);
  // Tokens are single-use: get a new one after every attempt.
  useEffect(() => { if (resetKey && id.current) { onToken(null); window.turnstile?.reset(id.current); } }, [resetKey]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={el} className="min-h-0" />;
}
