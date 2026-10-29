'use client';
import { use, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Play, Settings2, Wallet, Gauge, Wrench } from 'lucide-react';
import { AGENT_ROLE_LABEL, TOOL_BY_NAME } from '@space/shared';
import { useAgent, useOrg, useRuns, useTasks } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { Badge, Button, Card, Empty, Skeleton } from '@/components/ui/primitives';
import { STATUS_BADGE, RunAgentDialog, AgentConfigDialog } from '@/components/agents';
import { RUN_LABEL, RUN_TONE } from '@/components/drawers/RunDrawer';
import { TaskList } from '@/components/tasks';
import { ago } from '@/lib/utils';

const RobotStage = dynamic(() => import('@/office/RobotPreview'), { ssr: false });

export default function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const orgId = useOrgId();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const org = useOrg();
  const agent = useAgent(agentId);
  const runs = useRuns(agentId);
  const tasks = useTasks({ assignee: agentId });
  const [runOpen, setRunOpen] = useState(false);
  const [cfg, setCfg] = useState(false);
  useEffect(() => {
    if (sp.get('run') === 'new') setRunOpen(true);
  }, [sp]);
  const a = agent.data;
  if (!a) return agent.isLoading ? <Skeleton className="h-64" /> : <Empty title="Agent not found" />;
  const dept = org.data?.departments.find((d) => d.id === a.departmentId);
  const st = STATUS_BADGE[a.status];
  return (
    <div className="mx-auto max-w-[1180px]">
      <button onClick={() => router.push(`/o/${orgId}/agents`)} className="mb-4 flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> AI Agent Hub
      </button>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="h-[260px] bg-[linear-gradient(180deg,#eef2fb,#f7f1f8)]">
            <RobotStage config={a.robot} status={a.status === 'disabled' ? 'disabled' : a.status} />
          </div>
          <div className="p-5">
            <h1 className="text-[20px] font-bold">{a.name}</h1>
            <p className="text-[12.5px] text-muted">
              {AGENT_ROLE_LABEL[a.role]} · {dept ? dept.name : 'Central service agent'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={st.tone} dot>
                {st.label}
              </Badge>
              <Badge tone={a.autonomy === 'autonomous' ? 'peach' : 'sage'}>{a.autonomy === 'autonomous' ? 'Autonomous within policy' : 'Supervised'}</Badge>
            </div>
            {a.description && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{a.description}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => setRunOpen(true)} disabled={!a.enabled}>
                <Play /> Run agent
              </Button>
              {a.canManage && (
                <Button onClick={() => setCfg(true)}>
                  <Settings2 /> Configure
                </Button>
              )}
            </div>
            <div className="mt-5 space-y-2 text-[12.5px]">
              <p className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted" /> ${(a.spentThisMonthUsd ?? 0).toFixed(2)} of ${a.monthlyBudgetUsd} monthly budget (estimated)
              </p>
              <p className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted" /> Up to {a.maxStepsPerRun} model steps per run
              </p>
            </div>
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
                <Wrench className="h-3.5 w-3.5" /> Tools
              </p>
              <div className="flex flex-wrap gap-1.5">
                {a.tools.map((t) => (
                  <Badge key={t} tone={TOOL_BY_NAME[t]?.risk === 'read' ? 'neutral' : TOOL_BY_NAME[t]?.risk === 'write_external' ? 'rose' : 'butter'}>
                    {TOOL_BY_NAME[t]?.label ?? t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 text-[14px] font-bold">Run history</p>
            {!runs.data?.length && <p className="text-[12.5px] text-muted">No runs yet.</p>}
            <div className="divide-y divide-line">
              {runs.data?.map((r) => (
                <Link key={r.id} href={`${path}?run=${r.id}`} scroll={false} className="flex items-center gap-3 py-2.5 hover:bg-bg-soft">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{r.instruction}</span>
                    <span className="block text-[11.5px] text-muted">
                      {r.requestedBy} · {ago(r.createdAt)} · {r.provider?.startsWith('builtin:') ? 'built-in workflow' : `${r.steps} steps`}
                    </span>
                  </span>
                  <Badge tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Badge>
                </Link>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <p className="px-4 pt-4 text-[14px] font-bold">Assigned tasks</p>
            <TaskList tasks={tasks.data ?? []} emptyTitle="No tasks assigned to this agent" />
          </Card>
        </div>
      </div>
      {runOpen && (
        <RunAgentDialog
          agent={a}
          open={runOpen}
          onOpenChange={(v) => {
            setRunOpen(v);
            if (!v && sp.get('run') === 'new') router.replace(path);
          }}
        />
      )}
      {cfg && <AgentConfigDialog agent={a} open={cfg} onOpenChange={setCfg} />}
    </div>
  );
}
