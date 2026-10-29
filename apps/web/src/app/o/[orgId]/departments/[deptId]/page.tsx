'use client';
import { use, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, Settings2, Send, Play } from 'lucide-react';
import { AGENT_ROLE_LABEL } from '@space/shared';
import { useAgents, useDepartment, useOrg, useProjects, useRequests, useTasks, useFiles } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { useUi } from '@/lib/ui-store';
import { Button, Badge, Empty, ProgressBar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { DeptIcon, RequestStateBadge } from '@/components/domain';
import { AvatarPortrait, PresenceBadge, RobotPortrait } from '@/components/avatar';
import { TaskList, NewTaskDialog } from '@/components/tasks';
import { bytes, ago } from '@/lib/utils';

const OfficeView = dynamic(() => import('@/office/OfficeView').then((m) => m.OfficeView), { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-[22px] bg-surface" /> });

const STAT = [
  { k: 'todo', label: 'To do', tone: 'bg-bg text-ink-2' },
  { k: 'in_progress', label: 'In progress', tone: 'bg-powder text-powder-ink' },
  { k: 'in_review', label: 'Under review', tone: 'bg-lavender text-lavender-ink' },
  { k: 'done', label: 'Completed', tone: 'bg-sage text-sage-ink' },
];

export default function DepartmentPage({ params }: { params: Promise<{ deptId: string }> }) {
  const { deptId } = use(params);
  const orgId = useOrgId();
  const router = useRouter();
  const sp = useSearchParams();
  const org = useOrg();
  const dept = useDepartment(deptId);
  const selectDept = useUi((s) => s.selectDept);
  const [tab, setTab] = useState(sp.get('tab') ?? 'overview');
  const [newTask, setNewTask] = useState(false);
  const meta = org.data?.departments.find((d) => d.id === deptId);
  const d = dept.data;
  const tasks = useTasks({ departmentId: deptId, parentId: 'root' }, !!d?.canRead);
  const projects = useProjects(deptId);
  const reqs = useRequests('all');
  const agents = useAgents();
  const files = useFiles(deptId);
  useEffect(() => () => selectDept(null), [selectDept]);

  if (!meta) return dept.isLoading || org.isLoading ? null : <Empty title="Department not found" />;
  const deptReqs = (reqs.data ?? []).filter((r) => r.fromDepartmentId === deptId || r.toDepartmentId === deptId);
  const deptAgents = (agents.data ?? []).filter((a) => a.departmentId === deptId);

  return (
    <div className="grid h-full min-h-[600px] grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="relative min-h-[420px]">
        <OfficeView initialDept={deptId} className="absolute inset-0" />
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2.5 rounded-2xl bg-white/95 py-2 pl-2 pr-4 shadow-[var(--shadow-md)]">
          <button onClick={() => router.push(`/o/${orgId}`)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl hover:bg-bg" aria-label="Back to office">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DeptIcon theme={meta.theme} color={meta.color} size={34} />
          <div className="leading-tight">
            <p className="text-[14px] font-bold">{meta.name} Department</p>
            <p className="text-[11.5px] text-muted">
              {meta.memberCount} members{d?.stats ? ` · ${d.stats.in_progress ?? 0} tasks in progress` : ''}
            </p>
          </div>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-line bg-surface">
        <div className="flex items-center gap-3 px-5 pt-4">
          <DeptIcon theme={meta.theme} color={meta.color} size={40} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[18px] font-bold">{meta.name}</h1>
            <p className="text-[12px] text-muted">
              {meta.memberCount} members · {meta.agentCount} AI agents{meta.myRole ? ` · You are ${meta.myRole === 'admin' ? 'an admin' : 'a member'}` : ''}
            </p>
          </div>
          {meta.canAdmin && (
            <Button size="iconSm" variant="ghost" aria-label="Department settings" onClick={() => router.push(`/o/${orgId}/settings/departments/${deptId}`)}>
              <Settings2 />
            </Button>
          )}
        </div>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mt-3 overflow-x-auto px-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="overview" className="space-y-4 p-5">
              {meta.description && <p className="text-[13px] leading-relaxed text-ink-2">{meta.description}</p>}
              {d?.stats ? (
                <div className="grid grid-cols-2 gap-2">
                  {STAT.map((s) => (
                    <div key={s.k} className="rounded-2xl border border-line p-3">
                      <span className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                      <p className="mt-1.5 text-[22px] font-extrabold">{d.stats![s.k] ?? 0}</p>
                    </div>
                  ))}
                  <div className="col-span-2 rounded-2xl border border-line p-3 text-[12.5px]">
                    <span className="font-semibold">{d.stats.incomingRequests ?? 0}</span> incoming requests waiting for a decision
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-bg-soft p-3 text-[12.5px] text-muted">Work details are visible to members of this department.</p>
              )}
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">People</p>
                <div className="flex flex-wrap gap-1.5">
                  {d?.members.map((m) => (
                    <Link key={m.id} href={`/o/${orgId}/team?member=${m.id}`} title={m.name}>
                      <AvatarPortrait name={m.name} size={34} />
                    </Link>
                  ))}
                  {deptAgents.map((a) => (
                    <Link key={a.id} href={`/o/${orgId}/agents/${a.id}`} title={`${a.name} (AI)`}>
                      <RobotPortrait config={a.robot} size={34} />
                    </Link>
                  ))}
                </div>
              </div>
              {meta.canAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" onClick={() => setNewTask(true)}>
                    <Plus /> New task
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/o/${orgId}/requests?new=1&from=${deptId}`)}>
                    <Send /> Request work from another team
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="tasks">
              {d?.canRead ? (
                <>
                  {meta.myRole || org.data?.me.role === 'company_admin' ? (
                    <div className="flex justify-end px-4 pt-3">
                      <Button size="sm" variant="soft" onClick={() => setNewTask(true)}>
                        <Plus /> New task
                      </Button>
                    </div>
                  ) : null}
                  <TaskList tasks={tasks.data ?? []} />
                </>
              ) : (
                <Empty title="Not visible" body="Only members of this department can see its tasks." />
              )}
            </TabsContent>
            <TabsContent value="team" className="divide-y divide-line">
              {d?.members.map((m) => (
                <Link key={m.id} href={`/o/${orgId}/team?member=${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-bg-soft">
                  <AvatarPortrait name={m.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {m.name} {m.role === 'admin' && <Badge tone="brand">Admin</Badge>}
                    </p>
                    <p className="truncate text-[12px] text-muted">{m.title}</p>
                  </div>
                  <PresenceBadge status={m.presence as never} />
                </Link>
              ))}
            </TabsContent>
            <TabsContent value="requests" className="divide-y divide-line">
              {!deptReqs.length && <Empty title="No requests" />}
              {deptReqs.map((r) => (
                <Link key={r.id} href={`?request=${r.id}&tab=requests`} scroll={false} className="block px-5 py-3 hover:bg-bg-soft">
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-muted">{r.fromDepartmentId === deptId ? `To ${r.to.name}` : `From ${r.from.name}`}</span>
                    <span className="ml-auto">
                      <RequestStateBadge state={r.state} />
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[13px] font-semibold">{r.title}</p>
                  {r.progress.total > 0 && <ProgressBar value={(r.progress.done / r.progress.total) * 100} className="mt-2" />}
                </Link>
              ))}
            </TabsContent>
            <TabsContent value="agents" className="divide-y divide-line">
              {!deptAgents.length && <Empty title="No department agents" body="Central agents are available from the AI Agent Hub." />}
              {deptAgents.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <RobotPortrait config={a.robot} size={38} dim={!a.enabled} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{a.name}</p>
                    <p className="text-[12px] text-muted">{AGENT_ROLE_LABEL[a.role]} · {a.status.replace('_', ' ')}</p>
                  </div>
                  <Button size="sm" variant="soft" onClick={() => router.push(`/o/${orgId}/agents/${a.id}?run=new`)} disabled={!a.enabled}>
                    <Play /> Run
                  </Button>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="projects" className="divide-y divide-line">
              {!projects.data?.length && <Empty title="No projects visible" />}
              {projects.data?.map((p) => (
                <Link key={p.id} href={`/o/${orgId}/projects/${p.id}`} className="block px-5 py-3 hover:bg-bg-soft">
                  <p className="text-[13px] font-semibold">{p.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar value={p.taskCount ? ((p.doneCount ?? 0) / p.taskCount) * 100 : 0} color={p.color ?? undefined} />
                    <span className="shrink-0 text-[11.5px] text-muted">
                      {p.doneCount}/{p.taskCount}
                    </span>
                  </div>
                </Link>
              ))}
            </TabsContent>
            <TabsContent value="files" className="divide-y divide-line">
              {!files.data?.length && <Empty title="No files" />}
              {files.data?.map((f) => (
                <a key={f.id} href={`/api/orgs/${orgId}/files/${f.id}/download`} className="flex items-center gap-3 px-5 py-3 hover:bg-bg-soft">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{f.name}</span>
                    <span className="text-[11.5px] text-muted">
                      {f.ownerName} · {ago(f.createdAt)}
                    </span>
                  </span>
                  <span className="text-[11.5px] text-muted">{bytes(f.size)}</span>
                </a>
              ))}
            </TabsContent>
          </div>
        </Tabs>
      </aside>
      <NewTaskDialog open={newTask} onOpenChange={setNewTask} />
    </div>
  );
}
