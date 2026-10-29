'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, MessageCircle, CalendarDays, ArrowRight, Bot, Play, ListChecks } from 'lucide-react';
import { AGENT_ROLE_LABEL, PRESENCE_LABEL } from '@space/shared';
import { useAgents, useMembers, useNextEvent, useOrg, useTasks } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api } from '@/lib/api';
import { Badge, Button, ProgressBar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { AvatarPortrait, PresenceBadge, RobotPortrait } from '@/components/avatar';
import { TaskStatusIcon } from '@/components/domain';
import { cn, fmtTime, dueLabel } from '@/lib/utils';
import { format, isToday, parseISO } from 'date-fns';


const AGENT_STATUS: Record<string, { label: string; tone: 'sage' | 'powder' | 'butter' | 'neutral' | 'lavender' }> = {
  idle: { label: 'Idle', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'lavender' },
  running: { label: 'Working on a run', tone: 'powder' },
  awaiting_approval: { label: 'Waiting for approval', tone: 'butter' },
  disabled: { label: 'Disabled', tone: 'neutral' },
};

export function EntityPopup({ entity, onClose, compact }: { entity: { kind: 'member' | 'agent'; id: string; screen?: { x: number; y: number } }; onClose: () => void; compact?: boolean }) {
  const pos = entity.screen;
  const style: React.CSSProperties = pos ? { left: `clamp(12px, ${pos.x + 18}px, calc(100% - 352px))`, top: `clamp(12px, ${pos.y - 140}px, calc(100% - 430px))` } : { right: 16, top: 16 };
  return (
    <div className={cn('animate-pop absolute z-30 w-[340px] rounded-2xl border border-line bg-white shadow-[var(--shadow-lg)]', compact && 'w-[320px]')} style={style} role="dialog" aria-label="Details">
      <button onClick={onClose} className="absolute right-3 top-3 z-10 cursor-pointer rounded-lg p-1 text-muted hover:bg-bg hover:text-ink" aria-label="Close">
        <X className="h-4 w-4" />
      </button>
      {entity.kind === 'member' ? <MemberCard id={entity.id} /> : <AgentCard id={entity.id} />}
    </div>
  );
}

function MemberCard({ id }: { id: string }) {
  const orgId = useOrgId();
  const router = useRouter();
  const members = useMembers();
  const org = useOrg();
  const m = members.data?.find((x) => x.id === id);
  const tasks = useTasks({ assignee: id, parentId: 'root' });
  const next = useNextEvent(id);
  if (!m) return <div className="p-6 text-[13px] text-muted">Loading…</div>;
  const open = (tasks.data ?? []).filter((t) => t.status !== 'done');
  const current = open.find((t) => t.status === 'in_progress') ?? open[0];
  const depts = m.departments.map((d) => org.data?.departments.find((x) => x.id === d.departmentId)?.name).filter(Boolean);
  const canSeeTasks = tasks.isSuccess;

  async function message() {
    const c = await api.post<{ id: string }>(`/orgs/${orgId}/conversations`, { memberId: id });
    router.push(`/o/${orgId}/messages?c=${c.id}`);
  }

  return (
    <div>
      <div className="flex gap-3 p-4 pb-3">
        <AvatarPortrait name={m.name} size={56} />
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate text-[15px] font-bold text-ink">{m.name}</p>
          <p className="truncate text-[12px] text-muted">{m.title ?? '—'}</p>
          <div className="mt-2">
            <PresenceBadge status={m.presence} />
          </div>
          <p className="mt-2 truncate text-[11.5px] text-muted">{depts.join(' · ')}</p>
        </div>
      </div>
      <Tabs defaultValue="overview" className="px-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks{canSeeTasks ? ` (${open.length})` : ''}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-3 py-3">
          {canSeeTasks ? (
            current ? (
              <Link href={`/o/${orgId}/tasks?task=${current.id}`} className="block rounded-xl bg-bg-soft p-3 hover:bg-bg">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Current task</p>
                <p className="mt-1 truncate text-[13px] font-semibold text-ink">{current.title}</p>
                <div className="mt-2 flex items-center gap-2">
                  <ProgressBar value={current.progress} />
                  <span className="text-[11.5px] font-semibold text-ink-2">{current.progress}%</span>
                </div>
              </Link>
            ) : (
              <p className="rounded-xl bg-bg-soft p-3 text-[12.5px] text-muted">No open tasks.</p>
            )
          ) : (
            <p className="rounded-xl bg-bg-soft p-3 text-[12.5px] text-muted">Task details are visible to members of {m.name.split(' ')[0]}’s department.</p>
          )}
          <div className="flex items-center gap-3 rounded-xl bg-bg-soft p-3">
            <CalendarDays className="h-4 w-4 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Next meeting</p>
              <p className="truncate text-[12.5px] font-semibold text-ink">{next.data ? next.data.title : 'Nothing scheduled'}</p>
              {next.data && <p className="text-[11.5px] text-muted">{isToday(parseISO(next.data.startsAt)) ? 'Today' : format(parseISO(next.data.startsAt), 'EEE, MMM d')}, {fmtTime(next.data.startsAt)}</p>}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="tasks" className="max-h-[200px] space-y-1 overflow-y-auto py-3">
          {!canSeeTasks && <p className="text-[12.5px] text-muted">Not visible to you.</p>}
          {open.slice(0, 8).map((t) => (
            <Link key={t.id} href={`/o/${orgId}/tasks?task=${t.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg">
              <TaskStatusIcon status={t.status} />
              <span className="flex-1 truncate text-[12.5px] font-medium">{t.title}</span>
              <span className="text-[11px] text-muted">{dueLabel(t.dueDate)}</span>
            </Link>
          ))}
          {canSeeTasks && !open.length && <p className="text-[12.5px] text-muted">No open tasks.</p>}
        </TabsContent>
      </Tabs>
      <div className="flex gap-2 border-t border-line p-3">
        {m.id !== org.data?.me.memberId && (
          <Button size="sm" variant="secondary" onClick={message} className="flex-1">
            <MessageCircle /> Message
          </Button>
        )}
        <Button size="sm" variant="soft" className="flex-1" onClick={() => router.push(`/o/${orgId}/team?member=${m.id}`)}>
          View profile <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function AgentCard({ id }: { id: string }) {
  const orgId = useOrgId();
  const router = useRouter();
  const agents = useAgents();
  const org = useOrg();
  const a = agents.data?.find((x) => x.id === id);
  if (!a) return <div className="p-6 text-[13px] text-muted">Loading…</div>;
  const st = AGENT_STATUS[a.status];
  const dept = org.data?.departments.find((d) => d.id === a.departmentId);
  return (
    <div>
      <div className="flex gap-3 p-4 pb-3">
        <div className="flex h-[96px] w-[96px] shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#eef2fb,#f6f1f8)]">
          <RobotPortrait config={a.robot} size={80} dim={!a.enabled} />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate text-[15px] font-bold text-ink">{a.name}</p>
          <p className="truncate text-[12px] text-muted">{AGENT_ROLE_LABEL[a.role]} · {dept ? dept.name : 'Central service'}</p>
          <div className="mt-2">
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
          </div>
        </div>
      </div>
      <div className="space-y-2.5 px-4 pb-3">
        {a.currentRun ? (
          <Link href={`/o/${orgId}/agents?run=${a.currentRun.id}`} className="block rounded-xl bg-bg-soft p-3 hover:bg-bg">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Current run</p>
            <p className="mt-1 line-clamp-2 text-[12.5px] font-semibold text-ink">{a.currentRun.instruction}</p>
          </Link>
        ) : (
          <p className="rounded-xl bg-bg-soft p-3 text-[12.5px] text-muted">{a.status === 'running' || a.status === 'queued' ? 'Working on a run in another department.' : 'No active run. Status reflects real executions only.'}</p>
        )}
        <div className="flex items-center gap-4 text-[12px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5 text-muted" /> {a.openAssignedTasks} assigned tasks
          </span>
          <span className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-muted" /> {a.last30d.finished} runs (30d)
          </span>
        </div>
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => router.push(`/o/${orgId}/agents/${a.id}`)}>
          Details
        </Button>
        <Button size="sm" variant="primary" className="flex-1" onClick={() => router.push(`/o/${orgId}/agents/${a.id}?run=new`)} disabled={!a.enabled}>
          <Play /> Run agent
        </Button>
      </div>
    </div>
  );
}

export { PRESENCE_LABEL };
