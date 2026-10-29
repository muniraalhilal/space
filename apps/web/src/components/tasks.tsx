'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { MessageSquare, ListTree, CalendarDays, Plus } from 'lucide-react';
import { TASK_STATUSES, TASK_STATUS_LABEL, PRIORITIES, type TaskStatus } from '@space/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAgents, useMembers, useOrg, useProjects } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import type { Task } from '@/lib/types';
import { AssigneeChip, PriorityBadge, TaskStatusIcon, TaskStatusBadge } from './domain';
import { Button, Dialog, DialogContent, Field, Input, Select, Textarea, ProgressBar, Empty } from './ui/primitives';
import { AvatarPortrait, RobotPortrait } from './avatar';
import { cn, dueLabel, isOverdue } from '@/lib/utils';

/** Link that opens the task drawer on the current page. */
export function useTaskHref() {
  const path = usePathname();
  const sp = useSearchParams();
  return (id: string) => {
    const n = new URLSearchParams(sp.toString());
    n.set('task', id);
    return `${path}?${n.toString()}`;
  };
}

export function TaskRow({ t, showProject = true }: { t: Task; showProject?: boolean }) {
  const href = useTaskHref();
  const members = useMembers();
  const agents = useAgents();
  return (
    <Link href={href(t.id)} scroll={false} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-bg-soft sm:grid-cols-[20px_minmax(0,1fr)_120px_110px_90px_80px_32px]">
      <TaskStatusIcon status={t.status} />
      <div className="min-w-0">
        <p className={cn('truncate text-[13.5px] font-semibold', t.status === 'done' && 'text-muted line-through')}>{t.title}</p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-[11.5px] text-muted">
          {showProject && t.projectName && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: t.projectColor ?? '#ccc' }} />
              {t.projectName}
            </span>
          )}
          {!!t.subtaskCount && (
            <span className="inline-flex items-center gap-1">
              <ListTree className="h-3 w-3" /> {t.subtaskDone}/{t.subtaskCount}
            </span>
          )}
          {!!t.commentCount && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {t.commentCount}
            </span>
          )}
        </p>
      </div>
      <span className="hidden sm:block">
        <TaskStatusBadge status={t.status} />
      </span>
      <span className="hidden items-center gap-2 sm:flex">
        <ProgressBar value={t.progress} className="w-14" />
        <span className="text-[11px] font-semibold text-ink-2">{t.progress}%</span>
      </span>
      <span className="hidden sm:block">
        <PriorityBadge priority={t.priority} />
      </span>
      <span className={cn('hidden text-[12px] font-medium sm:block', isOverdue(t.dueDate, t.status) ? 'text-rose-ink' : 'text-muted')}>{dueLabel(t.dueDate) ?? '—'}</span>
      <AssigneeChip memberId={t.assigneeMemberId} agentId={t.assigneeAgentId} members={members.data} agents={agents.data} size={26} />
    </Link>
  );
}

const COL_TINT: Record<TaskStatus, string> = { todo: '#f3f1ee', in_progress: '#eaf1fb', in_review: '#efebfb', blocked: '#fbeeee', done: '#ebf5ee' };

