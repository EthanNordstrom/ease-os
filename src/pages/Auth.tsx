import { useEffect, useState } from 'react';
import { supabase } from '../lib/adapters';
import { BRAND } from '../lib/brand';
import { useTheme } from '../lib/theme';
import { Icon, ThemeToggle } from '../components/ui';
import { Turnstile, TURNSTILE_SITE_KEY } from '../components/Turnstile';

type Mode = 'signin' | 'signup' | 'link' | 'reset';
const WORDS = ['routines.', 'goals.', 'training.', 'momentum.'];
const FEATURES = [
  ['01', 'Routines', 'Tick off what matters, one day at a time.'],
  ['02', 'Goals', 'Milestones, next actions and an honest timeline.'],
  ['03', 'Training', 'Log sets in a few taps. See real progress.'],
];

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ['Too short', 'Okay', 'Good', 'Strong', 'Very strong'][s] };
}

export default function Auth() {
  const [mode, setMode] = useState<Mode>(() => (location.hash.includes('signup') ? 'signup' : 'signin'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const { resolved } = useTheme();

  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const switchMode = (m: Mode) => { setMode(m); setMsg(null); setSent(null); setConfirm(''); };
  const pw = strength(password);
  const needsPw = mode === 'signin' || mode === 'signup';
  const mismatch = mode === 'signup' && confirm.length > 0 && confirm !== password;
  const canSubmit = !busy && cooldown === 0 && /\S+@\S+\.\S+/.test(email) && (!needsPw || password.length >= (mode === 'signup' ? 8 : 1))
    && (mode !== 'signup' || (confirm === password)) && (!TURNSTILE_SITE_KEY || !!captcha);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !canSubmit) return;
    setBusy(true); setMsg(null);
    const redirect = location.origin + location.pathname;
    const captchaToken = captcha ?? undefined;
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect, captchaToken });
        if (error) setMsg({ text: error.message, error: true }); else setSent('If that email has an account, a reset link is on its way.');
      } else if (mode === 'link') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, captchaToken, shouldCreateUser: false } });
        if (error) setMsg({ text: error.message, error: true }); else setSent('Check your email for a sign-in link.');
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect, captchaToken } });
        if (error) setMsg({ text: error.message, error: true });
        else if (!data.session) setSent('Almost there — confirm your email, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (error) { setMsg({ text: error.message, error: true }); setCooldown(2); }
      }
    } catch {
      setMsg({ text: navigator.onLine ? 'Something went wrong. Try again.' : 'You’re offline. Connect to continue.', error: true });
    }
    setBusy(false);
    setCaptchaReset((n) => n + 1);
  };

  const [first, ...rest] = BRAND.title.split(' / ');
  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : mode === 'link' ? 'Sign in by email' : 'Welcome back';
  const sub = mode === 'signup' ? 'Free, private, and yours on every device.' : mode === 'reset' ? 'We’ll email you a link to choose a new one.'
    : mode === 'link' ? 'We’ll email you a one-tap sign-in link.' : 'Sign in to pick up where you left off.';

  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <aside className="relative overflow-hidden border-b lg:border-b-0 lg:border-r border-ink-700 bg-ink-900 px-6 sm:px-10 lg:px-14 pt-[max(24px,var(--safe-top))] pb-10 lg:py-12 flex flex-col">
        <Orbits />
        <div className="relative flex items-center justify-between">
          <p className="text-[15px] tracking-tight anim-rise">{first}{rest.length > 0 && <span className="text-fg-3"> / {rest.join(' / ')}</span>}</p>
          <ThemeToggle className="lg:hidden -mr-2" />
        </div>
        <div className="relative mt-10 lg:mt-auto">
          <h1 className="text-[40px] sm:text-[52px] lg:text-[64px] leading-[1.02] tracking-[-0.035em] font-medium">
            <span className="block overflow-hidden pb-1"><span className="anim-reveal">A calm place for</span></span>
            <span className="block overflow-hidden pb-1 h-[1.12em] relative"><RotatingWord /></span>
          </h1>
          <ul className="hidden sm:block mt-10 lg:mt-14 max-w-md border-t border-ink-700 stagger">
            {FEATURES.map(([n, t, d]) => (
              <li key={n} className="flex gap-5 py-4 border-b border-ink-700">
                <span className="meta text-fg-3 pt-0.5">{n}</span>
                <span><span className="block">{t}</span><span className="block text-sm text-fg-2 mt-0.5">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <LiveClock />
      </aside>

      {/* Form */}
      <main className="relative flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-10 pb-[max(40px,var(--safe-bottom))]">
        <ThemeToggle className="hidden lg:inline-flex absolute right-6 top-6" />
        <div className="w-full max-w-[400px] mx-auto">
          {(mode === 'signin' || mode === 'signup') && (
            <div role="tablist" aria-label="Account" className="relative grid grid-cols-2 p-1 rounded-full border border-ink-600 bg-ink-850 mb-10 anim-rise">
              <span aria-hidden className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-ink-700 transition-transform duration-500"
                style={{ transform: mode === 'signup' ? 'translateX(100%)' : 'none', transitionTimingFunction: 'var(--ease-out)' }} />
              {(['signin', 'signup'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                  className={`relative z-10 h-10 rounded-full text-sm transition-colors duration-300 ${mode === m ? 'text-fg' : 'text-fg-2 hover:text-fg'}`}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          <div key={mode} className="anim-page">
            <h2 className="text-[30px] tracking-[-0.025em] font-medium">{title}</h2>
            <p className="text-fg-2 mt-2">{sub}</p>

            {sent ? (
              <div className="mt-10 flex flex-col items-start gap-5" role="status">
                <span className="relative w-14 h-14 grid place-items-center rounded-full bg-acid text-acid-ink anim-pop">
                  <span className="absolute inset-0 rounded-full border border-acid anim-ring" />
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <p className="text-[17px] leading-relaxed">{sent}</p>
                <p className="text-sm text-fg-3">Sent to {email}. It can take a minute — check spam too.</p>
                <button className="btn-outline" onClick={() => switchMode('signin')}>Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
                <FloatField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} autoFocus />
                {needsPw && (
                  <div>
                    <FloatField label="Password" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={setPassword}
                      trailing={<button type="button" onClick={() => setShow((v) => !v)} className="text-xs font-mono uppercase tracking-[0.08em] text-fg-3 hover:text-fg px-3 h-11" aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>} />
                    {mode === 'signup' && password.length > 0 && (
                      <div className="mt-2.5" aria-live="polite">
                        <div className="grid grid-cols-4 gap-1.5">
                          {[1, 2, 3, 4].map((i) => <span key={i} className="h-1 rounded-full bg-ink-700 overflow-hidden"><span className="block h-full bg-acid transition-transform duration-500 origin-left" style={{ transform: `scaleX(${pw.score >= i ? 1 : 0})`, transitionTimingFunction: 'var(--ease-out)' }} /></span>)}
                        </div>
                        <p className="meta text-fg-3 mt-1.5">{password.length < 8 ? `At least 8 characters · ${8 - password.length} to go` : pw.label}</p>
                      </div>
                    )}
                  </div>
                )}
                {mode === 'signup' && (
                  <div>
                    <FloatField label="Confirm password" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={setConfirm} />
                    {mismatch && <p className="text-sm text-bad mt-1.5">Passwords don’t match yet.</p>}
                  </div>
                )}

                <Turnstile onToken={setCaptcha} theme={resolved} resetKey={captchaReset} />

                <button className="btn-primary w-full h-12 text-[15px]" disabled={!canSubmit}>
                  {busy ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent anim-spin" aria-hidden /> : null}
                  {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : mode === 'link' ? 'Email me a link' : mode === 'reset' ? 'Send reset link' : cooldown ? `Try again in ${cooldown}s` : 'Sign in'}
                  {!busy && <Icon name="arrow" size={16} />}
                </button>
                {msg && <p role="alert" className={`text-sm anim-rise ${msg.error ? 'text-bad' : 'text-fg-2'}`}>{msg.text}</p>}

                <div className="flex flex-wrap justify-between gap-2 pt-1 -mx-3">
                  {mode === 'signin' && <>
                    <button type="button" className="btn-ghost text-sm" onClick={() => switchMode('reset')}>Forgot password?</button>
                    <button type="button" className="btn-ghost text-sm" onClick={() => switchMode('link')}>Email me a link instead</button>
                  </>}
                  {(mode === 'reset' || mode === 'link') && <button type="button" className="btn-ghost text-sm" onClick={() => switchMode('signin')}><Icon name="left" size={14} />Back to sign in</button>}
                  {mode === 'signup' && <p className="text-xs text-fg-3 px-3 leading-relaxed">Your data is private to your account. You can export it or delete your account at any time.</p>}
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function FloatField({ label, value, onChange, trailing, ...rest }: { label: string; value: string; onChange: (v: string) => void; trailing?: React.ReactNode } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const id = `f-${label.replace(/\s/g, '-').toLowerCase()}`;
  return (
    <div className="group relative">
      <input id={id} {...rest} value={value} onChange={(e) => onChange(e.target.value)} placeholder=" " aria-label={label}
        className="peer w-full h-14 pt-5 pb-1 px-0 bg-transparent border-0 border-b border-ink-600 rounded-none text-fg text-[16px] outline-none focus-visible:outline-none transition-colors duration-300 pr-16" />
      <label htmlFor={id} className="pointer-events-none absolute left-0 top-4 text-fg-3 transition-all duration-300 origin-left
        peer-focus:top-0 peer-focus:text-[11px] peer-focus:font-mono peer-focus:uppercase peer-focus:tracking-[0.08em]
        peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-mono peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-[0.08em]"
        style={{ transitionTimingFunction: 'var(--ease-out)' }}>{label}</label>
      <span aria-hidden className="absolute left-0 right-0 bottom-0 h-px bg-acid origin-left scale-x-0 peer-focus:scale-x-100 transition-transform duration-500" style={{ transitionTimingFunction: 'var(--ease-out)' }} />
      {trailing && <span className="absolute right-0 bottom-1">{trailing}</span>}
    </div>
  );
}

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <span aria-live="off" className="absolute inset-0">
      <span key={i} className="absolute left-0 text-acid" style={{ animation: 'wordIn 700ms var(--ease-out) both' }}>{WORDS[i]}</span>
      <span className="sr-only">routines, goals, training and momentum.</span>
    </span>
  );
}

/** Slowly turning thin rings — quiet movement, no glow. */
function Orbits() {
  return (
    <svg aria-hidden viewBox="0 0 600 600" className="absolute -right-40 -top-40 w-[560px] h-[560px] lg:w-[720px] lg:h-[720px] lg:-right-56 lg:-top-24 text-ink-600 pointer-events-none">
      {[280, 220, 160, 100].map((r, i) => (
        <g key={r} style={{ transformOrigin: '300px 300px', animation: `orbit ${60 + i * 25}s linear infinite ${i % 2 ? 'reverse' : ''}` }}>
          <circle cx="300" cy="300" r={r} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray={i % 2 ? '2 10' : 'none'} />
          <circle cx={300 + r} cy="300" r={i === 1 ? 4 : 2.5} className={i === 1 ? 'fill-acid' : 'fill-current'} style={i === 1 ? { animation: 'breathe 3.2s ease-in-out infinite' } : undefined} />
        </g>
      ))}
    </svg>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <p className="relative hidden lg:flex mt-12 meta text-fg-3 gap-4">
      <span>{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <span className="tabular-nums">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    </p>
  );
}
