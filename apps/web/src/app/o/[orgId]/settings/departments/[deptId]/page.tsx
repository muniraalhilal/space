'use client';
import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, UserMinus, Lock } from 'lucide-react';
import type { DeptTheme } from '@space/shared';
import { useDepartment, useMembers, useOrg, useApiMutation, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, Card, Dialog, DialogContent, Empty, Input, Select, Skeleton } from '@/components/ui/primitives';
import { AvatarPortrait, PresenceBadge } from '@/components/avatar';
import { DeptIcon } from '@/components/domain';
import { DepartmentForm } from '@/components/settings-forms';

export default function DepartmentSettingsPage({ params }: { params: Promise<{ deptId: string }> }) {
  const { deptId } = use(params);
  const orgId = useOrgId();
  const router = useRouter();
  const org = useOrg();
  const dept = useDepartment(deptId);
  const members = useMembers();
  const isCompanyAdmin = org.data?.me.role === 'company_admin';
  const [adding, setAdding] = useState('');
  const [find, setFind] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const inv = () => [qk.dept(orgId, deptId), qk.org(orgId), qk.members(orgId), qk.office(orgId)];
  const update = useApiMutation((b: object) => api.patch(`/orgs/${orgId}/departments/${deptId}`, b), inv);
  const setMember = useApiMutation((b: { memberId: string; role: 'admin' | 'member' }) => api.put(`/orgs/${orgId}/departments/${deptId}/members`, b), inv);
  const removeMember = useApiMutation((memberId: string) => api.del(`/orgs/${orgId}/departments/${deptId}/members/${memberId}`), inv);
  const del = useApiMutation(() => api.del(`/orgs/${orgId}/departments/${deptId}`), () => [qk.org(orgId), qk.office(orgId), qk.members(orgId)]);
  const d = dept.data;
  const initial = useMemo(() => (d ? { name: d.name, description: d.description ?? '', theme: d.theme as DeptTheme, color: d.color, floor: d.floor } : null), [d]);

  if (dept.isLoading || org.isLoading) return <Skeleton className="mx-auto h-96 max-w-[900px]" />;
  if (!d) return <Empty title="Department not found" />;
  if (!d.canAdmin) return <Empty icon={<Lock />} title="Department admins only" body="Ask a department or company admin to make changes here." />;

  const inDept = new Set(d.members.map((m) => m.id));
  const candidates = (members.data ?? []).filter((m) => !inDept.has(m.id) && m.name.toLowerCase().includes(find.toLowerCase()));
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  return (
    <div className="mx-auto max-w-[900px]">
      <Link href={`/o/${orgId}/settings?tab=departments`} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All departments
      </Link>
      <div className="mb-5 flex items-center gap-3">
        <DeptIcon theme={d.theme as DeptTheme} color={d.color} size={44} />
        <div className="flex-1">
          <h1 className="text-[20px] font-bold">{d.name}</h1>
          <p className="text-[13px] text-muted">Department settings</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push(`/o/${orgId}/departments/${deptId}`)}>Open department</Button>
      </div>

      <Card className="mb-4 p-6">
        <h2 className="mb-1 text-[15px] font-bold">Details</h2>
        {!isCompanyAdmin && <p className="mb-3 text-[12px] text-muted">Renaming or moving a department to another floor needs a company admin.</p>}
        {initial && (
          <DepartmentForm
            initial={initial}
            submitLabel="Save details"
            pending={update.isPending}
            onSubmit={(v) => {
              const patch: Record<string, unknown> = { description: v.description, theme: v.theme, color: v.color };
              if (isCompanyAdmin) Object.assign(patch, { name: v.name, floor: v.floor });
              update.mutate(patch, { onSuccess: () => toast.success('Department updated'), onError: onErr });
            }}
          />
        )}
      </Card>

      <Card className="mb-4 p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">Members</h2>
            <p className="text-[12px] text-muted">Department admins can manage this department’s work, members and agent approvals.{!isCompanyAdmin && ' Only company admins can make someone a department admin.'}</p>
          </div>
        </div>
        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <Select
              aria-label="Person to add"
              value={adding || undefined}
              placeholder="Add someone to this department…"
              onValueChange={setAdding}
              options={candidates.slice(0, 60).map((m) => ({ value: m.id, label: `${m.name}${m.title ? ` — ${m.title}` : ''}` }))}
            />
          </div>
          <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Filter…" className="w-36" aria-label="Filter people" />
          <Button
            variant="primary"
            disabled={!adding || setMember.isPending}
            onClick={() =>
              setMember.mutate(
                { memberId: adding, role: 'member' },
                {
                  onSuccess: () => {
                    toast.success('Added to department');
                    setAdding('');
                  },
                  onError: onErr,
                },
              )
            }
          >
            <Plus /> Add
          </Button>
        </div>
        {!d.members.length ? (
          <Empty title="No members yet" />
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line">
            {d.members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <AvatarPortrait name={m.name} size={34} />
                <div className="min-w-[160px] flex-1">
                  <p className="text-[13px] font-semibold">{m.name}</p>
                  <p className="text-[12px] text-muted">{m.title}</p>
                </div>
                <PresenceBadge status={m.presence as never} />
                {isCompanyAdmin ? (
                  <Select
                    aria-label={`Department role for ${m.name}`}
                    className="h-9 w-[170px]"
                    value={m.role}
                    onValueChange={(v) => setMember.mutate({ memberId: m.id, role: v as 'admin' | 'member' }, { onSuccess: () => toast.success('Role updated'), onError: onErr })}
                    options={[
                      { value: 'member', label: 'Member' },
                      { value: 'admin', label: 'Department admin' },
                    ]}
                  />
                ) : (
                  <Badge tone={m.role === 'admin' ? 'brand' : 'neutral'}>{m.role === 'admin' ? 'Department admin' : 'Member'}</Badge>
                )}
                <Button size="iconSm" variant="ghost" aria-label={`Remove ${m.name} from department`} onClick={() => removeMember.mutate(m.id, { onSuccess: () => toast.success(`${m.name} removed from ${d.name}`), onError: onErr })}>
                  <UserMinus />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isCompanyAdmin && (
        <Card className="mb-8 border-rose/60 p-6">
          <h2 className="text-[15px] font-bold text-rose-ink">Delete department</h2>
          <p className="mb-3 mt-1 text-[12.5px] text-muted">Removes the room from the office. A department can only be deleted once it has no projects and no requests to or from it. This can’t be undone.</p>
          <Button variant="outlineDanger" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete {d.name}
          </Button>
        </Card>
      )}
      <Dialog open={confirmDelete} onOpenChange={(v) => { setConfirmDelete(v); setConfirmName(''); }}>
        <DialogContent title={`Delete ${d.name}?`} description={`Type the department name to confirm.`}>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={d.name} aria-label="Department name" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirmName !== d.name || del.isPending}
              onClick={() =>
                del.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(`${d.name} deleted`);
                    router.replace(`/o/${orgId}/settings?tab=departments`);
                  },
                  onError: onErr,
                })
              }
            >
              Delete department
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
