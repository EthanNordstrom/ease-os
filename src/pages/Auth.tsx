import { useState } from 'react';
import { supabase } from '../lib/adapters';
import { Field, Segmented } from '../components/ui';

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'link'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'link') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
        setMsg(error ? { text: error.message, error: true } : { text: 'Check your email for a sign-in link.' });
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) setMsg({ text: error.message, error: true });
        else if (!data.session) setMsg({ text: 'Account created. Confirm your email, then sign in.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg({ text: error.message, error: true });
      }
    } catch {
      setMsg({ text: navigator.onLine ? 'Something went wrong. Try again.' : 'You’re offline. Connect to sign in.', error: true });
    }
    setBusy(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center px-6 py-12 pt-safe">
      <div className="w-full max-w-sm mx-auto">
        <p className="text-[15px] mb-12">Ethan <span className="text-fg-3">/ Personal</span></p>
        <h1 className="h-display">Sign in</h1>
        <p className="text-fg-2 mt-3 mb-8">Your routines, goals and training — the same on every device.</p>
        <Segmented label="Sign-in method" value={mode} onChange={(v) => { setMode(v); setMsg(null); }}
          options={[{ value: 'signin', label: 'Password' }, { value: 'link', label: 'Email link' }, { value: 'signup', label: 'Create account' }]} />
        <form onSubmit={submit} className="space-y-4 mt-6">
          <Field label="Email"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {mode !== 'link' && (
            <Field label="Password"><input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          )}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : mode === 'link' ? 'Email me a link' : 'Sign in'}</button>
          {msg && <p role="status" className={`text-sm ${msg.error ? 'text-bad' : 'text-fg-2'}`}>{msg.text}</p>}
        </form>
      </div>
    </div>
  );
}
