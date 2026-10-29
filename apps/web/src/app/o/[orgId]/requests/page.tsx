'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Plus, ArrowRight, CalendarDays, Inbox } from 'lucide-react';
import { PRIORITIES, type RequestState } from '@space/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg, useRequests } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, Dialog, DialogContent, Empty, Field, Input, PageHeader, ProgressBar, Segmented, Select, Skeleton, Textarea, Badge } from '@/components/ui/primitives';
import { DeptIcon, PriorityBadge, RequestStateBadge } from '@/components/domain';
import { ago, cn, dueLabel } from '@/lib/utils';
import type { WorkRequest } from '@/lib/types';

const FLOW: Array<{ label: string; states: RequestState[] }> = [
  { label: 'Requested', states: ['submitted', 'clarification_requested'] },
  { label: 'Accepted', states: ['accepted'] },
  { label: 'In progress', states: ['in_progress', 'changes_requested'] },
  { label: 'Delivered', states: ['delivered'] },
  { label: 'Completed', states: ['completed'] },
];

function Flow({ state }: { state: RequestState }) {
  if (state === 'rejected' || state === 'cancelled') return <p className="text-[11.5px] font-semibold text-muted">{state === 'rejected' ? 'Rejected' : 'Cancelled'}</p>;
  const idx = FLOW.findIndex((f) => f.states.includes(state));
  return (
    <div className="flex items-center gap-1" aria-label={`Progress: ${FLOW[idx]?.label}`}>
      {FLOW.map((f, i) => (
        <div key={f.label} className="flex items-center gap-1">
          <span className={cn('h-2 w-2 rounded-full', i < idx ? 'bg-sage-ink' : i === idx ? 'bg-brand ring-4 ring-brand/15' : 'bg-line-strong')} title={f.label} />
          {i < FLOW.length - 1 && <span className={cn('h-px w-4', i < idx ? 'bg-sage-ink' : 'bg-line-strong')} />}
        </div>
      ))}
      <span className="ml-2 text-[11.5px] font-semibold text-ink-2">{FLOW[idx]?.label}</span>
    </div>
  );
}

function RequestCard({ r }: { r: WorkRequest }) {
  const path = usePathname();
  const needsMe = r.actions.some((a) => ['accept', 'approve', 'provide_clarification', 'start', 'deliver'].includes(a));
  return (
    <Link href={`${path}?request=${r.id}`} scroll={false} className="block rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-sm)] transition hover:border-line-strong hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-2">
        <DeptIcon theme={r.from.theme} color={r.from.color} size={28} />
        <span className="text-[13px] font-bold">{r.from.name}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted" />
        <DeptIcon theme={r.to.theme} color={r.to.color} size={28} />
        <span className="text-[13px] font-bold">{r.to.name}</span>
        <span className="ml-auto text-[11.5px] text-muted">#{r.number} · {ago(r.updatedAt)}</span>
      </div>
      <p className="mt-3 text-[14.5px] font-bold leading-snug">{r.title}</p>
      <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{r.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RequestStateBadge state={r.state} />
        <PriorityBadge priority={r.priority} />
        {r.labels.slice(0, 3).map((l) => (
          <Badge key={l} tone="powder">
            {l}
          </Badge>
        ))}
        {needsMe && <Badge tone="peach">Needs your action</Badge>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Flow state={r.state} />
        <div className="flex items-center gap-3 text-[11.5px] text-muted">
          {r.progress.total > 0 && (
            <span className="flex items-center gap-2">
              <ProgressBar value={(r.progress.done / r.progress.total) * 100} className="w-16" /> {r.progress.done}/{r.progress.total} tasks
            </span>
          )}
          {r.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> {dueLabel(r.dueDate)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function RequestsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const org = useOrg();
  const [box, setBox] = useState<'incoming' | 'outgoing' | 'all'>('incoming');
  const [state, setState] = useState<'open' | 'closed' | 'any'>('open');
  const [open, setOpen] = useState(sp.get('new') === '1');
  const reqs = useRequests(box, state === 'any' ? undefined : state);
  const canCreate = (org.data?.departments ?? []).some((d) => d.canAdmin);
  useEffect(() => {
    if (sp.get('new') === '1') setOpen(true);
  }, [sp]);

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        icon={<Send className="text-peach-ink" />}
        title="Cross-department requests"
        subtitle="Ask another team for work, track it, and approve the delivery"
        actions={
          canCreate && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> New request
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented value={box} onChange={setBox} options={[{ value: 'incoming', label: 'Incoming' }, { value: 'outgoing', label: 'Sent' }, { value: 'all', label: 'All' }]} />
        <Segmented value={state} onChange={setState} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'any', label: 'Any' }]} />
      </div>
      {reqs.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : !reqs.data?.length ? (
        <Card>
          <Empty icon={<Inbox />} title={box === 'incoming' ? 'No incoming requests' : 'No requests'} body="Requests between your departments appear here." />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {reqs.data.map((r) => (
            <RequestCard key={r.id} r={r} />
          ))}
        </div>
      )}
      <NewRequestDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && sp.get('new')) router.replace(`/o/${org.data?.organization.id}/requests`);
        }}
        defaultFrom={sp.get('from') ?? undefined}
      />
    </div>
  );
}

function NewRequestDialog({ open, onOpenChange, defaultFrom }: { open: boolean; onOpenChange: (v: boolean) => void; defaultFrom?: string }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const router = useRouter();
  const from = (org.data?.departments ?? []).filter((d) => d.canAdmin);
  const [f, setF] = useState({ fromDepartmentId: defaultFrom ?? '', toDepartmentId: '', title: '', description: '', priority: 'medium', dueDate: '', labels: '' });
  const [busy, setBusy] = useState(false);
  const fromId = f.fromDepartmentId || from[0]?.id;
  const to = (org.data?.departments ?? []).filter((d) => d.id !== fromId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New cross-department request" description="The receiving department’s admins will review it." wide>
        <form
          className="grid grid-cols-2 gap-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api.post<{ id: string }>(`/orgs/${orgId}/requests`, {
                fromDepartmentId: fromId,
                toDepartmentId: f.toDepartmentId,
                title: f.title,
                description: f.description,
                priority: f.priority,
                dueDate: f.dueDate || null,
                labels: f.labels.split(',').map((x) => x.trim()).filter(Boolean),
              });
              qc.invalidateQueries({ queryKey: ['requests', orgId] });
              toast.success('Request sent');
              onOpenChange(false);
              router.push(`/o/${orgId}/requests?request=${r.id}`);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="From (your department)">
            <Select value={fromId} onValueChange={(v) => setF({ ...f, fromDepartmentId: v })} options={from.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Field label="To">
            <Select value={f.toDepartmentId} onValueChange={(v) => setF({ ...f, toDepartmentId: v })} placeholder="Choose a department" options={to.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <div className="col-span-2">
            <Field label="Title">
              <Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Landing page for the winter campaign" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="What do you need?">
              <Textarea required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Goal, scope, links, acceptance criteria…" className="min-h-[120px]" />
            </Field>
          </div>
          <Field label="Priority">
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="Labels" hint="Comma separated">
              <Input value={f.labels} onChange={(e) => setF({ ...f, labels: e.target.value })} placeholder="Frontend, Campaign" />
            </Field>
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!f.title.trim() || !f.description.trim() || !f.toDepartmentId || !fromId}>
              <Send /> Send request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
