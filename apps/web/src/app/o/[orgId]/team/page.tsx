'use client';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Users, UserPlus, Search, MessageCircle, X, SlidersHorizontal, Copy } from 'lucide-react';
import { ORG_ROLES } from '@space/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useMembers, useOrg, useTasks, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, Card, Dialog, DialogContent, Empty, Field, Input, PageHeader, Select, Sheet, Skeleton } from '@/components/ui/primitives';
import { AvatarPortrait, PresenceBadge, PresenceDot } from '@/components/avatar';
import { DeptIcon } from '@/components/domain';
import { TaskList } from '@/components/tasks';

const ROLE_LABEL = { company_admin: 'Company admin', employee: 'Employee', viewer: 'Viewer' } as const;

export default function TeamPage() {
  const org = useOrg();
  const members = useMembers();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('any');
  const [invite, setInvite] = useState(false);
  const selected = sp.get('member');
  const list = (members.data ?? []).filter((m) => (dept === 'any' || m.departments.some((d) => d.departmentId === dept)) && (`${m.name} ${m.title ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const isAdmin = org.data?.me.role === 'company_admin';

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        icon={<Users className="text-sage-ink" />}
        title="Team directory"
        subtitle={`${members.data?.length ?? '—'} people in ${org.data?.organization.displayName ?? ''}`}
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setInvite(true)}>
              <UserPlus /> Add member
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-9 w-60 rounded-xl border border-line bg-surface pl-8 pr-3 text-[13px] outline-none focus:ring-4 focus:ring-brand/10" />
        </div>
        <Select className="h-9 w-48" value={dept} onValueChange={setDept} aria-label="Department" options={[{ value: 'any', label: 'All departments' }, ...(org.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
      </div>
      {members.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !list.length ? (
        <Card>
          <Empty title="No one matches" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((m) => (
            <button key={m.id} onClick={() => router.push(`${path}?member=${m.id}`, { scroll: false })} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left shadow-[var(--shadow-sm)] transition hover:border-line-strong hover:shadow-[var(--shadow-md)]">
              <span className="relative">
                <AvatarPortrait name={m.name} size={52} />
                <PresenceDot status={m.presence} className="absolute bottom-0.5 right-0.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">{m.name}</span>
                <span className="block truncate text-[12px] text-muted">{m.title ?? '—'}</span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {m.departments.slice(0, 2).map((d) => {
                    const dd = org.data?.departments.find((x) => x.id === d.departmentId);
                    return dd ? (
                      <Badge key={d.departmentId} tone={d.role === 'admin' ? 'brand' : 'neutral'}>
                        {dd.name}
                        {d.role === 'admin' ? ' · Admin' : ''}
                      </Badge>
                    ) : null;
                  })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Sheet open={!!selected} onOpenChange={(o) => !o && router.replace(path, { scroll: false })} title="Profile" width="max-w-[520px]">
        {selected && <Profile id={selected} onClose={() => router.replace(path, { scroll: false })} />}
      </Sheet>
      <InviteDialog open={invite} onOpenChange={setInvite} />
    </div>
  );
}

function Profile({ id, onClose }: { id: string; onClose: () => void }) {
  const orgId = useOrgId();
  const org = useOrg();
  const router = useRouter();
  const qc = useQueryClient();
  const members = useMembers();
  const m = members.data?.find((x) => x.id === id);
  const tasks = useTasks({ assignee: id, parentId: 'root' });
  if (!m) return <div className="p-6"><Skeleton className="h-40" /></div>;
  const isMe = m.id === org.data?.me.memberId;
  const isAdmin = org.data?.me.role === 'company_admin';
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end p-3">
        <Button size="iconSm" variant="ghost" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex gap-4">
          <AvatarPortrait name={m.name} size={84} />
          <div className="min-w-0 flex-1 pt-2">
            <h2 className="text-[19px] font-bold">{m.name}</h2>
            <p className="text-[13px] text-muted">{m.title}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <PresenceBadge status={m.presence} />
              <Badge tone="lavender">{ROLE_LABEL[m.role]}</Badge>
            </div>
            {m.email && (
              <button className="mt-2 flex cursor-pointer items-center gap-1.5 text-[12px] text-muted hover:text-ink" onClick={() => { navigator.clipboard?.writeText(m.email!); toast.success('Email copied'); }}>
                <Copy className="h-3 w-3" /> {m.email}
              </button>
            )}
            <div className="mt-3 flex gap-2">
              {isMe ? (
                <Button size="sm" variant="soft" onClick={() => router.push(`/o/${orgId}/preferences`)}>
                  <SlidersHorizontal /> My preferences
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    const c = await api.post<{ id: string }>(`/orgs/${orgId}/conversations`, { memberId: m.id });
                    router.push(`/o/${orgId}/messages?c=${c.id}`);
                  }}
                >
                  <MessageCircle /> Message
                </Button>
              )}
            </div>
          </div>
        </div>
        <section className="mt-6">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Departments</p>
          <div className="space-y-1.5">
            {m.departments.map((d) => {
              const dd = org.data?.departments.find((x) => x.id === d.departmentId);
              return dd ? (
                <div key={d.departmentId} className="flex items-center gap-2.5 rounded-xl bg-bg-soft px-3 py-2">
                  <DeptIcon theme={dd.theme} color={dd.color} size={26} />
                  <span className="flex-1 text-[13px] font-semibold">{dd.name}</span>
                  <span className="text-[12px] text-muted">{d.role === 'admin' ? 'Department admin' : 'Member'}</span>
                </div>
              ) : null;
            })}
            {!m.departments.length && <p className="text-[12.5px] text-muted">Not in a department yet.</p>}
          </div>
        </section>
        {isAdmin && !isMe && (
          <section className="mt-6 rounded-2xl border border-line p-4">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Admin</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="h-9 w-48"
                value={m.role}
                aria-label="Company role"
                onValueChange={async (v) => {
                  try {
                    await api.patch(`/orgs/${orgId}/members/${m.id}`, { role: v });
                    qc.invalidateQueries({ queryKey: qk.members(orgId) });
                    toast.success('Role updated');
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
                options={ORG_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              />
              <Button
                size="sm"
                variant="outlineDanger"
                onClick={async () => {
                  if (!confirm(`Remove ${m.name} from this company? Their records stay, but they lose access.`)) return;
                  try {
                    await api.del(`/orgs/${orgId}/members/${m.id}`);
                    qc.invalidateQueries({ queryKey: qk.members(orgId) });
                    onClose();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                Remove from company
              </Button>
            </div>
          </section>
        )}
        <section className="mt-6">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Open tasks</p>
          <Card className="overflow-hidden">
            {tasks.isError ? <p className="p-4 text-[12.5px] text-muted">Not visible to you.</p> : <TaskList tasks={(tasks.data ?? []).filter((t) => t.status !== 'done')} emptyTitle="No open tasks" />}
          </Card>
        </section>
      </div>
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', title: '', role: 'employee', departmentId: 'none', departmentRole: 'member' });
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTemp(null);
      }}
    >
      <DialogContent title="Add a member" description="No email service is configured: new accounts get a one-time temporary password for you to share securely.">
        {temp ? (
          <div className="space-y-3">
            <p className="text-[13px]">Account created. Share this temporary password privately — it won’t be shown again:</p>
            <code className="block rounded-xl bg-bg p-3 text-[14px] font-semibold">{temp}</code>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await api.post<{ temporaryPassword?: string }>(`/orgs/${orgId}/members`, {
                  name: f.name,
                  email: f.email,
                  title: f.title || undefined,
                  role: f.role,
                  departmentId: f.departmentId === 'none' ? undefined : f.departmentId,
                  departmentRole: f.departmentRole,
                });
                qc.invalidateQueries({ queryKey: qk.members(orgId) });
                qc.invalidateQueries({ queryKey: qk.org(orgId) });
                if (r.temporaryPassword) setTemp(r.temporaryPassword);
                else {
                  toast.success('Existing user added');
                  onOpenChange(false);
                }
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name">
                <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </Field>
              <Field label="Job title">
                <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              </Field>
              <Field label="Company role">
                <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })} options={ORG_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
              </Field>
              <Field label="Department">
                <Select value={f.departmentId} onValueChange={(v) => setF({ ...f, departmentId: v })} options={[{ value: 'none', label: 'None' }, ...(org.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
              </Field>
              <Field label="Department role">
                <Select value={f.departmentRole} onValueChange={(v) => setF({ ...f, departmentRole: v })} options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Department admin' }]} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                Add member
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
