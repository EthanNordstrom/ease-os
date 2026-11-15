import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Startup sequence shown when the app opens or after signing in:
 * a ring draws, the title rises, a greeting fades in, then the curtain lifts
 * to reveal the app. Tap or press any key to skip. Skipped entirely for reduced motion.
 */
const KEY = 'ep.introShown';
export const shouldShowIntro = () => {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return sessionStorage.getItem(KEY) !== '1';
  } catch { return false; }
};
export const resetIntro = () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

export default function Intro({ title, greeting, onDone }: { title: string; greeting: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [first, ...rest] = title.split(' / ');
  useEffect(() => {
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    const a = setTimeout(() => setLeaving(true), 1650);
    const b = setTimeout(onDone, 2350);
    const skip = () => { setLeaving(true); setTimeout(onDone, 450); };
    window.addEventListener('keydown', skip, { once: true });
    return () => { clearTimeout(a); clearTimeout(b); window.removeEventListener('keydown', skip); };
  }, []);

  return createPortal(
    <div role="presentation" aria-hidden onClick={() => { setLeaving(true); setTimeout(onDone, 450); }}
      className="fixed inset-0 z-[80] grid place-items-center bg-ink-950 cursor-default"
      style={{
        clipPath: leaving ? 'inset(0 0 100% 0)' : 'inset(0 0 0 0)',
        transition: 'clip-path 700ms var(--ease-out)',
      }}>
      <div className="flex flex-col items-center text-center" style={{ opacity: leaving ? 0 : 1, transform: leaving ? 'translateY(-16px)' : 'none', transition: 'opacity 400ms ease, transform 600ms var(--ease-out)' }}>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mb-8">
          <circle cx="32" cy="32" r="29" stroke="rgb(var(--ink-700))" strokeWidth="1.5" />
          <circle cx="32" cy="32" r="29" stroke="rgb(var(--acid))" strokeWidth="1.5" strokeLinecap="round" pathLength={100}
            style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: 'introRing 1100ms var(--ease-out) 100ms forwards', transform: 'rotate(-90deg)', transformOrigin: '32px 32px' }} />
          <circle cx="32" cy="32" r="3" fill="rgb(var(--acid))" style={{ animation: 'introDot 480ms var(--ease-spring) 900ms both' }} />
        </svg>
        <p className="overflow-hidden text-[34px] md:text-[44px] tracking-[-0.03em] font-medium leading-none pb-1">
          <span className="inline-block" style={{ animation: 'reveal 900ms var(--ease-out) 250ms both' }}>
            {first}{rest.length > 0 && <span className="text-fg-3"> / {rest.join(' / ')}</span>}
          </span>
        </p>
        <p className="label mt-5" style={{ animation: 'rise 700ms var(--ease-out) 700ms both' }}>{greeting}</p>
      </div>
    </div>,
    document.body,
  );
}
