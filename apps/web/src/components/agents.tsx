'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Play, AlertTriangle } from 'lucide-react';
import { AGENT_WORKFLOW_LABEL, AGENT_ROLES, AGENT_ROLE_LABEL, ROBOT_THEMES, ROBOT_EARS, ROBOT_FACES, type AgentWorkflow } from '@space/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useAgentMeta, useFiles, useOrg, useTasks } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Button, Dialog, DialogContent, Field, Input, Select, Textarea, Badge } from './ui/primitives';
import { RobotPortrait } from './avatar';
import type { Agent } from '@/lib/types';
import { cn } from '@/lib/utils';

export const STATUS_BADGE: Record<Agent['status'], { label: string; tone: 'sage' | 'powder' | 'butter' | 'neutral' | 'lavender' }> = {
  idle: { label: 'Idle', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'lavender' },
  running: { label: 'Working', tone: 'powder' },
  awaiting_approval: { label: 'Needs approval', tone: 'butter' },
  disabled: { label: 'Disabled', tone: 'neutral' },
};

/** Start a real agent run. The worker executes it; the UI only shows what actually happened. */
export function RunAgentDialog({ agent, open, onOpenChange }: { agent: Agent; open: boolean; onOpenChange: (v: boolean) => void }) {
  const orgId = useOrgId();
  const org = useOrg();
  const router = useRouter();
  const qc = useQueryClient();
  const meta = useAgentMeta();
  const usableDepts = (org.data?.departments ?? []).filter((d) => (agent.departmentId ? d.id === agent.departmentId : d.canAdmin));
  const [deptId, setDeptId] = useState(agent.departmentId ?? usableDepts[0]?.id ?? '');
  const [workflow, setWorkflow] = useState<AgentWorkflow>('llm');
  const [instruction, setInstruction] = useState('');
  const [taskId, setTaskId] = useState('none');
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const tasks = useTasks({ departmentId: deptId || undefined, parentId: 'root' }, !!deptId);
  const files = useFiles(deptId || undefined);
  const textFiles = (files.data ?? []).filter((f) => /^(text\/|application\/json)/.test(f.mime));
  const noProvider = workflow === 'llm' && meta.data && !meta.data.provider;

  async function start() {
    setBusy(true);
    try {
      const run = await api.post<{ id: string }>(`/orgs/${orgId}/agents/${agent.id}/runs`, {
        departmentId: deptId,
        workflow,
        instruction: instruction.trim() || AGENT_WORKFLOW_LABEL[workflow],
        taskId: taskId === 'none' ? null : taskId,
        fileIds,
        idempotencyKey: `${agent.id}:${Date.now()}`,
      });
      qc.invalidateQueries({ queryKey: ['agents', orgId] });
      qc.invalidateQueries({ queryKey: ['runs', orgId] });
      toast.success('Run queued — the agent worker will pick it up');
      onOpenChange(false);
      router.push(`/o/${orgId}/agents?run=${run.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Run ${agent.name}`} description="The run executes in the selected department’s context and is fully logged." wide>
        {!usableDepts.length ? (
          <p className="text-[13px] text-muted">You can’t run this agent. Department agents can be run by that department’s members; central agents by department admins.</p>
        ) : (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department context">
                <Select value={deptId} onValueChange={setDeptId} disabled={!!agent.departmentId} options={usableDepts.map((d) => ({ value: d.id, label: d.name }))} />
              </Field>
              <Field label="Mode">
                <Select
                  value={workflow}
                  onValueChange={(v) => setWorkflow(v as AgentWorkflow)}
                  options={(Object.keys(AGENT_WORKFLOW_LABEL) as AgentWorkflow[]).map((w) => ({ value: w, label: AGENT_WORKFLOW_LABEL[w] }))}
                />
              </Field>
            </div>
            {noProvider && (
              <p className="flex gap-2 rounded-xl bg-butter px-3 py-2 text-[12.5px] text-butter-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No language-model provider is configured on this server, so an AI-instruction run will fail with a clear error. Built-in workflows work without one.
              </p>
            )}
            <Field label={workflow === 'llm' ? 'Instruction' : 'Note (optional)'}>
              <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={workflow === 'llm' ? 'e.g. Summarise the open tasks for this sprint and draft a status update.' : 'Shown in the run history'} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Related task (optional)">
                <Select value={taskId} onValueChange={setTaskId} options={[{ value: 'none', label: 'None' }, ...(tasks.data ?? []).map((t) => ({ value: t.id, label: t.title }))]} />
              </Field>
              <Field label="Text files the agent may read">
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                  {!textFiles.length && <p className="text-[12px] text-muted">No text files in this department.</p>}
                  {textFiles.map((f) => (
                    <label key={f.id} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                      <input type="checkbox" checked={fileIds.includes(f.id)} onChange={(e) => setFileIds(e.target.checked ? [...fileIds, f.id] : fileIds.filter((x) => x !== f.id))} />
                      <span className="truncate">{f.name}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={start} disabled={!deptId || (workflow === 'llm' && instruction.trim().length < 3)}>
                <Play /> Start run
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Create or edit an agent's configuration (tools, autonomy, budget, appearance). */
export function AgentConfigDialog({ agent, open, onOpenChange }: { agent?: Agent; open: boolean; onOpenChange: (v: boolean) => void }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const meta = useAgentMeta();
  const isAdmin = org.data?.me.role === 'company_admin';
  const adminDepts = (org.data?.departments ?? []).filter((d) => d.canAdmin);
  const [f, setF] = useState(() => ({
    name: agent?.name ?? '',
    role: agent?.role ?? 'documentation',
    description: agent?.description ?? '',
    departmentId: agent ? agent.departmentId ?? 'central' : isAdmin ? 'central' : adminDepts[0]?.id ?? '',
    tools: agent?.tools ?? ['list_department_tasks', 'get_task'],
    autonomy: agent?.autonomy ?? 'supervised',
    monthlyBudgetUsd: agent?.monthlyBudgetUsd ?? 25,
    maxStepsPerRun: agent?.maxStepsPerRun ?? 12,
    robot: agent?.robot ?? { theme: 'sky', ears: 'headphones', face: 'happy', badge: '' },
    systemPrompt: agent?.systemPrompt ?? '',
    enabled: agent?.enabled ?? true,
  }));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const body = { ...f, departmentId: f.departmentId === 'central' ? null : f.departmentId, systemPrompt: f.systemPrompt || undefined, description: f.description || undefined };
      if (agent) await api.patch(`/orgs/${orgId}/agents/${agent.id}`, body);
      else await api.post(`/orgs/${orgId}/agents`, body);
      qc.invalidateQueries({ queryKey: ['agents', orgId] });
      qc.invalidateQueries({ queryKey: ['agent', orgId] });
      toast.success(agent ? 'Agent updated' : 'Agent created');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const riskTone = { read: 'sage', write_internal: 'butter', write_external: 'rose' } as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={agent ? `Configure ${agent.name}` : 'New AI agent'} wide>
        <div className="grid grid-cols-[120px_1fr] gap-5">
          <div className="flex flex-col items-center gap-3">
            <RobotPortrait config={f.robot} size={104} />
            <div className="flex flex-wrap justify-center gap-1">
              {ROBOT_THEMES.map((t) => (
                <button key={t} aria-label={`Colour ${t}`} onClick={() => setF({ ...f, robot: { ...f.robot, theme: t } })} className={cn('h-5 w-5 cursor-pointer rounded-full ring-offset-1', f.robot.theme === t && 'ring-2 ring-ink/40')} style={{ background: ({ sky: '#8fb6f0', blush: '#f2a7c3', mint: '#88d1b4', peach: '#f6b07f', lilac: '#b8a2ea', butter: '#f2d27a', graphite: '#7d8597', cloud: '#c9d2e3' } as Record<string, string>)[t] }} />
              ))}
            </div>
            <Select className="h-8 text-[12px]" value={f.robot.ears} onValueChange={(v) => setF({ ...f, robot: { ...f.robot, ears: v as never } })} options={ROBOT_EARS.map((e) => ({ value: e, label: e }))} aria-label="Ears" />
            <Select className="h-8 text-[12px]" value={f.robot.face} onValueChange={(v) => setF({ ...f, robot: { ...f.robot, face: v as never } })} options={ROBOT_FACES.map((e) => ({ value: e, label: e }))} aria-label="Face" />
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
              <Field label="Role">
                <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as never })} options={AGENT_ROLES.map((r) => ({ value: r, label: AGENT_ROLE_LABEL[r] }))} />
              </Field>
              <Field label="Department">
                <Select
                  value={f.departmentId}
                  disabled={!!agent && !isAdmin}
                  onValueChange={(v) => setF({ ...f, departmentId: v })}
                  options={[...(isAdmin ? [{ value: 'central', label: 'Central (all departments)' }] : []), ...adminDepts.map((d) => ({ value: d.id, label: d.name }))]}
                />
              </Field>
              <Field label="Autonomy" hint={!isAdmin ? 'Only company admins can grant autonomous mode' : undefined}>
                <Select
                  value={f.autonomy}
                  onValueChange={(v) => setF({ ...f, autonomy: v as never })}
                  options={[
                    { value: 'supervised', label: 'Supervised — approve internal writes' },
                    ...(isAdmin || f.autonomy === 'autonomous' ? [{ value: 'autonomous', label: 'Autonomous within policy' }] : []),
                  ]}
                />
              </Field>
              <Field label="Monthly budget (USD)">
                <Input type="number" min={0} value={f.monthlyBudgetUsd} onChange={(e) => setF({ ...f, monthlyBudgetUsd: +e.target.value })} />
              </Field>
              <Field label="Max model steps per run">
                <Input type="number" min={1} max={40} value={f.maxStepsPerRun} onChange={(e) => setF({ ...f, maxStepsPerRun: +e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-2">Tool access</p>
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
                {meta.data?.tools.map((t) => (
                  <label key={t.name} className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 text-[12.5px] hover:bg-bg">
                    <input type="checkbox" className="mt-0.5" checked={f.tools.includes(t.name)} onChange={(e) => setF({ ...f, tools: e.target.checked ? [...f.tools, t.name] : f.tools.filter((x) => x !== t.name) })} />
                    <span>
                      <span className="font-semibold">{t.label}</span> <Badge tone={riskTone[t.risk as keyof typeof riskTone]}>{t.risk.replace('_', ' ')}</Badge>
                      <span className="block text-[11.5px] text-muted">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11.5px] text-muted">External writes (e.g. creating GitHub issues) always require human approval.</p>
            </div>
            <Field label="Role guidance (system prompt addition)">
              <Textarea value={f.systemPrompt} onChange={(e) => setF({ ...f, systemPrompt: e.target.value })} placeholder="Tone, focus areas, house style…" />
            </Field>
            {agent && (
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Enabled
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={save} disabled={!f.name.trim()}>
                {agent ? 'Save changes' : 'Create agent'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
