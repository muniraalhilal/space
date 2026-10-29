'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { X, Trash2, Link2, Paperclip, Plus, Send, Bot, CornerDownRight, Upload } from 'lucide-react';
import { TASK_STATUSES, TASK_STATUS_LABEL, PRIORITIES } from '@space/shared';
import { useAgents, useMembers, useTask, useTasks, useOrg, qk, useApiMutation } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Button, Select, Textarea, Input, Badge, Skeleton, ProgressBar } from '@/components/ui/primitives';
import { AssigneeChip, PriorityBadge, RequestStateBadge, TaskStatusIcon, DeptIcon } from '@/components/domain';
import { AvatarPortrait, RobotPortrait } from '@/components/avatar';
import { ago, bytes, cn, isOverdue } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import type { TaskDetail } from '@/lib/types';

const VERB: Record<string, string> = {
  created: 'created this task',
  status_changed: 'changed status',
  assigned: 'changed the assignee',
  updated: 'updated details',
  commented: 'commented',
  dependency_added: 'added a dependency',
};

export function TaskDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const task = useTask(id);
  const members = useMembers();
  const agents = useAgents();
  const org = useOrg();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [comment, setComment] = useState('');
  const [subtask, setSubtask] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const t = task.data;
  useEffect(() => {
    if (t) {
      setTitle(t.title);
      setDesc(t.description ?? '');
    }
  }, [t?.id, t?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.task(orgId, id) });
    qc.invalidateQueries({ queryKey: ['tasks', orgId] });
    qc.invalidateQueries({ queryKey: ['projects', orgId] });
  };

  async function patch(p: Record<string, unknown>) {
    if (!t) return;
    try {
      await api.patch(`/orgs/${orgId}/tasks/${id}`, { version: t.version, ...p });
      invalidate();
    } catch (e) {
      toast.error(errorMessage(e));
      invalidate();
    }
  }

  const addComment = useApiMutation((body: string) => api.post(`/orgs/${orgId}/tasks/${id}/comments`, { body }), () => [qk.task(orgId, id)]);
  const deptMembers = (members.data ?? []).filter((m) => t && m.departments.some((d) => d.departmentId === t.departmentId));
  const deptAgents = (agents.data ?? []).filter((a) => t && a.enabled && (a.departmentId === t.departmentId || !a.departmentId));
  const dept = org.data?.departments.find((d) => d.id === t?.departmentId);
  const projectTasks = useTasks({ projectId: t?.projectId, parentId: 'root' }, !!t);

  if (task.isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-40 w-full" /></div>;
  if (task.error || !t) return <div className="p-6 text-[13px] text-muted">This task doesn’t exist or you don’t have access to it.</div>;
  const ro = !t.canWrite;
  const assigneeValue = t.assigneeMemberId ? `member:${t.assigneeMemberId}` : t.assigneeAgentId ? `agent:${t.assigneeAgentId}` : 'none';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        {dept && <DeptIcon theme={dept.theme} color={dept.color} size={26} />}
        <span className="truncate text-[12.5px] font-semibold text-muted">
          {dept?.name} / {t.project.name}
          {t.parent && (
            <>
              {' / '}
              <Link href={`?task=${t.parent.id}`} className="hover:text-ink">
                {t.parent.title}
              </Link>
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {(t.canAdmin || t.createdByMemberId === org.data?.me.memberId) && !ro && (
            <Button
              size="iconSm"
              variant="ghost"
              aria-label="Delete task"
              onClick={async () => {
                if (!confirm('Delete this task and its subtasks?')) return;
                try {
                  await api.del(`/orgs/${orgId}/tasks/${id}`);
                  invalidate();
                  onClose();
                  toast.success('Task deleted');
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              <Trash2 />
            </Button>
          )}
          <Button size="iconSm" variant="ghost" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <textarea
          value={title}
          readOnly={ro}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== t.title && patch({ title: title.trim() })}
          rows={1}
          className="w-full resize-none bg-transparent text-[19px] font-bold leading-snug text-ink outline-none"
          aria-label="Task title"
        />
        {t.request && (
          <Link href={`?request=${t.request.id}`} className="mt-1 inline-flex items-center gap-2 rounded-lg bg-lavender/60 px-2.5 py-1 text-[12px] font-semibold text-lavender-ink">
            <Link2 className="h-3.5 w-3.5" /> Request #{t.request.number}: {t.request.title} <RequestStateBadge state={t.request.state} />
          </Link>
        )}

        <dl className="mt-4 grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
          <dt className="text-muted">Status</dt>
          <dd>
            <Select disabled={ro} value={t.status} onValueChange={(v) => patch({ status: v })} options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))} className="h-9 w-48" aria-label="Status" />
          </dd>
          <dt className="text-muted">Assignee</dt>
          <dd>
            <Select
              disabled={ro}
              value={assigneeValue}
              aria-label="Assignee"
              onValueChange={(v) => patch({ assignee: v === 'none' ? null : { kind: v.split(':')[0], id: v.split(':')[1] } })}
              className="h-9 w-64"
              options={[
                { value: 'none', label: 'Unassigned' },
                ...deptMembers.map((m) => ({ value: `member:${m.id}`, label: <span className="flex items-center gap-2"><AvatarPortrait name={m.name} size={20} />{m.name}</span> })),
                ...deptAgents.map((a) => ({ value: `agent:${a.id}`, label: <span className="flex items-center gap-2"><RobotPortrait config={a.robot} size={20} />{a.name} · AI</span> })),
              ]}
            />
          </dd>
          <dt className="text-muted">Priority</dt>
          <dd>
            <Select disabled={ro} value={t.priority} onValueChange={(v) => patch({ priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} className="h-9 w-40" aria-label="Priority" />
          </dd>
          <dt className="text-muted">Dates</dt>
          <dd className="flex items-center gap-2">
            <Input type="date" disabled={ro} value={t.startDate ?? ''} onChange={(e) => patch({ startDate: e.target.value || null })} className="h-9 w-40" aria-label="Start date" />
            <span className="text-muted">→</span>
            <Input type="date" disabled={ro} value={t.dueDate ?? ''} onChange={(e) => patch({ dueDate: e.target.value || null })} className={cn('h-9 w-40', isOverdue(t.dueDate, t.status) && 'text-rose-ink')} aria-label="Due date" />
          </dd>
          <dt className="text-muted">Progress</dt>
          <dd className="flex items-center gap-3">
            <input type="range" min={0} max={100} step={5} disabled={ro} defaultValue={t.progress} key={t.version} onMouseUp={(e) => patch({ progress: +(e.target as HTMLInputElement).value })} onKeyUp={(e) => patch({ progress: +(e.target as HTMLInputElement).value })} className="w-48 accent-[var(--brand)]" aria-label="Progress" />
            <span className="text-[12.5px] font-semibold text-ink-2">{t.progress}%</span>
          </dd>
          <dt className="text-muted">Collaborators</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {t.collaboratorIds.map((cid) => {
              const m = members.data?.find((x) => x.id === cid);
              return m ? (
                <button key={cid} disabled={ro} onClick={() => patch({ collaboratorIds: t.collaboratorIds.filter((x) => x !== cid) })} className="flex cursor-pointer items-center gap-1.5 rounded-full bg-bg py-0.5 pl-0.5 pr-2 text-[12px] hover:bg-rose" title="Remove">
                  <AvatarPortrait name={m.name} size={20} /> {m.name.split(' ')[0]}
                </button>
              ) : null;
            })}
            {!ro && (
              <Select
                value=""
                onValueChange={(v) => patch({ collaboratorIds: [...t.collaboratorIds, v] })}
                placeholder="Add…"
                className="h-7 w-28 text-[12px]"
                aria-label="Add collaborator"
                options={deptMembers.filter((m) => !t.collaboratorIds.includes(m.id) && m.id !== t.assigneeMemberId).map((m) => ({ value: m.id, label: m.name }))}
              />
            )}
          </dd>
        </dl>

        <div className="mt-5">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">Description</p>
          <Textarea value={desc} readOnly={ro} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (t.description ?? '') && patch({ description: desc })} placeholder="Add details, acceptance criteria, links…" className="min-h-[96px]" />
        </div>

        {/* subtasks */}
        {!t.parentId && (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Subtasks {t.subtasks.length ? `· ${t.subtasks.filter((s) => s.status === 'done').length}/${t.subtasks.length}` : ''}
              </p>
            </div>
            <div className="space-y-1">
              {t.subtasks.map((s) => (
                <div key={s.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-bg">
                  <button
                    disabled={ro}
                    aria-label={s.status === 'done' ? 'Mark not done' : 'Mark done'}
                    onClick={async () => {
                      try {
                        await api.patch(`/orgs/${orgId}/tasks/${s.id}`, { version: s.version, status: s.status === 'done' ? 'todo' : 'done' });
                        invalidate();
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <TaskStatusIcon status={s.status} />
                  </button>
                  <Link href={`?task=${s.id}`} className={cn('flex-1 truncate text-[13px]', s.status === 'done' && 'text-muted line-through')}>
                    {s.title}
                  </Link>
                  <AssigneeChip memberId={s.assigneeMemberId} agentId={s.assigneeAgentId} members={members.data} agents={agents.data} size={20} />
                </div>
              ))}
            </div>
            {!ro && (
              <form
                className="mt-1 flex items-center gap-2 px-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!subtask.trim()) return;
                  try {
                    await api.post(`/orgs/${orgId}/tasks`, { projectId: t.projectId, parentId: t.id, title: subtask.trim(), requestId: t.requestId ?? undefined });
                    setSubtask('');
                    invalidate();
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                <CornerDownRight className="h-4 w-4 text-muted-2" />
                <input value={subtask} onChange={(e) => setSubtask(e.target.value)} placeholder="Add a subtask and press Enter" className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-2" aria-label="New subtask" />
              </form>
            )}
          </section>
        )}

        {/* dependencies */}
        <section className="mt-5">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Dependencies</p>
          {t.dependencies.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-bg">
              <TaskStatusIcon status={d.status} />
              <span className="text-muted">Blocked by</span>
              <Link href={`?task=${d.id}`} className="flex-1 truncate font-medium">
                {d.title}
              </Link>
              {!ro && (
                <button className="cursor-pointer text-muted hover:text-rose-ink" aria-label="Remove dependency" onClick={async () => { await api.del(`/orgs/${orgId}/tasks/${id}/dependencies/${d.id}`); invalidate(); }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {t.blocking.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
              <TaskStatusIcon status={d.status} />
              <span className="text-muted">Blocks</span>
              <Link href={`?task=${d.id}`} className="truncate font-medium">{d.title}</Link>
            </div>
          ))}
          {!ro && (
            <Select
              value=""
              placeholder="Add a blocking task…"
              className="mt-1 h-8 w-72 text-[12.5px]"
              aria-label="Add dependency"
              onValueChange={async (v) => {
                try {
                  await api.post(`/orgs/${orgId}/tasks/${id}/dependencies`, { dependsOnId: v });
                  invalidate();
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
              options={(projectTasks.data ?? []).filter((x) => x.id !== t.id && !t.dependencies.some((d) => d.id === x.id)).map((x) => ({ value: x.id, label: x.title }))}
            />
          )}
        </section>

        {/* files */}
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Attachments</p>
            {!ro && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const fd = new FormData();
                    fd.append('file', f);
                    fd.append('taskId', id);
                    try {
                      await api.upload(`/orgs/${orgId}/files`, fd);
                      invalidate();
                      toast.success('File attached');
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                    e.target.value = '';
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                  <Upload /> Attach
                </Button>
              </>
            )}
          </div>
          {!t.files.length && <p className="px-2 text-[12.5px] text-muted-2">No files yet.</p>}
          {t.files.map((f) => (
            <a key={f.id} href={`/api/orgs/${orgId}/files/${f.id}/download`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-bg">
              <Paperclip className="h-3.5 w-3.5 text-muted" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-[11.5px] text-muted">{bytes(f.size)}</span>
            </a>
          ))}
        </section>

        {/* comments & activity */}
        <section className="mt-6">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted">Comments</p>
          <div className="space-y-3">
            {t.comments.map((c) => {
              const m = members.data?.find((x) => x.id === c.authorMemberId);
              const a = agents.data?.find((x) => x.id === c.authorAgentId);
              return (
                <div key={c.id} className="flex gap-2.5">
                  {a ? <RobotPortrait config={a.robot} size={28} /> : <AvatarPortrait name={m?.name} size={28} />}
                  <div className="min-w-0 flex-1 rounded-xl bg-bg-soft px-3 py-2">
                    <p className="text-[12px] font-semibold text-ink">
                      {c.authorName} {a && <Badge tone="lavender" className="ml-1">AI agent</Badge>} <span className="ml-1 font-normal text-muted">{ago(c.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-2">{c.body}</p>
                    {c.agentRunId && (
                      <Link href={`/o/${orgId}/agents?run=${c.agentRunId}`} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-lavender-ink">
                        <Bot className="h-3 w-3" /> View agent run
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {org.data?.me.role !== 'viewer' && (
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                addComment.mutate(comment.trim(), { onSuccess: () => setComment(''), onError: (er) => toast.error(errorMessage(er)) });
              }}
            >
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" className="min-h-[44px]" rows={1} aria-label="Comment" />
              <Button type="submit" variant="primary" size="icon" loading={addComment.isPending} aria-label="Send comment">
                <Send />
              </Button>
            </form>
          )}
          <div className="mt-6 space-y-1.5 border-t border-line pt-4">
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">Activity</p>
            {t.activity.map((a) => {
              const who = a.actorMemberId ? members.data?.find((m) => m.id === a.actorMemberId)?.name : agents.data?.find((x) => x.id === a.actorAgentId)?.name;
              return (
                <p key={a.id} className="text-[12px] text-muted">
                  <span className="font-semibold text-ink-2">{who ?? 'Someone'}</span> {VERB[a.verb] ?? a.verb.replace(/_/g, ' ')}
                  {a.verb === 'status_changed' && a.data?.to ? ` to ${TASK_STATUS_LABEL[a.data.to as keyof typeof TASK_STATUS_LABEL] ?? a.data.to}` : ''} · {ago(a.createdAt)}
                </p>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export type { TaskDetail };
export { ProgressBar, Plus };
