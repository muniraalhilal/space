'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { X, ArrowRight, Send, Upload, Paperclip, Check, XCircle, HelpCircle, Play, PackageCheck, ThumbsUp, RotateCcw, Ban, MessageSquare, Plus, CalendarDays } from 'lucide-react';
import { REQUEST_STATE_LABEL, REQUEST_TRANSITIONS, type RequestAction } from '@space/shared';
import { useAgents, useMembers, useProjects, useRequest, qk } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Button, Dialog, DialogContent, Textarea, Skeleton, Badge, ProgressBar, Input, Select } from '@/components/ui/primitives';
import { DeptIcon, PriorityBadge, RequestStateBadge, TaskStatusIcon, AssigneeChip } from '@/components/domain';
import { AvatarPortrait, RobotPortrait } from '@/components/avatar';
import { ago, bytes, dueLabel, fmtDateTime } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export const ACTION_UI: Record<RequestAction, { label: string; icon: React.ComponentType<{ className?: string }>; variant: 'primary' | 'secondary' | 'danger' | 'soft'; prompt?: string }> = {
  accept: { label: 'Accept request', icon: Check, variant: 'primary' },
  reject: { label: 'Reject', icon: XCircle, variant: 'danger', prompt: 'Why is this request being rejected?' },
  request_clarification: { label: 'Ask for clarification', icon: HelpCircle, variant: 'secondary', prompt: 'What needs clarifying?' },
  provide_clarification: { label: 'Provide clarification', icon: MessageSquare, variant: 'primary', prompt: 'Your clarification' },
  start: { label: 'Start work', icon: Play, variant: 'primary' },
  deliver: { label: 'Deliver', icon: PackageCheck, variant: 'primary', prompt: 'Delivery note for the requesting team' },
  approve: { label: 'Approve delivery', icon: ThumbsUp, variant: 'primary' },
  request_changes: { label: 'Request changes', icon: RotateCcw, variant: 'secondary', prompt: 'What should change?' },
  cancel: { label: 'Cancel request', icon: Ban, variant: 'danger' },
};

