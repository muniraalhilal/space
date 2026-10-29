'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Plus, ShieldAlert, Activity, Cpu } from 'lucide-react';
import { AGENT_ROLE_LABEL, TOOL_BY_NAME } from '@space/shared';
import { useAgentMeta, useAgents, useApprovals, useOrg, useRuns } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { Badge, Button, Card, Empty, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives';
import { RobotPortrait } from '@/components/avatar';
import { STATUS_BADGE, AgentConfigDialog } from '@/components/agents';
import { RUN_LABEL, RUN_TONE } from '@/components/drawers/RunDrawer';
import { ago } from '@/lib/utils';

export default function AgentHub() {
  const orgId = useOrgId();
  const path = usePathname();
  const org = useOrg();
  const agents = useAgents();
  const runs = useRuns();
  const approvals = useApprovals();
  const meta = useAgentMeta();
  const [filter, setFilter] = useState<'all' | 'active' | 'idle'>('all');
  const [create, setCreate] = useState(false);
  const list = (agents.data ?? []).filter((a) => (filter === 'all' ? true : filter === 'active' ? ['running', 'queued', 'awaiting_approval'].includes(a.status) : a.status === 'idle'));
  const canCreate = (org.data?.departments ?? []).some((d) => d.canAdmin);
  const activeCount = (agents.data ?? []).filter((a) => ['running', 'queued', 'awaiting_approval'].includes(a.status)).length;

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        icon={<Bot className="text-lavender-ink" />}
        title="AI Agent Hub"
        subtitle="Agents work inside explicit permissions. Every status here comes from real executions."
        actions={
          canCreate && (
            <Button variant="primary" onClick={() => setCreate(true)}>
              <Plus /> New agent
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: `All (${agents.data?.length ?? 0})` }, { value: 'active', label: `Active (${activeCount})` }, { value: 'idle', label: 'Idle' }]} />
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[12px] text-ink-2 shadow-sm">
          <Cpu className="h-3.5 w-3.5 text-muted" />
          {meta.data?.provider ? `Model provider: ${meta.data.provider.name} · ${meta.data.provider.model}` : 'No model provider configured — built-in workflows only'}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {agents.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
          ) : !list.length ? (
            <Card>
              <Empty icon={<Bot />} title="No agents here" />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((a) => {
                const st = STATUS_BADGE[a.status];
                const dept = org.data?.departments.find((d) => d.id === a.departmentId);
                return (
                  <Link key={a.id} href={`/o/${orgId}/agents/${a.id}`} className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-sm)] transition hover:border-line-strong hover:shadow-[var(--shadow-md)]">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-[linear-gradient(180deg,#eef2fb,#f6f1f8)] p-1.5">
                        <RobotPortrait config={a.robot} size={58} dim={!a.enabled} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold">{a.name}</p>
                        <p className="text-[12px] text-muted">
                          {AGENT_ROLE_LABEL[a.role]} · {dept ? dept.name : 'Central'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                          {a.autonomy === 'autonomous' && <Badge tone="peach">Autonomous</Badge>}
                        </div>
                      </div>
                    </div>
                    {a.description && <p className="mt-3 line-clamp-2 text-[12.5px] text-ink-2">{a.description}</p>}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-bg-soft py-2">
                        <p className="text-[15px] font-bold">{a.last30d.finished}</p>
                        <p className="text-[10.5px] text-muted">runs · 30d</p>
                      </div>
                      <div className="rounded-xl bg-bg-soft py-2">
                        <p className="text-[15px] font-bold">{a.last30d.successRate === null ? '—' : `${a.last30d.successRate}%`}</p>
                        <p className="text-[10.5px] text-muted">succeeded</p>
                      </div>
                      <div className="rounded-xl bg-bg-soft py-2">
                        <p className="text-[15px] font-bold">{a.openAssignedTasks}</p>
                        <p className="text-[10.5px] text-muted">open tasks</p>
                      </div>
                    </div>
                    <p className="mt-2.5 truncate text-[11.5px] text-muted">{a.tools.map((t) => TOOL_BY_NAME[t]?.label ?? t).join(' · ')}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-[13.5px] font-bold">
              <ShieldAlert className="h-4 w-4 text-butter-ink" /> Waiting for approval
            </p>
            {!approvals.data?.length && <p className="text-[12.5px] text-muted">Nothing needs a decision.</p>}
            {approvals.data?.map((a) => (
              <Link key={a.id} href={`${path}?run=${a.runId}`} scroll={false} className="mb-2 block rounded-xl border border-butter-ink/20 bg-butter/50 p-3 hover:bg-butter">
                <p className="text-[12.5px] font-semibold">
                  {a.agentName}: {a.toolLabel}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-2">{a.runInstruction}</p>
                <p className="mt-1 text-[11px] text-muted">{ago(a.createdAt)}</p>
              </Link>
            ))}
          </Card>
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-[13.5px] font-bold">
              <Activity className="h-4 w-4 text-powder-ink" /> Recent runs
            </p>
            {!runs.data?.length && <p className="text-[12.5px] text-muted">No runs yet. Start one from an agent’s page — the demo includes no fabricated history.</p>}
            <div className="space-y-1">
              {runs.data?.slice(0, 12).map((r) => (
                <Link key={r.id} href={`${path}?run=${r.id}`} scroll={false} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{r.agentName}</span>
                    <span className="block truncate text-[11.5px] text-muted">{r.instruction}</span>
                  </span>
                  <Badge tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Badge>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {create && <AgentConfigDialog open={create} onOpenChange={setCreate} />}
    </div>
  );
}
