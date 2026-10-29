'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { Button, Input, Field, Segmented } from '@/components/ui/primitives';
import { SpaceLogo } from '@/components/brand';

const LoginHero = dynamic(() => import('@/office/LoginHero'), { ssr: false, loading: () => <div className="h-full w-full" /> });

const DEMO = [
  { email: 'munira@juniper.demo', label: 'Company admin' },
  { email: 'faisal@juniper.demo', label: 'Dev admin' },
  { email: 'lina@juniper.demo', label: 'Marketing admin' },
  { email: 'sara@juniper.demo', label: 'Employee' },
  { email: 'sultan@juniper.demo', label: 'Viewer' },
];

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await api.post('/auth/login', { email, password });
      else await api.post('/auth/register', { email, password, name });
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(420px,1fr)_1.25fr]">
      <div className="flex flex-col justify-between px-8 py-8 sm:px-14">
        <div className="flex items-center gap-2.5">
          <SpaceLogo size={32} />
          <span className="text-[19px] font-extrabold tracking-[-0.02em]">Space</span>
        </div>
        <div className="mx-auto w-full max-w-[380px] py-10">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1.5 text-[14px] text-muted">Your workplace, connected.</p>
          <Segmented
            className="mt-6"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setError(null);
            }}
            options={[
              { value: 'login', label: 'Sign in' },
              { value: 'register', label: 'Sign up' },
            ]}
          />
          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'register' && (
              <Field label="Full name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
            )}
            <Field label="Work email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" />
            </Field>
            <Field label="Password" hint={mode === 'register' ? 'At least 10 characters' : undefined}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            {error && <p className="rounded-xl bg-rose px-3 py-2 text-[13px] text-rose-ink" role="alert">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
          <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-surface/60 p-4">
            <p className="text-[12px] font-semibold text-ink-2">Demo workspace · Juniper Space</p>
            <p className="mt-0.5 text-[12px] text-muted">Fictional company. Password for all demo accounts: <code className="rounded bg-bg px-1">space-demo-2026</code></p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setEmail(d.email);
                    setPassword('space-demo-2026');
                  }}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-2 hover:border-brand/40 hover:text-brand-ink"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[12px] text-muted-2">© {new Date().getFullYear()} Space</p>
      </div>
      <div className="relative hidden overflow-hidden lg:block" style={{ background: 'linear-gradient(160deg,#efe9fb 0%,#f8efe9 55%,#e9f0f8 100%)' }}>
        <div className="absolute inset-0">
          <LoginHero />
        </div>
        <div className="pointer-events-none absolute left-12 top-12 max-w-md">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-lavender-ink/80">People · AI agents · One office</p>
          <h2 className="mt-3 text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">A calm virtual workplace for your whole company.</h2>
        </div>
      </div>
    </div>
  );
}