export function RequestDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const r = useRequest(id);
  const members = useMembers();
  const agents = useAgents();
  const [pending, setPending] = useState<RequestAction | null>(null);
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const d = r.data;
  const projects = useProjects(d?.toDepartmentId);
  const [plan, setPlan] = useState({ title: '', projectId: '', assignee: 'none', due: '' });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.request(orgId, id) });
    qc.invalidateQueries({ queryKey: ['requests', orgId] });
    qc.invalidateQueries({ queryKey: ['tasks', orgId] });
  };

  async function transition(action: RequestAction, n?: string) {
    if (!d) return;
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/requests/${id}/transitions`, { action, note: n, version: d.version });
      toast.success(REQUEST_STATE_LABEL[REQUEST_TRANSITIONS[action].to]);
      setPending(null);
      setNote('');
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (r.isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-32 w-full" /></div>;
  if (!d) return <div className="p-6 text-[13px] text-muted">This request doesn’t exist or isn’t shared with your departments.</div>;
  const creator = members.data?.find((m) => m.id === d.createdByMemberId);
  const pct = d.progress.total ? Math.round((d.progress.done / d.progress.total) * 100) : 0;
  const canPlanNow = d.canPlan && ['accepted', 'in_progress', 'changes_requested'].includes(d.state);
  const deptMembers = (members.data ?? []).filter((m) => m.departments.some((x) => x.departmentId === d.toDepartmentId));
  const deptAgents = (agents.data ?? []).filter((a) => a.enabled && (a.departmentId === d.toDepartmentId || !a.departmentId));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <DeptIcon theme={d.from.theme} color={d.from.color} size={26} />
        <span className="text-[13px] font-bold">{d.from.name}</span>
        <ArrowRight className="h-4 w-4 text-muted" />
        <DeptIcon theme={d.to.theme} color={d.to.color} size={26} />
        <span className="text-[13px] font-bold">{d.to.name}</span>
        <span className="ml-2 text-[12px] text-muted">#{d.number}</span>
        <button onClick={onClose} className="ml-auto cursor-pointer rounded-lg p-1.5 text-muted hover:bg-bg" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <RequestStateBadge state={d.state} />
          <PriorityBadge priority={d.priority} />
          {d.labels.map((l) => (
            <Badge key={l} tone="powder">
              {l}
            </Badge>
          ))}
        </div>
        <h2 className="mt-3 text-[19px] font-bold leading-snug">{d.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{d.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-bg-soft p-3">
            <AvatarPortrait name={creator?.name} size={30} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[12.5px] font-semibold">{d.creatorName}</p>
              <p className="text-[11.5px] text-muted">Requested {ago(d.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-bg-soft p-3">
            <CalendarDays className="h-5 w-5 text-muted" />
            <div className="leading-tight">
              <p className="text-[12.5px] font-semibold">{d.dueDate ? dueLabel(d.dueDate) : 'No due date'}</p>
              <p className="text-[11.5px] text-muted">Due date</p>
            </div>
          </div>
        </div>

        {/* actions */}
        {d.actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-dashed border-line-strong p-3">
            <p className="w-full text-[12px] font-semibold text-muted">
              You can act as the {d.sides.map((s) => (s === 'receiver' ? 'receiving' : 'requesting')).join(' and ')} department admin
            </p>
            {d.actions.map((a) => {
              const ui = ACTION_UI[a];
              return (
                <Button key={a} size="sm" variant={ui.variant} loading={busy && pending === a} onClick={() => (REQUEST_TRANSITIONS[a].requiresNote || ui.prompt ? setPending(a) : transition(a))}>
                  <ui.icon /> {ui.label}
                </Button>
              );
            })}
          </div>
        )}

        {/* progress of internal work */}
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Work plan · {d.to.name}</p>
            <span className="text-[12px] font-semibold text-ink-2">{d.progress.done}/{d.progress.total} tasks done</span>
          </div>
          <ProgressBar value={pct} />
          <p className="mt-1.5 text-[11.5px] text-muted">Finishing these tasks does not complete the request — {d.from.name} approves the delivery.</p>
          <div className="mt-2 space-y-0.5">
            {d.tasks.map((t) => (
              <Link key={t.id} href={`?task=${t.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-bg">
                <TaskStatusIcon status={t.status} />
                <span className="flex-1 truncate text-[13px]">{t.title}</span>
                <AssigneeChip memberId={t.assigneeMemberId} agentId={t.assigneeAgentId} members={members.data} agents={agents.data} size={22} />
              </Link>
            ))}
          </div>
          {canPlanNow && (
            <form
              className="mt-3 grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-bg-soft p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const projectId = plan.projectId || projects.data?.[0]?.id;
                if (!plan.title.trim() || !projectId) return toast.error(projectId ? 'Add a task title' : 'Create a project in this department first');
                try {
                  await api.post(`/orgs/${orgId}/tasks`, {
                    projectId,
                    title: plan.title.trim(),
                    requestId: id,
                    dueDate: plan.due || null,
                    assignee: plan.assignee === 'none' ? null : { kind: plan.assignee.split(':')[0], id: plan.assignee.split(':')[1] },
                  });
                  setPlan({ ...plan, title: '', due: '' });
                  refresh();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Input value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} placeholder="Divide into a task…" className="col-span-2 h-9" aria-label="Task title" />
              <div className="col-span-2 grid grid-cols-3 gap-2">
                <Select value={plan.projectId || projects.data?.[0]?.id} onValueChange={(v) => setPlan({ ...plan, projectId: v })} options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} placeholder="Project" className="h-9 text-[12.5px]" aria-label="Project" />
                <Select
                  value={plan.assignee}
                  onValueChange={(v) => setPlan({ ...plan, assignee: v })}
                  className="h-9 text-[12.5px]"
                  aria-label="Assignee"
                  options={[{ value: 'none', label: 'Unassigned' }, ...deptMembers.map((m) => ({ value: `member:${m.id}`, label: m.name })), ...deptAgents.map((a) => ({ value: `agent:${a.id}`, label: `${a.name} (AI)` }))]}
                />
                <Input type="date" value={plan.due} onChange={(e) => setPlan({ ...plan, due: e.target.value })} className="h-9 text-[12.5px]" aria-label="Due date" />
              </div>
              <Button type="submit" size="sm" variant="soft" className="col-span-2 justify-self-end">
                <Plus /> Add task
              </Button>
            </form>
          )}
        </section>

        {/* attachments */}
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Attachments</p>
            {d.canComment && (
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
                    fd.append('requestId', id);
                    try {
                      await api.upload(`/orgs/${orgId}/files`, fd);
                      refresh();
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
          {!d.files.length && <p className="px-2 text-[12.5px] text-muted-2">No files.</p>}
          {d.files.map((f) => (
            <a key={f.id} href={`/api/orgs/${orgId}/files/${f.id}/download`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-bg">
              <Paperclip className="h-3.5 w-3.5 text-muted" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-[11.5px] text-muted">{bytes(f.size)}</span>
            </a>
          ))}
        </section>

        {/* history */}
        <section className="mt-5">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">History</p>
          <ol className="relative ml-2 border-l border-line pl-4">
            {d.events.map((e) => (
              <li key={e.id} className="mb-3">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" />
                <p className="text-[12.5px]">
                  <span className="font-semibold">{e.actorName ?? 'Someone'}</span> <span className="text-muted">{e.action === 'create' ? 'created the request' : `→ ${REQUEST_STATE_LABEL[e.toState]}`}</span>
                </p>
                {e.note && <p className="mt-1 rounded-lg bg-bg-soft px-2.5 py-1.5 text-[12.5px] text-ink-2">{e.note}</p>}
                <p className="text-[11px] text-muted-2">{fmtDateTime(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* comments */}
        <section className="mt-3">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Comments</p>
          <div className="space-y-3">
            {d.comments.map((c) => {
              const m = members.data?.find((x) => x.id === c.authorMemberId);
              return (
                <div key={c.id} className="flex gap-2.5">
                  <AvatarPortrait name={m?.name} size={28} />
                  <div className="flex-1 rounded-xl bg-bg-soft px-3 py-2">
                    <p className="text-[12px] font-semibold">
                      {c.authorName} <span className="font-normal text-muted">{ago(c.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-2">{c.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {d.canComment && (
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                try {
                  await api.post(`/orgs/${orgId}/requests/${id}/comments`, { body: comment.trim() });
                  setComment('');
                  refresh();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" className="min-h-[44px]" rows={1} aria-label="Comment" />
              <Button type="submit" variant="primary" size="icon" aria-label="Send comment">
                <Send />
              </Button>
            </form>
          )}
        </section>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        {pending && (
          <DialogContent title={ACTION_UI[pending].label} description={REQUEST_TRANSITIONS[pending].requiresNote ? 'A short note is required and will be visible to both departments.' : 'Optional note for both departments.'}>
            <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={ACTION_UI[pending].prompt} />
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setPending(null)}>Cancel</Button>
              <Button variant={ACTION_UI[pending].variant === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={() => transition(pending, note.trim() || undefined)}>
                Confirm
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export { RobotPortrait };
