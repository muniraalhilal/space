/**
 * "Who are you?" — the hosted Space's sign-in. The host already signed the viewer in; here they pick
 * which person they are in this Space (or add themselves). The choice is saved privately for them.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, ArrowRight, Building2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button, Field, Input, Select } from '@/components/ui/primitives';
import { SpaceLogo } from '@/components/brand';
import { AvatarPortrait } from '@/components/avatar';
import { navigate } from './shims/router';

type People = {
  people: Array<{ id: string; name: string; title: string | null; suggested: number; companies: Array<{ name: string; role: string }> }>;
  companies: Array<{ id: string; name: string; departments: Array<{ id: string; name: string }> }>;
  viewerName: string;
  signedIn: boolean;
  account: { email: string } | null;
  demo?: boolean;
};
const ROLE = { company_admin: 'Company admin', employee: 'Employee', viewer: 'Viewer' } as Record<string, string>;

export function Welcome() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['people'], queryFn: () => api.get<People>('/auth/people') });
  const [find, setFind] = useState('');
  const [mode, setMode] = useState<'pick' | 'join'>('pick');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; joinOrgId: string; departmentId: string } | null>(null);

  const list = useMemo(
    () =>
      (q.data?.people ?? [])
        .filter((p) => (p.name + ' ' + (p.title ?? '')).toLowerCase().includes(find.toLowerCase()))
        .sort((a, b) => (a.suggested < 0 ? 99 : a.suggested) - (b.suggested < 0 ? 99 : b.suggested) || a.name.localeCompare(b.name)),
    [q.data, find],
  );
  const f = form ?? { name: q.data?.viewerName ?? '', email: '', joinOrgId: q.data?.companies[0]?.id ?? '', departmentId: '' };
  const company = q.data?.companies.find((c) => c.id === f.joinOrgId);

  async function done() {
    await qc.invalidateQueries();
    navigate('/', true);
  }
  async function pick(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      await api.post('/auth/login', { userId });
      await done();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy('join');
    setError(null);
    try {
      await api.post('/auth/join', { name: f.name, email: f.email, joinOrgId: f.joinOrgId || undefined, departmentId: f.departmentId || undefined });
      await qc.invalidateQueries();
      navigate(f.joinOrgId ? '/' : '/onboarding', true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto flex max-w-[980px] flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
        <header className="flex items-center gap-2.5">
          <SpaceLogo size={34} />
          <div>
            <p className="text-[20px] font-extrabold tracking-[-0.02em]">Space</p>
            <p className="text-[12.5px] text-muted">Your workplace, connected.</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Who are you in this Space?</h1>
            <p className="mt-1 text-[13px] text-muted">
 {q.data?.demo
                ? 'This is a demo — no account needed. Pick anyone to see Space through their eyes. Your changes are saved only in this browser.'
                : q.data?.account
                ? 'Choose your person to continue. Demo people are shared so anyone can try a role; people invited to your email become yours.'
                : 'You’re already signed in. Choose your person to continue — your choice and preferences are saved just for you.'}
            </p>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input id="people-search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search people…" className="pl-10" aria-label="Search people" />
            </div>
            <div className="mt-3 max-h-[440px] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
              {q.isLoading && <p className="p-4 text-[13px] text-muted">Loading people…</p>}
              {q.isError && <p className="p-4 text-[13px] text-rose-ink">{errorMessage(q.error)}</p>}
              {q.data && !q.data.people.length && (
                <div className="p-5 text-[13px] text-muted">
                  <p className="font-semibold text-ink">No one is here yet.</p>
                  <p className="mt-1">Add yourself on the right, then create your company.</p>
                </div>
              )}
              {list.map((p) => (
                <button key={p.id} onClick={() => pick(p.id)} disabled={!!busy} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-soft disabled:opacity-60">
                  <AvatarPortrait name={p.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate text-[13.5px] font-semibold text-ink">
                      {p.name}
                      {p.suggested >= 0 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-bold text-brand-ink">Try this role</span>}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {[p.title, ...p.companies.map((c) => `${c.name} · ${ROLE[c.role] ?? c.role}`)].filter(Boolean).join(' — ')}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-2" />
                </button>
              ))}
              {q.data && q.data.people.length > 0 && !list.length && <p className="p-4 text-[13px] text-muted">No one matches “{find}”.</p>}
            </div>
          </section>

          <section className="h-fit rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
            {mode === 'pick' ? (
              <>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                  <UserPlus className="h-5 w-5" />
                </span>
                <h2 className="mt-3 text-[16px] font-bold">Not on the list?</h2>
                <p className="mt-1 text-[13px] text-muted">Add yourself. You can join the demo company as an employee, or start your own company.</p>
                <Button className="mt-4 w-full" variant="primary" onClick={() => setMode('join')}>
                  Add myself
                </Button>
              </>
            ) : (
              <form onSubmit={join} className="space-y-3.5">
                <h2 className="text-[16px] font-bold">Add yourself</h2>
                <Field label="Your name">
                  <Input id="join-name" value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} required minLength={2} />
                </Field>
                {!q.data?.account && (
                  <Field label="Work email (optional)">
                    <Input id="join-email" type="email" value={f.email} onChange={(e) => setForm({ ...f, email: e.target.value })} />
                  </Field>
                )}
                <Field label="Company">
                  <Select
                    aria-label="Company"
                    value={f.joinOrgId || 'new'}
                    onValueChange={(v) => setForm({ ...f, joinOrgId: v === 'new' ? '' : v, departmentId: '' })}
                    options={[...(q.data?.companies ?? []).map((c) => ({ value: c.id, label: `Join ${c.name} (demo)` })), { value: 'new', label: 'Start my own company' }]}
                  />
                </Field>
                {company && (
                  <Field label="Department (optional)">
                    <Select aria-label="Department" value={f.departmentId || 'none'} onValueChange={(v) => setForm({ ...f, departmentId: v === 'none' ? '' : v })} options={[{ value: 'none', label: 'No department yet' }, ...company.departments.map((d) => ({ value: d.id, label: d.name }))]} />
                  </Field>
                )}
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" onClick={() => setMode('pick')}>
                    Back
                  </Button>
                  <Button type="submit" variant="primary" className="flex-1" disabled={busy === 'join' || f.name.trim().length < 2}>
                    {f.joinOrgId ? 'Join' : (
                      <>
                        <Building2 /> Continue
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
            {error && <p className="mt-3 rounded-xl bg-rose px-3 py-2 text-[12.5px] text-rose-ink">{error}</p>}
          </section>
        </div>
        {q.data?.demo ? (
          <p className="text-[12px] text-muted">
            Want your own company that your team can share?{' '}
            <a href="?signin" className="font-semibold text-brand-ink underline">
              Create a free account
            </a>
          </p>
        ) : q.data?.account ? (
          <p className="text-[12px] text-muted">
            Signed in as <b className="text-ink">{q.data.account.email}</b>.{' '}
            <button className="cursor-pointer font-semibold text-brand-ink underline" onClick={() => api.post('/auth/account/logout')}>
              Sign out
            </button>
            <br />
            Your companies are private to the people in them. The demo company Juniper is shared with every visitor, so others may change it too.
          </p>
        ) : (
        <p className="text-[12px] text-muted">
          Everyone who opens this page shares the same companies and sees changes live. People with view-only access can look around but can’t make changes.
        </p>
        )}
      </div>
    </div>
  );
}
