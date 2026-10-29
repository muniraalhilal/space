/** Account sign-in for the public website (Supabase email + password). */
import { useState } from 'react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { SpaceLogo } from '@/components/brand';
import { supabase } from './supabase';

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const redirect = location.origin + location.pathname;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = redirect;
        return;
      }
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) return void (location.href = redirect);
        setMsg({ ok: true, text: `We sent a confirmation link to ${email}. Open it to finish creating your account.` });
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
        if (error) throw error;
        setMsg({ ok: true, text: `If ${email} has an account, a sign-in link is on its way.` });
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error)?.message ?? 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'in' ? 'Sign in to Space' : mode === 'up' ? 'Create your account' : 'Email me a sign-in link';
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-2.5">
          <SpaceLogo size={34} />
          <div>
            <p className="text-[20px] font-extrabold tracking-[-0.02em]">Space</p>
            <p className="text-[12.5px] text-muted">Your workplace, connected.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3.5 rounded-[22px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
          <h1 className="text-[20px] font-extrabold tracking-[-0.02em]">{title}</h1>
          {mode === 'up' && (
            <Field label="Your name">
              <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          {mode !== 'reset' && (
            <Field label="Password" hint={mode === 'up' ? 'At least 8 characters.' : undefined}>
              <Input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'up' ? 8 : 1} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
            </Field>
          )}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send link'}
          </Button>
          {msg && <p className={`rounded-xl px-3 py-2 text-[12.5px] ${msg.ok ? 'bg-sage text-sage-ink' : 'bg-rose text-rose-ink'}`}>{msg.text}</p>}
          <div className="flex justify-between pt-1 text-[12.5px]">
            {mode === 'in' ? (
              <>
                <button type="button" className="cursor-pointer font-semibold text-brand-ink" onClick={() => setMode('up')}>
                  Create an account
                </button>
                <button type="button" className="cursor-pointer text-muted" onClick={() => setMode('reset')}>
                  Forgot password? Email me a link
                </button>
              </>
            ) : (
              <button type="button" className="cursor-pointer font-semibold text-brand-ink" onClick={() => setMode('in')}>
                I already have an account
              </button>
            )}
          </div>
        </form>
        <p className="mt-4 text-[12px] text-muted">
          Free to use. Your companies are only visible to the people in them.{' '}
          <a href={redirect} className="font-semibold text-brand-ink underline">
            Back to the demo
          </a>
        </p>
      </div>
    </div>
  );
}
