'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings, Building2, Users, Plug, ScrollText, Plus, ChevronRight, GitBranch, Bot, ShieldCheck, Copy, UserMinus, Lock } from 'lucide-react';
import { type DeptTheme, type OrgRole } from '@space/shared';
import { useAgentMeta, useMembers, useOrg, useApiMutation, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, Card, Dialog, DialogContent, Empty, Field, Input, PageHeader, Select, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { AvatarPortrait } from '@/components/avatar';
import { DeptIcon } from '@/components/domain';
import { ColorField, DepartmentForm } from '@/components/settings-forms';
import { ago, cn } from '@/lib/utils';

const ROLE_LABEL: Record<OrgRole, string> = { company_admin: 'Company Admin', employee: 'Employee', viewer: 'Viewer' };
const TABS = ['company', 'departments', 'members', 'integrations', 'audit'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const org = useOrg();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const isAdmin = org.data?.me.role === 'company_admin';
  const tab = (TABS.includes(sp.get('tab') as Tab) ? sp.get('tab') : 'company') as Tab;
  if (org.isLoading) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader icon={<Settings className="text-brand" />} title="Settings" subtitle={isAdmin ? `Manage ${org.data?.organization.displayName}` : 'Company settings are managed by company admins.'} />
      <Tabs value={tab} onValueChange={(v) => router.replace(`${path}?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-5 overflow-x-auto">
          <TabsTrigger value="company"><span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Company</span></TabsTrigger>
          <TabsTrigger value="departments"><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Departments</span></TabsTrigger>
          <TabsTrigger value="members"><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Members & roles</span></TabsTrigger>
          <TabsTrigger value="integrations"><span className="flex items-center gap-1.5"><Plug className="h-3.5 w-3.5" /> AI & integrations</span></TabsTrigger>
          <TabsTrigger value="audit"><span className="flex items-center gap-1.5"><ScrollText className="h-3.5 w-3.5" /> Audit log</span></TabsTrigger>
        </TabsList>
        <TabsContent value="company"><CompanyTab admin={isAdmin} /></TabsContent>
        <TabsContent value="departments"><DepartmentsTab admin={isAdmin} /></TabsContent>
        <TabsContent value="members"><MembersTab admin={isAdmin} /></TabsContent>
        <TabsContent value="integrations">{isAdmin ? <IntegrationsTab /> : <AdminOnly />}</TabsContent>
        <TabsContent value="audit">{isAdmin ? <AuditTab /> : <AdminOnly />}</TabsContent>
      </Tabs>
    </div>
  );
}

function AdminOnly() {
  return <Empty icon={<Lock />} title="Company admins only" body="Ask a company admin if something here needs to change." />;
}

function Section({ title, description, children, footer, action }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex items-start gap-4 px-6 pt-5">
        <div className="flex-1">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line bg-bg-soft px-6 py-3">{footer}</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------ company */

function CompanyTab({ admin }: { admin: boolean }) {
  const orgId = useOrgId();
  const org = useOrg();
  const o = org.data!.organization;
  const [form, setForm] = useState({ name: o.name, brandColor: o.brandColor, accentColor: o.accentColor, officeTheme: o.officeTheme });
  useEffect(() => setForm({ name: o.name, brandColor: o.brandColor, accentColor: o.accentColor, officeTheme: o.officeTheme }), [o.name, o.brandColor, o.accentColor, o.officeTheme]);
  const save = useApiMutation((b: typeof form) => api.patch(`/orgs/${orgId}`, b), () => [qk.org(orgId), ['me']]);
  const dirty = form.name !== o.name || form.brandColor !== o.brandColor || form.accentColor !== o.accentColor || form.officeTheme !== o.officeTheme;
  const valid = form.name.trim().length >= 2 && /^#[0-9a-f]{6}$/i.test(form.brandColor) && /^#[0-9a-f]{6}$/i.test(form.accentColor);
  return (
    <Section
      title="Company profile"
      description="Your workspace is shown as “Company name + Space” everywhere in the product."
      footer={
        admin && (
          <Button
            variant="primary"
            disabled={!dirty || !valid || save.isPending}
            onClick={() => save.mutate({ ...form, name: form.name.trim() }, { onSuccess: () => toast.success('Company updated'), onError: (e) => toast.error(errorMessage(e)) })}
          >
            Save changes
          </Button>
        )
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Field label="Company name" hint={`Shown as “${form.name.trim() || '…'} Space”.`}>
            <Input value={form.name} maxLength={60} disabled={!admin} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Brand colour" value={form.brandColor} disabled={!admin} onChange={(v) => setForm({ ...form, brandColor: v })} />
            <ColorField label="Accent colour" value={form.accentColor} disabled={!admin} onChange={(v) => setForm({ ...form, accentColor: v })} />
          </div>
          <Field label="Office lighting" hint="Tints the 3D office.">
            <Select
              value={form.officeTheme}
              disabled={!admin}
              onValueChange={(v) => setForm({ ...form, officeTheme: v as typeof form.officeTheme })}
              options={[
                { value: 'warm', label: 'Warm' },
                { value: 'light', label: 'Light' },
                { value: 'cool', label: 'Cool' },
              ]}
            />
          </Field>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Preview</p>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[15px] font-extrabold text-white" style={{ background: form.brandColor }}>
              {form.name.trim()[0]?.toUpperCase() ?? 'S'}
            </span>
            <span className="text-[16px] font-extrabold tracking-[-0.02em]">{form.name.trim() || 'Company'} Space</span>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: form.brandColor }}>Primary</span>
            <span className="rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ background: form.accentColor + '33', color: form.accentColor }}>Accent</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ departments */

function DepartmentsTab({ admin }: { admin: boolean }) {
  const orgId = useOrgId();
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const depts = org.data?.departments ?? [];
  return (
    <Section
      title="Departments"
      description="Each department gets a room in the office. Department admins manage their own members and work."
      action={admin && <Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus /> New department</Button>}
    >
      {!depts.length ? (
        <Empty title="No departments yet" />
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line">
          {depts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <DeptIcon theme={d.theme} color={d.color} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold">{d.name}</p>
                <p className="text-[12px] text-muted">
                  Floor {d.floor} · {d.memberCount} members · {d.agentCount} AI agents{d.myRole ? ` · You are ${d.myRole === 'admin' ? 'an admin' : 'a member'}` : ''}
                </p>
              </div>
              {d.canAdmin ? (
                <Link href={`/o/${orgId}/settings/departments/${d.id}`} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-ink hover:bg-brand-soft">
                  Manage <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Link href={`/o/${orgId}/departments/${d.id}`} className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-bg">
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
      <NewDepartmentDialog open={open} onOpenChange={setOpen} />
    </Section>
  );
}

function NewDepartmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const orgId = useOrgId();
  const router = useRouter();
  const create = useApiMutation((b: object) => api.post<{ id: string }>(`/orgs/${orgId}/departments`, b), () => [qk.org(orgId), qk.office(orgId)]);
  const initial = useMemo(() => ({ name: '', description: '', theme: 'general' as DeptTheme, color: '#9fb7e6', floor: 1 }), []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New department" description="A room is added to the office on the floor you choose.">
        <DepartmentForm
          initial={initial}
          submitLabel="Create department"
          pending={create.isPending}
          onSubmit={(v) =>
            create.mutate(v, {
              onSuccess: (r) => {
                toast.success(`${v.name} created`);
                onOpenChange(false);
                router.push(`/o/${orgId}/settings/departments/${r.id}`);
              },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ members */

const PERMISSIONS: Array<{ label: string; admin: string; dadmin: string; employee: string; viewer: string }> = [
  { label: 'See the office, people and presence', admin: 'Yes', dadmin: 'Yes', employee: 'Yes', viewer: 'Yes' },
  { label: 'See a department’s tasks, projects and files', admin: 'All', dadmin: 'Own depts', employee: 'Own depts', viewer: 'Own depts' },
  { label: 'Create and update tasks', admin: 'All', dadmin: 'Own depts', employee: 'Own depts', viewer: 'No' },
  { label: 'Send and act on cross-department requests', admin: 'All', dadmin: 'Own depts', employee: 'View & comment', viewer: 'View' },
  { label: 'Manage department members and settings', admin: 'All', dadmin: 'Own depts', employee: 'No', viewer: 'No' },
  { label: 'Run AI agents', admin: 'All', dadmin: 'Own depts, incl. company-wide agents', employee: 'Own department’s agents', viewer: 'No' },
  { label: 'Approve agent actions', admin: 'All', dadmin: 'Own depts', employee: 'No', viewer: 'No' },
  { label: 'Company settings, members, integrations, audit log', admin: 'Yes', dadmin: 'No', employee: 'No', viewer: 'No' },
];

function MembersTab({ admin }: { admin: boolean }) {
  const orgId = useOrgId();
  const org = useOrg();
  const members = useMembers();
  const [q, setQ] = useState('');
  const [invite, setInvite] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const update = useApiMutation(({ id, role }: { id: string; role: OrgRole }) => api.patch(`/orgs/${orgId}/members/${id}`, { role }), () => [qk.members(orgId), qk.org(orgId)]);
  const remove = useApiMutation((id: string) => api.del(`/orgs/${orgId}/members/${id}`), () => [qk.members(orgId), qk.org(orgId)]);
  const depts = org.data?.departments ?? [];
  const list = (members.data ?? []).filter((m) => (m.name + ' ' + (m.title ?? '') + ' ' + (m.email ?? '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Section
        title="Members"
        description={admin ? 'Company roles control what each person can do across the whole company.' : 'Everyone in your company.'}
        action={admin && <Button variant="primary" size="sm" onClick={() => setInvite(true)}><Plus /> Add member</Button>}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or email…" className="mb-3 max-w-sm" aria-label="Search members" />
        <div className="max-h-[520px] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
          {list.map((m) => {
            const isMe = m.id === org.data?.me.memberId;
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <AvatarPortrait name={m.name} size={34} />
                <div className="min-w-[180px] flex-1">
                  <p className="text-[13px] font-semibold">
                    {m.name} {isMe && <span className="text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-[12px] text-muted">
                    {[m.title, m.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="hidden min-w-[160px] flex-wrap gap-1 lg:flex">
                  {m.departments.map((d) => {
                    const dd = depts.find((x) => x.id === d.departmentId);
                    return dd ? (
                      <Badge key={d.departmentId} tone={d.role === 'admin' ? 'brand' : 'neutral'}>
                        {dd.name}
                        {d.role === 'admin' ? ' · admin' : ''}
                      </Badge>
                    ) : null;
                  })}
                </div>
                {admin ? (
                  <div className="flex items-center gap-1.5">
                    <Select
                      aria-label={`Role for ${m.name}`}
                      className="h-9 w-[160px]"
                      value={m.role}
                      onValueChange={(v) => update.mutate({ id: m.id, role: v as OrgRole }, { onSuccess: () => toast.success(`${m.name} is now ${ROLE_LABEL[v as OrgRole]}`), onError: (e) => toast.error(errorMessage(e)) })}
                      options={(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                    />
                    <Button size="iconSm" variant="ghost" aria-label={`Remove ${m.name}`} disabled={isMe} onClick={() => setConfirm({ id: m.id, name: m.name })}>
                      <UserMinus />
                    </Button>
                  </div>
                ) : (
                  <Badge tone="lavender">{ROLE_LABEL[m.role]}</Badge>
                )}
              </div>
            );
          })}
          {!list.length && <p className="p-4 text-[12.5px] text-muted">No one matches “{q}”.</p>}
        </div>
      </Section>

      <Section title="What each role can do" description="Department admin is a role inside a department, given on the department’s settings page.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">Permission</th>
                <th className="px-3 py-2 font-semibold">Company Admin</th>
                <th className="px-3 py-2 font-semibold">Department Admin</th>
                <th className="px-3 py-2 font-semibold">Employee</th>
                <th className="px-3 py-2 font-semibold">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PERMISSIONS.map((p) => (
                <tr key={p.label}>
                  <td className="py-2.5 pr-3 font-medium text-ink-2">{p.label}</td>
                  {[p.admin, p.dadmin, p.employee, p.viewer].map((v, i) => (
                    <td key={i} className={cn('px-3 py-2.5', v === 'No' ? 'text-muted-2' : 'font-semibold text-ink')}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-muted">AI agents act with their own role: only the tools an admin enabled, only inside the department a run was started for, and external writes always wait for a person’s approval.</p>
      </Section>

      <InviteDialog open={invite} onOpenChange={setInvite} />
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent title={`Remove ${confirm?.name}?`} description="They lose access to this company right away. Their past work, comments and files stay.">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() =>
                confirm &&
                remove.mutate(confirm.id, {
                  onSuccess: () => {
                    toast.success(`${confirm.name} removed`);
                    setConfirm(null);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const orgId = useOrgId();
  const org = useOrg();
  const empty = { email: '', name: '', title: '', role: 'employee' as OrgRole, departmentId: '', departmentRole: 'member' as 'member' | 'admin' };
  const [f, setF] = useState(empty);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const invite = useApiMutation((b: object) => api.post<{ memberId: string; temporaryPassword?: string; note?: string }>(`/orgs/${orgId}/members`, b), () => [qk.members(orgId), qk.org(orgId)]);
  const valid = /^\S+@\S+\.\S+$/.test(f.email) && f.name.trim().length >= 2;
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setF(empty);
      setTemp(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={temp ? 'Member added' : 'Add a member'} description={temp ? undefined : 'Email delivery isn’t configured, so new people get a one-time temporary password for you to share securely.'}>
        {temp ? (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-2">
              Share this temporary password with <b>{temp.email}</b>. It is shown only once.
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 font-mono text-[13px]">
              <span className="flex-1 select-all">{temp.password}</span>
              <Button size="iconSm" variant="ghost" aria-label="Copy password" onClick={() => navigator.clipboard?.writeText(temp.password).then(() => toast.success('Copied'))}>
                <Copy />
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              invite.mutate(
                { email: f.email.trim(), name: f.name.trim(), title: f.title.trim() || undefined, role: f.role, departmentId: f.departmentId || undefined, departmentRole: f.departmentId ? f.departmentRole : undefined },
                {
                  onSuccess: (r) => {
                    if (r.temporaryPassword) setTemp({ email: f.email.trim(), password: r.temporaryPassword });
                    else {
                      toast.success(r.note ? `${f.name.trim()} added. ${r.note}` : `${f.name.trim()} added — they can sign in with their existing account`);
                      close(false);
                    }
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                },
              );
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Job title"><Input value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
              <Field label="Company role">
                <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as OrgRole })} options={(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department (optional)">
                <Select value={f.departmentId || 'none'} onValueChange={(v) => setF({ ...f, departmentId: v === 'none' ? '' : v })} options={[{ value: 'none', label: 'No department' }, ...(org.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
              </Field>
              <Field label="Department role">
                <Select value={f.departmentRole} disabled={!f.departmentId} onValueChange={(v) => setF({ ...f, departmentRole: v as 'member' | 'admin' })} options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Department admin' }]} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!valid || invite.isPending}>Add member</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ integrations */

function IntegrationsTab() {
  const orgId = useOrgId();
  const org = useOrg();
  const meta = useAgentMeta();
  const s = org.data!.organization.settings ?? {};
  const saveOrg = useApiMutation((settings: object) => api.patch(`/orgs/${orgId}`, { settings }), () => [qk.org(orgId)]);
  const [budget, setBudget] = useState(String(s.defaultAgentMonthlyBudgetUsd ?? 25));
  const gh = useQuery({ queryKey: qk.github(orgId), queryFn: () => api.get<{ enabled: boolean; allowedRepos: string[]; hasToken: boolean; updatedAt: string | null }>(`/orgs/${orgId}/integrations/github`) });
  const [repos, setRepos] = useState('');
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (gh.data) {
      setRepos(gh.data.allowedRepos.join('\n'));
      setEnabled(gh.data.enabled);
    }
  }, [gh.data]);
  const saveGh = useApiMutation((b: object) => api.put(`/orgs/${orgId}/integrations/github`, b), () => [qk.github(orgId)]);
  const repoList = repos.split(/[\n,]/).map((r) => r.trim()).filter(Boolean);
  const badRepo = repoList.find((r) => !/^[\w.-]+\/[\w.-]+$/.test(r));
  const toggle = (k: string, v: boolean) => saveOrg.mutate({ [k]: v }, { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(errorMessage(e)) });

  return (
    <>
      <Section title="AI model provider" description="Agents that use a language model need a provider configured on the server.">
        <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', meta.data?.provider ? 'bg-sage text-sage-ink' : 'bg-butter text-butter-ink')}>
            <Bot className="h-5 w-5" />
          </span>
          <div className="flex-1">
            {meta.isLoading ? (
              <p className="text-[13px] text-muted">Checking…</p>
            ) : meta.data?.provider ? (
              <>
                <p className="text-[13.5px] font-bold">Connected · {meta.data.provider.name}</p>
                <p className="text-[12px] text-muted">Model: {meta.data.provider.model}</p>
              </>
            ) : (
              <>
                <p className="text-[13.5px] font-bold">Not configured</p>
                <p className="text-[12px] text-muted">
                  Model-driven runs aren’t switched on for this Space. Built-in workflows (reports, digests, action items) work without them.
                </p>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Agent safety" description="Company-wide limits that apply to every AI agent.">
        <div className="space-y-4">
          <SettingRow title="Require approval for agent writes inside Space" body="When on, even autonomous agents ask before creating tasks, comments or documents. Writes to external services always need approval.">
            <Switch label="Require approval for agent writes" checked={s.requireApprovalForAgentWrites ?? true} onCheckedChange={(v) => toggle('requireApprovalForAgentWrites', v)} />
          </SettingRow>
          <SettingRow title="Allow external integrations" body="Lets agents use connected services such as GitHub, limited to the repositories listed below.">
            <Switch label="Allow external integrations" checked={s.allowAgentExternalIntegrations ?? false} onCheckedChange={(v) => toggle('allowAgentExternalIntegrations', v)} />
          </SettingRow>
          <SettingRow title="Default monthly budget per agent (USD)" body="New agents start with this limit. Runs stop when an agent reaches its budget.">
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={100000} step={1} value={budget} onChange={(e) => setBudget(e.target.value)} className="w-28" aria-label="Default monthly budget" />
              <Button
                size="sm"
                variant="secondary"
                disabled={budget === String(s.defaultAgentMonthlyBudgetUsd ?? 25) || !(+budget >= 0)}
                onClick={() => saveOrg.mutate({ defaultAgentMonthlyBudgetUsd: +budget }, { onSuccess: () => toast.success('Budget saved'), onError: (e) => toast.error(errorMessage(e)) })}
              >
                Save
              </Button>
            </div>
          </SettingRow>
        </div>
      </Section>

      <Section
        title="GitHub"
        description="Agents with GitHub tools can read issues, pull requests and commits in allowed repositories. Creating issues always needs approval."
        footer={
          !(gh.data as { unavailable?: boolean } | undefined)?.unavailable && <Button
            variant="primary"
            disabled={!!badRepo || saveGh.isPending}
            onClick={() =>
              saveGh.mutate(
                { enabled, allowedRepos: repoList, ...(token.trim() ? { token: token.trim() } : {}) },
                {
                  onSuccess: () => {
                    setToken('');
                    toast.success('GitHub settings saved');
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            Save GitHub settings
          </Button>
        }
      >
        {(gh.data as { unavailable?: boolean } | undefined)?.unavailable ? (
          <p className="rounded-xl bg-bg-soft p-3 text-[12.5px] text-muted">GitHub can’t be connected in this hosted Space because the page can’t reach GitHub. The self-hosted version of Space supports GitHub tools.</p>
        ) : gh.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <GitBranch className="h-5 w-5" />
              <p className="flex-1 text-[13px]">
                {gh.data?.hasToken ? <span className="font-semibold text-sage-ink">A token is saved</span> : <span className="font-semibold text-muted">No token saved</span>}
                {gh.data?.updatedAt && <span className="text-muted"> · updated {ago(gh.data.updatedAt)}</span>}
              </p>
              <span className="text-[12.5px] font-semibold text-ink-2">Enabled</span>
              <Switch label="Enable GitHub" checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <Field label={gh.data?.hasToken ? 'Replace token (optional)' : 'Personal access token'} hint="Stored encrypted. It is never shown again or sent to the browser. Use a fine-grained token with read access (and issues: write if agents may open issues).">
              <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" />
            </Field>
            <Field label="Allowed repositories" hint="One per line, as owner/name. Agents can't reach any other repository." error={badRepo ? `“${badRepo}” isn't in owner/name form` : undefined}>
              <Textarea rows={3} value={repos} onChange={(e) => setRepos(e.target.value)} placeholder={'juniper/platform\njuniper/website'} className="font-mono text-[12.5px]" />
            </Field>
          </div>
        )}
      </Section>
    </>
  );
}

