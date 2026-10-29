'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { ListChecks, Send, ChevronRight, X, Users, FileText, Bot, FolderKanban, Sun, Wifi, CheckSquare } from 'lucide-react';
import { presenceGroup, TASK_STATUS_LABEL } from '@space/shared';
import { useOrg, useReports, useRequests, useMembers, useActivity, useCalendar, type ActivityItem } from '@/lib/queries';
import { AvatarPortrait } from '@/components/avatar';
import { useOrgId } from '@/lib/org-context';
import { useUi } from '@/lib/ui-store';
import { DeptIcon } from '@/components/domain';
import { useDepartment } from '@/lib/queries';
import { ago, cn, fmtTime } from '@/lib/utils';

const OfficeView = dynamic(() => import('@/office/OfficeView').then((m) => m.OfficeView), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-[22px] bg-surface" />,
});

const VERB: Record<string, string> = {
  created: 'created',
  status_changed: 'updated',
  assigned: 'assigned',
  updated: 'updated',
  commented: 'commented on',
  dependency_added: 'linked',
  accept: 'accepted',
  approve: 'approved',
  deliver: 'delivered',
  start: 'started',
  reject: 'rejected',
  cancel: 'cancelled',
  request_changes: 'requested changes on',
  request_clarification: 'asked about',
  provide_clarification: 'clarified',
};
const ENTITY_ICON = { task: CheckSquare, project: FolderKanban, request: Send, agent_run: Bot, file: FileText } as const;
const ENTITY_TONE = { task: 'bg-sage text-sage-ink', project: 'bg-powder text-powder-ink', request: 'bg-peach text-peach-ink', agent_run: 'bg-lavender text-lavender-ink', file: 'bg-butter text-butter-ink' } as const;

function describe(a: ActivityItem) {
  const who = a.actor ?? 'Someone';
  if (a.verb === 'status_changed' && typeof a.data?.to === 'string') {
    const to = TASK_STATUS_LABEL[a.data.to as keyof typeof TASK_STATUS_LABEL] ?? String(a.data.to);
    return `${who} moved “${a.title ?? 'a task'}” to ${to}`;
  }
  if (a.verb.startsWith('agent_run_')) return `${who} ${a.verb.replace('agent_run_', '')} a run on “${a.title ?? 'a task'}”`;
  return `${who} ${VERB[a.verb] ?? a.verb.replace(/_/g, ' ')} ${a.entityType === 'request' ? 'request' : a.entityType === 'project' ? 'project' : ''} “${a.title ?? 'an item'}”`.replace(/\s+/g, ' ');
}

export default function HomePage() {
  const selectedDept = useUi((s) => s.selectedDept);
  return (
    <div className="flex h-full min-h-[640px] flex-col gap-3">
      <div className="relative min-h-[380px] flex-1">
        <OfficeView className="absolute inset-0" />
        {selectedDept && <DeptCard id={selectedDept} />}
      </div>
      <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-[0.9fr_1.15fr_1.15fr]">
        <TodayCard />
        <ActivityCard />
        <UpcomingCard />
      </div>
    </div>
  );
}