/** Kanban board with drag & drop between statuses (keyboard users change status in the task drawer). */
export function Board({ tasks, onCreate }: { tasks: Task[]; onCreate?: (status: TaskStatus) => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const href = useTaskHref();
  const members = useMembers();
  const agents = useAgents();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const by = useMemo(() => Object.fromEntries(TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s)])) as Record<TaskStatus, Task[]>, [tasks]);

  async function move(id: string, status: TaskStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    // optimistic update
    qc.setQueriesData<Task[]>({ queryKey: ['tasks', orgId] }, (old) => old?.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await api.patch(`/orgs/${orgId}/tasks/${id}`, { version: t.version, status });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      qc.invalidateQueries({ queryKey: ['tasks', orgId] });
    }
  }

  return (
    <div className="grid min-h-[420px] grid-flow-col auto-cols-[minmax(250px,1fr)] gap-3 overflow-x-auto pb-2">
      {TASK_STATUSES.map((s) => (
        <div
          key={s}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(s);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            move(e.dataTransfer.getData('text/task'), s);
          }}
          className={cn('flex flex-col rounded-2xl p-2.5 transition', over === s && 'ring-2 ring-brand/40')}
          style={{ background: COL_TINT[s] }}
        >
          <div className="mb-2 flex items-center gap-2 px-1.5">
            <TaskStatusIcon status={s} />
            <span className="text-[12.5px] font-bold">{TASK_STATUS_LABEL[s]}</span>
            <span className="text-[12px] text-muted">{by[s].length}</span>
            {onCreate && (
              <button onClick={() => onCreate(s)} className="ml-auto cursor-pointer rounded-md p-1 text-muted hover:bg-white hover:text-ink" aria-label={`Add task to ${TASK_STATUS_LABEL[s]}`}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            {by[s].map((t) => (
              <Link
                key={t.id}
                href={href(t.id)}
                scroll={false}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)}
                className="rounded-xl border border-white/60 bg-white p-3 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]"
              >
                <p className="text-[13px] font-semibold leading-snug">{t.title}</p>
                {t.projectName && <p className="mt-1 truncate text-[11.5px] text-muted">{t.projectName}</p>}
                {t.progress > 0 && t.status !== 'done' && <ProgressBar value={t.progress} className="mt-2" />}
                <div className="mt-2.5 flex items-center gap-2">
                  <PriorityBadge priority={t.priority} />
                  {t.dueDate && (
                    <span className={cn('inline-flex items-center gap-1 text-[11.5px]', isOverdue(t.dueDate, t.status) ? 'text-rose-ink' : 'text-muted')}>
                      <CalendarDays className="h-3 w-3" /> {dueLabel(t.dueDate)}
                    </span>
                  )}
                  <span className="ml-auto">
                    <AssigneeChip memberId={t.assigneeMemberId} agentId={t.assigneeAgentId} members={members.data} agents={agents.data} size={22} />
                  </span>
                </div>
              </Link>
            ))}
            {!by[s].length && <p className="px-2 py-4 text-center text-[12px] text-muted-2">Drop tasks here</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TaskList({ tasks, emptyTitle = 'No tasks here', showProject }: { tasks: Task[]; emptyTitle?: string; showProject?: boolean }) {
  if (!tasks.length) return <Empty title={emptyTitle} body="Tasks you can see will appear here." />;
  return (
    <div>
      <div className="hidden grid-cols-[20px_minmax(0,1fr)_120px_110px_90px_80px_32px] gap-3 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid">
        <span />
        <span>Task</span>
        <span>Status</span>
        <span>Progress</span>
        <span>Priority</span>
        <span>Due</span>
        <span />
      </div>
      {tasks.map((t) => (
        <TaskRow key={t.id} t={t} showProject={showProject} />
      ))}
    </div>
  );
}

/** Create task dialog. Only projects in departments the user can write to are offered. */
export function NewTaskDialog({ open, onOpenChange, projectId, status = 'todo', requestId }: { open: boolean; onOpenChange: (v: boolean) => void; projectId?: string; status?: TaskStatus; requestId?: string }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const org = useOrg();
  const projects = useProjects();
  const members = useMembers();
  const agents = useAgents();
  const writable = (projects.data ?? []).filter((p) => {
    const role = org.data?.me.departments[p.departmentId];
    return p.status === 'active' && (org.data?.me.role === 'company_admin' || (org.data?.me.role !== 'viewer' && role));
  });
  const [f, setF] = useState({ title: '', description: '', projectId: projectId ?? '', priority: 'medium', dueDate: '', assignee: 'none' });
  const [busy, setBusy] = useState(false);
  const pid = f.projectId || projectId || writable[0]?.id || '';
  const proj = projects.data?.find((p) => p.id === pid);
  const deptMembers = (members.data ?? []).filter((m) => proj && m.departments.some((d) => d.departmentId === proj.departmentId));
  const deptAgents = (agents.data ?? []).filter((a) => proj && a.enabled && (a.departmentId === proj.departmentId || !a.departmentId));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/tasks`, {
        projectId: pid,
        title: f.title,
        description: f.description || undefined,
        priority: f.priority,
        status,
        dueDate: f.dueDate || null,
        requestId,
        assignee: f.assignee === 'none' ? null : { kind: f.assignee.split(':')[0], id: f.assignee.split(':')[1] },
      });
      toast.success('Task created');
      qc.invalidateQueries({ queryKey: ['tasks', orgId] });
      qc.invalidateQueries({ queryKey: ['projects', orgId] });
      setF({ ...f, title: '', description: '' });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New task" description={proj ? `In ${proj.name}` : undefined}>
        {!writable.length ? (
          <p className="text-[13px] text-muted">You don’t have write access to any active project. Ask a department admin to create a project or add you to their department.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3.5">
            <Field label="Title">
              <Input autoFocus required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What needs to be done?" />
            </Field>
            {!projectId && (
              <Field label="Project">
                <Select value={pid} onValueChange={(v) => setF({ ...f, projectId: v, assignee: 'none' })} options={writable.map((p) => ({ value: p.id, label: p.name }))} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Assignee">
              <Select
                value={f.assignee}
                onValueChange={(v) => setF({ ...f, assignee: v })}
                options={[
                  { value: 'none', label: 'Unassigned' },
                  ...deptMembers.map((m) => ({ value: `member:${m.id}`, label: <span className="flex items-center gap-2"><AvatarPortrait name={m.name} size={20} />{m.name}</span> })),
                  ...deptAgents.map((a) => ({ value: `agent:${a.id}`, label: <span className="flex items-center gap-2"><RobotPortrait config={a.robot} size={20} />{a.name} · AI agent</span> })),
                ]}
              />
            </Field>
            <Field label="Description">
              <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Optional details" />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!f.title.trim() || !pid}>
                Create task
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
