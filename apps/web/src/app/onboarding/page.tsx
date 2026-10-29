'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { DEPT_THEMES, DEPT_THEME_DEFAULT_COLOR, type DeptTheme } from '@space/shared';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, Field, Input, Select } from '@/components/ui/primitives';
import { SpaceLogo } from '@/components/brand';
import { DeptIcon } from '@/components/domain';
import { useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';

const BRAND_COLORS = ['#6366e8', '#7c83e8', '#5fa79a', '#d27a9a', '#e0925a', '#4f86c6', '#8a6fd1', '#3f8f6a'];
const DEFAULT_DEPTS: Array<{ name: string; theme: DeptTheme; on: boolean }> = [
  { name: 'Development', theme: 'development', on: true },
  { name: 'Design', theme: 'design', on: true },
  { name: 'Marketing', theme: 'marketing', on: true },
  { name: 'Operations', theme: 'operations', on: true },
  { name: 'Finance', theme: 'finance', on: false },
  { name: 'Human Resources', theme: 'hr', on: false },
];

export default function Onboarding() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [brand, setBrand] = useState(BRAND_COLORS[0]);
  const [depts, setDepts] = useState(DEFAULT_DEPTS);
  const [newDept, setNewDept] = useState({ name: '', theme: 'general' as DeptTheme });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const autoSlug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const org = await api.post<{ id: string }>('/orgs', { name, slug, brandColor: brand, departments: depts.filter((d) => d.on).map(({ name, theme }) => ({ name, theme })) });
      await api.patch('/auth/me/preferences', { lastOrgId: org.id });
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace(`/o/${org.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <SpaceLogo size={30} />
            <span className="text-[18px] font-extrabold">Space</span>
          </div>
          {me.data?.organizations.length ? (
            <Button variant="ghost" onClick={() => router.push('/')}>
              Back to my workspaces
            </Button>
          ) : null}
        </div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Set up your company workspace</h1>
        <p className="mt-1 text-[14px] text-muted">You’ll become its company admin. Everything can be changed later in Company Settings.</p>

        <Card className="mt-6 space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(autoSlug(e.target.value));
                }}
                placeholder="e.g. Nakhla"
              />
            </Field>
            <Field label="Workspace address" hint={slug ? `Shown as “${name || 'Company'} Space”` : undefined}>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(autoSlug(e.target.value));
                }}
                placeholder="nakhla"
              />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-2">Brand colour</p>
            <div className="flex flex-wrap gap-2">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Brand colour ${c}`}
                  onClick={() => setBrand(c)}
                  className={cn('flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl ring-offset-2 transition', brand === c && 'ring-2 ring-ink/30')}
                  style={{ background: c }}
                >
                  {brand === c && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-2">Departments</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {depts.map((d, i) => (
                <button
                  key={d.name + i}
                  type="button"
                  onClick={() => setDepts(depts.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left transition', d.on ? 'border-brand/40 bg-brand-soft/40' : 'border-line bg-surface opacity-70')}
                >
                  <DeptIcon theme={d.theme} color={DEPT_THEME_DEFAULT_COLOR[d.theme]} />
                  <span className="flex-1 text-[13px] font-semibold">{d.name}</span>
                  {d.on ? <Check className="h-4 w-4 text-brand" /> : <X className="h-4 w-4 text-muted-2" />}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} placeholder="Add another department" />
              <Select
                className="w-44"
                value={newDept.theme}
                onValueChange={(v) => setNewDept({ ...newDept, theme: v as DeptTheme })}
                options={DEPT_THEMES.map((t) => ({ value: t, label: `${t[0].toUpperCase()}${t.slice(1)} style` }))}
                aria-label="Office style"
              />
              <Button
                type="button"
                onClick={() => {
                  if (!newDept.name.trim()) return;
                  setDepts([...depts, { name: newDept.name.trim(), theme: newDept.theme, on: true }]);
                  setNewDept({ name: '', theme: 'general' });
                }}
              >
                <Plus /> Add
              </Button>
            </div>
          </div>
          {error && <p className="rounded-xl bg-rose px-3 py-2 text-[13px] text-rose-ink">{error}</p>}
          <div className="flex justify-end">
            <Button variant="primary" size="lg" onClick={create} loading={busy} disabled={!name || slug.length < 2}>
              Create workspace
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