function SettingRow({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1">
        <p className="text-[13.5px] font-semibold">{title}</p>
        <p className="text-[12px] text-muted">{body}</p>
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ audit */

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  data: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
  actorName: string | null;
  actorAgentId: string | null;
}

function AuditTab() {
  const orgId = useOrgId();
  const [q, setQ] = useState('');
  const audit = useQuery({ queryKey: qk.audit(orgId), queryFn: () => api.get<AuditRow[]>(`/orgs/${orgId}/audit`) });
  const rows = (audit.data ?? []).filter((r) => (r.action + ' ' + (r.actorName ?? '') + ' ' + (r.entityType ?? '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title="Audit log" description="Security-relevant changes in this company: sign-ins, roles, settings, integrations and agent approvals. Latest 200 entries.">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by action or person…" className="mb-3 max-w-sm" aria-label="Filter audit log" />
      {audit.isLoading ? (
        <Skeleton className="h-60" />
      ) : !rows.length ? (
        <Empty title="No entries" />
      ) : (
        <div className="max-h-[560px] overflow-auto rounded-2xl border border-line">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-4 py-2 font-semibold">Who</th>
                <th className="px-4 py-2 font-semibold">Action</th>
                <th className="px-4 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted" title={new Date(r.createdAt).toLocaleString()}>{ago(r.createdAt)}</td>
                  <td className="px-4 py-2.5 font-medium">{r.actorName ?? (r.actorAgentId ? 'AI agent' : 'System')}</td>
                  <td className="px-4 py-2.5">
                    <code className="rounded bg-bg px-1.5 py-0.5 text-[11.5px]">{r.action}</code>
                  </td>
                  <td className="max-w-[380px] px-4 py-2.5 text-muted">
                    <span className="line-clamp-2 break-all font-mono text-[11px]">{Object.keys(r.data ?? {}).length ? JSON.stringify(r.data) : '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
