'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FolderKanban, Plus, CalendarDays } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg, useProjects } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, Card, Dialog, DialogContent, Empty, Field, Input, PageHeader, ProgressBar, Select, Skeleton, Textarea } from '@/components/ui/primitives';
import { DeptIcon } from '@/components/domain';
import { dueLabel } from '@/lib/utils';

export default function ProjectsPage() {
  const orgId = useOrgId();
  const org = useOrg();
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  const adminDepts = (org.data?.departments ?? []).filter((d) => d.canAdmin);
  const groups = (org.data?.departments ?? [])
    .map((d) => ({ d, items: (projects.data ?? []).filter((p) => p.departmentId === d.id) }))
    .filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        icon={<FolderKanban className="text-lavender-ink" />}
        title="Projects"
        subtitle="Projects in the departments you belong to"
        actions={
          adminDepts.length > 0 && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> New project
            </Button>
          )
        }
      />
      {projects.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : !groups.length ? (
        <Card>
          <Empty icon={<FolderKanban />} title="No projects yet" body="Department admins can create projects for their teams." />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ d, items }) => (
            <section key={d.id}>
              <div className="mb-2.5 flex items-center gap-2">
                <DeptIcon theme={d.theme} color={d.color} size={26} />
                <h2 className="text-[14px] font-bold">{d.name}</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((p) => {
                  const pct = p.taskCount ? Math.round(((p.doneCount ?? 0) / p.taskCount) * 100) : 0;
                  return (
                    <Link key={p.id} href={`/o/${orgId}/projects/${p.id}`} className="group rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-sm)] transition hover:border-line-strong hover:shadow-[var(--shadow-md)]">
                      <div className="flex items-start gap-2">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color ?? '#ccc' }} />
                        <p className="flex-1 text-[14px] font-bold leading-snug">{p.name}</p>
                        {p.status !== 'active' && <Badge>{p.status.replace('_', ' ')}</Badge>}
                      </div>
                      {p.description && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted">{p.description}</p>}
                      <div className="mt-4 flex items-center gap-2">
                        <ProgressBar value={pct} color={p.color ?? undefined} />
                        <span className="shrink-0 text-[11.5px] font-semibold text-ink-2">{pct}%</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted">
                        <span>
                          {p.doneCount}/{p.taskCount} tasks done
                        </span>
                        {p.dueDate && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> {dueLabel(p.dueDate)}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewProjectDialog({ open, onOpenChange, departmentId }: { open: boolean; onOpenChange: (v: boolean) => void; departmentId?: string }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const adminDepts = (org.data?.departments ?? []).filter((d) => d.canAdmin);
  const [f, setF] = useState({ name: '', description: '', departmentId: departmentId ?? '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const dept = f.departmentId || adminDepts[0]?.id;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New project">
        <form
          className="space-y-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.post(`/orgs/${orgId}/projects`, { name: f.name, description: f.description || undefined, departmentId: dept, dueDate: f.dueDate || null });
              qc.invalidateQueries({ queryKey: ['projects', orgId] });
              toast.success('Project created');
              onOpenChange(false);
              setF({ name: '', description: '', departmentId: departmentId ?? '', dueDate: '' });
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Name">
            <Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Department">
            <Select value={dept} onValueChange={(v) => setF({ ...f, departmentId: v })} options={adminDepts.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Field label="Target date">
            <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!f.name.trim() || !dept}>
              Create project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