function Panel({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex h-[200px] min-w-0 flex-col rounded-[20px] border border-line bg-surface px-5 py-4 shadow-[var(--shadow-sm)]">
      <div className="mb-2.5 flex items-center gap-2">
        {icon}
        <h2 className="flex-1 text-[14px] font-bold text-ink">{title}</h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function TodayCard() {
  const orgId = useOrgId();
  const org = useOrg();
  const members = useMembers();
  const reports = useReports(14);
  const reqs = useRequests('all', 'open');
  const ms = members.data ?? [];
  const inOffice = ms.filter((m) => presenceGroup(m.presence) === 'in_office').length;
  const remote = ms.filter((m) => m.presence === 'remote').length;
  const by = (k: string) => (reports.data?.departments ?? []).reduce((a: number, d: any) => a + (d.byStatus?.[k] ?? 0), 0);
  const active = by('todo') + by('in_progress') + by('in_review') + by('blocked');
  const rows = [
    { icon: Users, tone: 'bg-sage text-sage-ink', n: members.isLoading ? '—' : inOffice, label: 'People in office', href: `/o/${orgId}/team` },
    { icon: Wifi, tone: 'bg-lavender text-lavender-ink', n: members.isLoading ? '—' : remote, label: 'Working remotely', href: `/o/${orgId}/team` },
    { icon: ListChecks, tone: 'bg-butter text-butter-ink', n: reports.isLoading ? '—' : active, label: 'Active tasks', href: `/o/${orgId}/tasks?scope=all` },
    { icon: Send, tone: 'bg-peach text-peach-ink', n: reqs.isLoading ? '—' : reqs.data?.length ?? 0, label: 'Open requests', href: `/o/${orgId}/requests` },
  ];
  return (
    <Panel title={`Today at ${org.data?.organization.displayName ?? 'Space'}`} icon={<Sun className="h-4 w-4 text-[#f2b23e]" />}>
      <div className="space-y-1">
        {rows.map((r) => (
          <Link key={r.label} href={r.href} className="flex items-center gap-3 rounded-lg px-1 py-1 text-[13px] text-ink-2 hover:bg-bg">
            <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', r.tone)}>
              <r.icon className="h-3.5 w-3.5" />
            </span>
            <span className="w-6 font-bold text-ink">{r.n}</span>
            <span>{r.label}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function ActivityCard() {
  const orgId = useOrgId();
  const act = useActivity(8);
  return (
    <Panel title="Recent Activity" action={<Link href={`/o/${orgId}/reports`} className="text-[12px] font-semibold text-brand hover:underline">View all</Link>}>
      {act.isLoading ? (
        <p className="text-[12.5px] text-muted">Loading…</p>
      ) : !act.data?.length ? (
        <p className="text-[12.5px] text-muted">No activity yet. Updates to tasks, projects and requests appear here.</p>
      ) : (
        <ul className="space-y-2.5">
          {act.data.map((a) => {
            const Icon = ENTITY_ICON[a.entityType] ?? CheckSquare;
            const href = a.entityType === 'task' ? `?task=${a.entityId}` : a.entityType === 'request' ? `?request=${a.entityId}` : a.entityType === 'project' ? `/o/${orgId}/projects/${a.entityId}` : '#';
            return (
              <li key={a.id}>
                <Link href={href} scroll={false} className="flex gap-3 rounded-lg hover:bg-bg-soft">
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ENTITY_TONE[a.entityType] ?? 'bg-bg')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="line-clamp-1 text-[13px] font-semibold text-ink">{describe(a)}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted">
                      {a.departmentName ?? 'Company'} · {ago(a.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function UpcomingCard() {
  const orgId = useOrgId();
  const org = useOrg();
  const members = useMembers();
  const [range] = useState(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  });
  const cal = useCalendar(range.from, range.to);
  const events = (cal.data?.events ?? []).filter((e) => new Date(e.endsAt).getTime() > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6);
  const name = (id: string) => members.data?.find((m) => m.id === id)?.name ?? '?';
  return (
    <Panel title="Upcoming" action={<Link href={`/o/${orgId}/calendar`} className="text-[12px] font-semibold text-brand hover:underline">View all</Link>}>
      {cal.isLoading ? (
        <p className="text-[12.5px] text-muted">Loading…</p>
      ) : !events.length ? (
        <p className="text-[12.5px] text-muted">Nothing scheduled in the next 7 days.</p>
      ) : (
        <ul className="space-y-2.5">
          {events.map((e) => {
            const d = org.data?.departments.find((x) => x.id === e.departmentId);
            const start = new Date(e.startsAt);
            const today = start.toDateString() === new Date().toDateString();
            return (
              <li key={e.id} className="flex items-center gap-3">
                <span className="w-[62px] shrink-0 text-[12px] font-medium leading-tight text-ink-2">
                  {fmtTime(e.startsAt)}
                  {!today && <span className="block text-[10.5px] text-muted">{start.toLocaleDateString(undefined, { weekday: 'short' })}</span>}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-semibold text-ink">{e.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d?.color ?? '#b9b5c2' }} />
                    {e.location ?? (d ? `${d.name} Department` : 'Company-wide')}
                  </span>
                </span>
                <span className="flex shrink-0 -space-x-1">
                  {e.attendeeIds.slice(0, 2).map((id) => (
                    <AvatarPortrait key={id} name={name(id)} size={26} ring />
                  ))}
                  {e.attendeeIds.length > 2 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-bg px-1 text-[10px] font-bold text-ink-2 ring-2 ring-white">+{e.attendeeIds.length - 2}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function DeptCard({ id }: { id: string }) {
  const orgId = useOrgId();
  const org = useOrg();
  const d = useDepartment(id);
  const selectDept = useUi((s) => s.selectDept);
  const meta = org.data?.departments.find((x) => x.id === id);
  if (!meta) return null;
  const inProgress = d.data?.stats?.in_progress;
  const base = `/o/${orgId}/departments/${id}`;
  const links = [
    { href: `${base}?tab=tasks`, label: 'Tasks', icon: ListChecks },
    { href: `${base}?tab=projects`, label: 'Projects', icon: FolderKanban },
    { href: `${base}?tab=team`, label: 'Team', icon: Users },
    { href: `${base}?tab=requests`, label: 'Requests', icon: Send },
    { href: `${base}?tab=agents`, label: 'AI Agents', icon: Bot },
    { href: `${base}?tab=files`, label: 'Files', icon: FileText },
  ];
  return (
    <div className="animate-pop absolute left-4 top-4 z-20 w-[260px] rounded-2xl border border-line bg-white/97 p-3.5 shadow-[var(--shadow-lg)]">
      <button onClick={() => selectDept(null)} className="absolute right-2.5 top-2.5 cursor-pointer rounded-lg p-1 text-muted hover:bg-bg" aria-label="Close department">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3">
        <DeptIcon theme={meta.theme} color={meta.color} size={40} />
        <div>
          <p className="text-[15px] font-bold">{meta.name}</p>
          <p className="text-[12px] text-muted">
            {meta.memberCount} members{inProgress !== undefined ? ` · ${inProgress} tasks in progress` : ''}
          </p>
        </div>
      </div>
      {meta.description && <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-2">{meta.description}</p>}
      <div className="mt-3 grid grid-cols-2 gap-1">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-ink-2 hover:bg-bg hover:text-ink">
            <l.icon className="h-3.5 w-3.5 text-muted" /> {l.label}
          </Link>
        ))}
      </div>
      <Link href={base} className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-brand-soft py-2 text-[12.5px] font-bold text-brand-ink hover:brightness-[0.98]">
        Open department <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
