'use client';
import { toast } from 'sonner';
import { X, Check, Ban, ShieldAlert, Cpu, Wrench, AlertCircle, Clock, FileText } from 'lucide-react';
import { AGENT_WORKFLOW_LABEL, TOOL_BY_NAME, type AgentWorkflow } from '@space/shared';
import { useRun, qk, useOrg } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, Skeleton, type Tone } from '@/components/ui/primitives';
import { RobotPortrait } from '@/components/avatar';
import { ago, fmtDateTime } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export const RUN_TONE: Record<string, Tone> = { queued: 'lavender', running: 'powder', awaiting_approval: 'butter', succeeded: 'sage', failed: 'rose', cancelled: 'neutral', timed_out: 'rose' };
export const RUN_LABEL: Record<string, string> = { queued: 'Queued', running: 'Running', awaiting_approval: 'Awaiting approval', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled', timed_out: 'Timed out' };

export function RunDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const run = useRun(id);
  const org = useOrg();
  const r = run.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.run(orgId, id) });
    qc.invalidateQueries({ queryKey: ['runs', orgId] });
    qc.invalidateQueries({ queryKey: ['agents', orgId] });
    qc.invalidateQueries({ queryKey: ['approvals', orgId] });
  };
  async function decide(approvalId: string, decision: 'approve' | 'deny') {
    try {
      await api.post(`/orgs/${orgId}/agent-approvals/${approvalId}/decision`, { decision });
      toast.success(decision === 'approve' ? 'Approved — the agent will continue' : 'Denied — the agent will continue without it');
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  if (run.isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40 w-full" /></div>;
  if (!r) return <div className="p-6 text-[13px] text-muted">Run not found or not visible to you.</div>;
  const workflow = r.provider?.startsWith('builtin:') ? (r.provider.slice(8) as AgentWorkflow) : null;
  const dept = org.data?.departments.find((d) => d.id === r.departmentId);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <RobotPortrait config={r.agent.robot} size={34} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-bold">{r.agent.name}</p>
          <p className="text-[11.5px] text-muted">Run in {dept?.name ?? 'department'} context · requested {ago(r.createdAt)}</p>
        </div>
        <Badge tone={RUN_TONE[r.status]} dot>
          {RUN_LABEL[r.status]}
        </Badge>
        <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-muted hover:bg-bg" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Instruction</p>
          <p className="mt-1 whitespace-pre-wrap rounded-xl bg-bg-soft p-3 text-[13px]">{r.instruction}</p>
        </section>
        <section className="grid grid-cols-2 gap-2 text-[12.5px]">
          <div className="rounded-xl border border-line p-3">
            <p className="flex items-center gap-1.5 text-muted"><Cpu className="h-3.5 w-3.5" /> Execution</p>
            <p className="mt-1 font-semibold">{workflow ? AGENT_WORKFLOW_LABEL[workflow] : r.model ? `${r.provider} · ${r.model}` : 'Language model'}</p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="flex items-center gap-1.5 text-muted"><Clock className="h-3.5 w-3.5" /> Timing</p>
            <p className="mt-1 font-semibold">{r.startedAt ? fmtDateTime(r.startedAt) : 'Not started'}{r.finishedAt && r.startedAt ? ` · ${Math.max(1, Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000))}s` : ''}</p>
          </div>
          {!workflow && (
            <div className="col-span-2 rounded-xl border border-line p-3">
              <p className="text-muted">Usage</p>
              <p className="mt-1 font-semibold">
                {r.steps} model steps · {r.inputTokens.toLocaleString()} in / {r.outputTokens.toLocaleString()} out tokens · ≈ ${r.costUsd.toFixed(4)} <span className="font-normal text-muted">(estimated from list prices)</span>
              </p>
            </div>
          )}
        </section>

        {r.approvals.filter((a) => a.status === 'pending').map((a) => (
          <section key={a.id} className="rounded-2xl border border-butter-ink/30 bg-butter/60 p-4">
            <p className="flex items-center gap-2 text-[13px] font-bold text-butter-ink">
              <ShieldAlert className="h-4 w-4" /> Approval needed: {TOOL_BY_NAME[a.toolName]?.label ?? a.toolName}
            </p>
            <p className="mt-1 text-[12px] text-ink-2">{TOOL_BY_NAME[a.toolName]?.description}</p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2.5 text-[11.5px] text-ink-2">{JSON.stringify(a.input, null, 2)}</pre>
            {r.canDecide ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => decide(a.id, 'approve')}>
                  <Check /> Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => decide(a.id, 'deny')}>
                  <Ban /> Deny
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-muted">A department admin must decide.</p>
            )}
          </section>
        ))}

        {r.result && (
          <section>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
              <FileText className="h-3.5 w-3.5" /> Result {workflow ? '(built-in workflow — no language model)' : '(agent output — review before relying on it)'}
            </p>
            <pre className="mt-1 max-h-[340px] overflow-auto whitespace-pre-wrap rounded-xl bg-bg-soft p-3 font-sans text-[13px] leading-relaxed">{r.result}</pre>
          </section>
        )}
        {r.error && (
          <section className="rounded-xl bg-rose p-3 text-[13px] text-rose-ink">
            <p className="flex items-center gap-1.5 font-semibold"><AlertCircle className="h-4 w-4" /> {RUN_LABEL[r.status]}</p>
            <p className="mt-1">{r.error}</p>
          </section>
        )}

        <section>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Execution log</p>
          {!r.stepLog.length && <p className="text-[12.5px] text-muted-2">No steps recorded yet.</p>}
          <ol className="space-y-2">
            {r.stepLog.map((s) => (
              <li key={s.id} className="rounded-xl border border-line p-2.5 text-[12.5px]">
                <p className="flex items-center gap-1.5 font-semibold">
                  {s.kind === 'model' ? <Cpu className="h-3.5 w-3.5 text-lavender-ink" /> : s.kind === 'error' ? <AlertCircle className="h-3.5 w-3.5 text-rose-ink" /> : s.kind === 'approval' ? <ShieldAlert className="h-3.5 w-3.5 text-butter-ink" /> : <Wrench className="h-3.5 w-3.5 text-powder-ink" />}
                  {s.kind === 'model' ? 'Model step' : s.kind === 'tool_result' ? `Tool · ${TOOL_BY_NAME[s.toolName ?? '']?.label ?? s.toolName}` : s.kind === 'approval' ? `Approval requested · ${s.toolName}` : s.kind === 'error' ? 'Error' : 'Log'}
                  <span className="ml-auto font-normal text-muted-2">{fmtDateTime(s.createdAt)}</span>
                </p>
                {s.content?.text && <p className="mt-1 whitespace-pre-wrap text-ink-2">{s.content.text}</p>}
                {s.content?.toolCalls?.length > 0 && <p className="mt-1 text-muted">Requested tools: {s.content.toolCalls.map((c: { name: string }) => c.name).join(', ')}</p>}
                {s.content?.message && <p className="mt-1 text-ink-2">{s.content.message}</p>}
                {s.content?.note && !s.content?.output && <p className="mt-1 text-ink-2">{s.content.note}</p>}
                {s.content?.error && <p className="mt-1 text-rose-ink">{s.content.error}</p>}
                {s.content?.denied && <p className="mt-1 text-rose-ink">Denied{s.content.reason ? `: ${s.content.reason}` : ''}</p>}
                {s.content?.output && <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-soft p-2 text-[11px] text-muted">{typeof s.content.output === 'string' ? s.content.output : JSON.stringify(s.content.output, null, 1)}</pre>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      {r.canCancel && (
        <div className="border-t border-line p-3">
          <Button
            variant="outlineDanger"
            size="sm"
            onClick={async () => {
              try {
                await api.post(`/orgs/${orgId}/agent-runs/${id}/cancel`);
                refresh();
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Ban /> Cancel run
          </Button>
        </div>
      )}
    </div>
  );
}
