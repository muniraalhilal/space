import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  AGENT_RUN_ACTIVE,
  TOOL_BY_NAME,
  createAgentSchema,
  updateAgentSchema,
  createAgentRunSchema,
  decideApprovalSchema,
  githubIntegrationSchema,
  normalizeRobot,
} from '@space/shared';
import type { z } from 'zod';
import { getDb, schema } from '../db/client';
import { OrgContext } from '../common/context';
import { Errors } from '../common/errors';
import { AuditService } from '../common/audit.service';
import { encryptSecret } from '../common/crypto';
import { publish } from '../realtime/bus';
import { enqueueRun } from './queue';
import { monthSpendUsd } from './executor';

const S = schema;

@Injectable()
export class AgentsService {
  constructor(private readonly audit: AuditService) {}

  /** Agents usable or administrable in a department: its own agents plus central ones. */
  private canManage(ctx: OrgContext, a: { departmentId: string | null }) {
    return a.departmentId ? ctx.canAdminDept(a.departmentId) : ctx.isCompanyAdmin;
  }

  /**
   * Who may start a run: department agents — any non-viewer member of that department;
   * central agents — admins of the department whose context the run uses.
   */
  private canRun(ctx: OrgContext, a: { departmentId: string | null }, runDeptId: string) {
    if (a.departmentId) return a.departmentId === runDeptId && ctx.canWriteDept(runDeptId);
    return ctx.canAdminDept(runDeptId);
  }

  /** List with live status derived from real run records (never simulated). */
  async list(ctx: OrgContext) {
    const db = getDb();
    const agents = await db.select().from(S.agents).where(eq(S.agents.orgId, ctx.orgId)).orderBy(asc(S.agents.name));
    const active = await db
      .select({ agentId: S.agentRuns.agentId, status: S.agentRuns.status, instruction: S.agentRuns.instruction, departmentId: S.agentRuns.departmentId, id: S.agentRuns.id })
      .from(S.agentRuns)
      .where(and(eq(S.agentRuns.orgId, ctx.orgId), inArray(S.agentRuns.status, AGENT_RUN_ACTIVE)))
      .orderBy(desc(S.agentRuns.createdAt));
    const since = new Date(Date.now() - 30 * 86400_000);
    const stats = await db
      .select({ agentId: S.agentRuns.agentId, status: S.agentRuns.status, n: count() })
      .from(S.agentRuns)
      .where(and(eq(S.agentRuns.orgId, ctx.orgId), gte(S.agentRuns.createdAt, since)))
      .groupBy(S.agentRuns.agentId, S.agentRuns.status);
    const assigned = await db
      .select({ agentId: S.tasks.assigneeAgentId, n: count() })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), sql`${S.tasks.assigneeAgentId} is not null`, sql`${S.tasks.status} <> 'done'`))
      .groupBy(S.tasks.assigneeAgentId);
    return agents.map((a) => {
      const mine = active.filter((r) => r.agentId === a.id);
      const visibleRun = mine.find((r) => ctx.canReadDept(r.departmentId));
      const st = stats.filter((s) => s.agentId === a.id);
      const finished = st.filter((s) => ['succeeded', 'failed', 'timed_out', 'cancelled'].includes(s.status)).reduce((x, y) => x + y.n, 0);
      const ok = st.find((s) => s.status === 'succeeded')?.n ?? 0;
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
        departmentId: a.departmentId,
        tools: a.tools,
        autonomy: a.autonomy,
        enabled: a.enabled,
        robot: normalizeRobot(a.robot),
        monthlyBudgetUsd: Number(a.monthlyBudgetUsd),
        maxStepsPerRun: a.maxStepsPerRun,
        model: a.model,
        status: !a.enabled ? 'disabled' : mine.some((r) => r.status === 'awaiting_approval') ? 'awaiting_approval' : mine.some((r) => r.status === 'running') ? 'running' : mine.length ? 'queued' : 'idle',
        currentRun: visibleRun ? { id: visibleRun.id, instruction: visibleRun.instruction, status: visibleRun.status } : null,
        openAssignedTasks: assigned.find((x) => x.agentId === a.id)?.n ?? 0,
        last30d: { finished, succeeded: ok, successRate: finished ? Math.round((ok / finished) * 100) : null },
        canManage: this.canManage(ctx, a),
      };
    });
  }

  async get(ctx: OrgContext, id: string) {
    const all = await this.list(ctx);
    const a = all.find((x) => x.id === id);
    if (!a) throw Errors.notFound('Agent');
    const [row] = await getDb().select({ systemPrompt: S.agents.systemPrompt }).from(S.agents).where(eq(S.agents.id, id));
    const spent = await monthSpendUsd(ctx.orgId, id);
    return { ...a, systemPrompt: a.canManage ? row.systemPrompt : undefined, spentThisMonthUsd: spent };
  }

  private validateTools(tools: string[]) {
    const bad = tools.filter((t) => !TOOL_BY_NAME[t]);
    if (bad.length) throw Errors.validation({ tools: [`Unknown tools: ${bad.join(', ')}`] });
  }

  async create(ctx: OrgContext, input: z.infer<typeof createAgentSchema>) {
    if (input.departmentId) ctx.assertAdminDept(input.departmentId);
    else ctx.assertCompanyAdmin();
    this.validateTools(input.tools);
    const db = getDb();
    if (input.departmentId) {
      const [d] = await db.select().from(S.departments).where(and(eq(S.departments.orgId, ctx.orgId), eq(S.departments.id, input.departmentId)));
      if (!d) throw Errors.notFound('Department');
    }
    // Autonomous mode is a company-level trust decision.
    if (input.autonomy === 'autonomous') ctx.assertCompanyAdmin();
    const [a] = await db
      .insert(S.agents)
      .values({
        orgId: ctx.orgId,
        departmentId: input.departmentId ?? null,
        name: input.name,
        role: input.role,
        description: input.description,
        tools: input.tools,
        autonomy: input.autonomy,
        model: input.model,
        monthlyBudgetUsd: String(input.monthlyBudgetUsd ?? (await this.orgDefaultBudget(ctx.orgId))),
        maxStepsPerRun: input.maxStepsPerRun,
        robot: input.robot ?? {},
        systemPrompt: input.systemPrompt,
      })
      .returning();
    await this.audit.log(ctx, 'agent.create', { type: 'agent', id: a.id }, { name: a.name, tools: a.tools });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'agents' });
    return a;
  }

  async update(ctx: OrgContext, id: string, input: z.infer<typeof updateAgentSchema>) {
    const db = getDb();
    const [a] = await db.select().from(S.agents).where(and(eq(S.agents.orgId, ctx.orgId), eq(S.agents.id, id)));
    if (!a) throw Errors.notFound('Agent');
    if (!this.canManage(ctx, a)) throw Errors.forbidden('You cannot manage this agent');
    if (input.departmentId !== undefined && input.departmentId !== a.departmentId) ctx.assertCompanyAdmin();
    if (input.autonomy === 'autonomous' && a.autonomy !== 'autonomous') ctx.assertCompanyAdmin();
    if (input.tools) this.validateTools(input.tools);
    const patch: Record<string, unknown> = { ...input };
    if (input.monthlyBudgetUsd !== undefined) patch.monthlyBudgetUsd = String(input.monthlyBudgetUsd);
    await db.update(S.agents).set(patch).where(eq(S.agents.id, id));
    await this.audit.log(ctx, 'agent.update', { type: 'agent', id }, { fields: Object.keys(input) });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'agents' });
    return { ok: true };
  }

  /* ------------------------------------------------------------ runs */

  async createRun(ctx: OrgContext, agentId: string, input: z.infer<typeof createAgentRunSchema>) {
    const db = getDb();
    const [a] = await db.select().from(S.agents).where(and(eq(S.agents.orgId, ctx.orgId), eq(S.agents.id, agentId)));
    if (!a) throw Errors.notFound('Agent');
    if (!a.enabled) throw Errors.conflict('This agent is disabled');
    if (!this.canRun(ctx, a, input.departmentId)) throw Errors.forbidden('You cannot run this agent in that department');

    if (input.idempotencyKey) {
      const [dup] = await db.select().from(S.agentRuns).where(and(eq(S.agentRuns.orgId, ctx.orgId), eq(S.agentRuns.idempotencyKey, input.idempotencyKey)));
      if (dup) return dup;
    }
    // Referenced records must belong to the run's department context.
    if (input.taskId) {
      const [t] = await db.select().from(S.tasks).where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.id, input.taskId)));
      if (!t || t.departmentId !== input.departmentId) throw Errors.validation({ taskId: ['Task must belong to the run department'] });
    }
    if (input.requestId) {
      const [r] = await db.select().from(S.requests).where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, input.requestId)));
      if (!r || (r.toDepartmentId !== input.departmentId && r.fromDepartmentId !== input.departmentId)) throw Errors.validation({ requestId: ['Request must involve the run department'] });
    }
    if (input.fileIds?.length) {
      const fs = await db
        .select({ id: S.files.id })
        .from(S.files)
        .where(and(eq(S.files.orgId, ctx.orgId), inArray(S.files.id, input.fileIds), isNull(S.files.deletedAt), or(eq(S.files.departmentId, input.departmentId), and(isNull(S.files.departmentId), isNull(S.files.requestId)))));
      if (fs.length !== new Set(input.fileIds).size) throw Errors.validation({ fileIds: ['Files must be accessible to the run department'] });
    }
    if (input.workflow === 'llm') {
      const spent = await monthSpendUsd(ctx.orgId, a.id);
      if (spent >= Number(a.monthlyBudgetUsd)) throw Errors.conflict(`This agent has used its monthly budget ($${a.monthlyBudgetUsd})`);
    }
    const [run] = await db
      .insert(S.agentRuns)
      .values({
        orgId: ctx.orgId,
        agentId: a.id,
        departmentId: input.departmentId,
        requestedByMemberId: ctx.memberId,
        instruction: input.instruction,
        taskId: input.taskId ?? null,
        requestId: input.requestId ?? null,
        fileIds: input.fileIds ?? [],
        idempotencyKey: input.idempotencyKey,
        provider: input.workflow === 'llm' ? null : `builtin:${input.workflow}`,
      })
      .returning();
    await this.audit.log(ctx, 'agent.run.create', { type: 'agent_run', id: run.id }, { agentId: a.id, workflow: input.workflow });
    try {
      await enqueueRun(run.id);
    } catch (e) {
      await db.update(S.agentRuns).set({ status: 'failed', error: 'Could not reach the execution queue', finishedAt: new Date() }).where(eq(S.agentRuns.id, run.id));
      throw e;
    }
    publish({ type: 'agent_run.changed', orgId: ctx.orgId, deptId: run.departmentId, runId: run.id, agentId: a.id, status: 'queued' });
    return run;
  }

  async listRuns(ctx: OrgContext, agentId?: string, departmentId?: string) {
    const readable = ctx.readableDeptIds();
    const rows = await getDb()
      .select({ r: S.agentRuns, agentName: S.agents.name, requestedBy: S.users.name })
      .from(S.agentRuns)
      .innerJoin(S.agents, eq(S.agents.id, S.agentRuns.agentId))
      .innerJoin(S.orgMembers, eq(S.orgMembers.id, S.agentRuns.requestedByMemberId))
      .innerJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(
        and(
          eq(S.agentRuns.orgId, ctx.orgId),
          agentId ? eq(S.agentRuns.agentId, agentId) : undefined,
          departmentId ? eq(S.agentRuns.departmentId, departmentId) : undefined,
          readable ? (readable.length ? inArray(S.agentRuns.departmentId, readable) : sql`false`) : undefined,
        ),
      )
      .orderBy(desc(S.agentRuns.createdAt))
      .limit(100);
    return rows.map(({ r, agentName, requestedBy }) => {
      const { transcript, ...rest } = r;
      return { ...rest, costUsd: Number(r.costUsd), agentName, requestedBy };
    });
  }

  private async loadRun(ctx: OrgContext, runId: string) {
    const [r] = await getDb().select().from(S.agentRuns).where(and(eq(S.agentRuns.orgId, ctx.orgId), eq(S.agentRuns.id, runId)));
    if (!r) throw Errors.notFound('Run');
    ctx.assertReadDept(r.departmentId, 'Run');
    return r;
  }

  async getRun(ctx: OrgContext, runId: string) {
    const r = await this.loadRun(ctx, runId);
    const db = getDb();
    const steps = await db.select().from(S.agentRunSteps).where(eq(S.agentRunSteps.runId, runId)).orderBy(asc(S.agentRunSteps.seq));
    const approvals = await db.select().from(S.agentApprovals).where(eq(S.agentApprovals.runId, runId)).orderBy(asc(S.agentApprovals.createdAt));
    const [agent] = await db.select({ name: S.agents.name, role: S.agents.role, robot: S.agents.robot }).from(S.agents).where(eq(S.agents.id, r.agentId));
    const { transcript, ...rest } = r;
    return {
      ...rest,
      costUsd: Number(r.costUsd),
      agent: { ...agent, robot: normalizeRobot(agent.robot) },
      stepLog: steps.map((s) => ({ ...s, content: { ...(s.content as object), block: undefined } })),
      approvals,
      canCancel: ['queued', 'running', 'awaiting_approval'].includes(r.status) && (r.requestedByMemberId === ctx.memberId || ctx.canAdminDept(r.departmentId)),
      canDecide: ctx.canAdminDept(r.departmentId),
    };
  }

  async cancelRun(ctx: OrgContext, runId: string) {
    const r = await this.loadRun(ctx, runId);
    if (!(r.requestedByMemberId === ctx.memberId || ctx.canAdminDept(r.departmentId))) throw Errors.forbidden();
    const db = getDb();
    // Queued or paused runs are cancelled immediately; running runs stop at the next step boundary.
    const [now] = await db
      .update(S.agentRuns)
      .set({ status: 'cancelled', cancelRequested: true, finishedAt: new Date(), error: 'Cancelled by a user' })
      .where(and(eq(S.agentRuns.id, runId), inArray(S.agentRuns.status, ['queued', 'awaiting_approval'])))
      .returning();
    if (!now) {
      await db.update(S.agentRuns).set({ cancelRequested: true }).where(and(eq(S.agentRuns.id, runId), eq(S.agentRuns.status, 'running')));
    } else {
      await db.update(S.agentApprovals).set({ status: 'expired' }).where(and(eq(S.agentApprovals.runId, runId), eq(S.agentApprovals.status, 'pending')));
    }
    await this.audit.log(ctx, 'agent.run.cancel', { type: 'agent_run', id: runId });
    publish({ type: 'agent_run.changed', orgId: ctx.orgId, deptId: r.departmentId, runId, agentId: r.agentId, status: now ? 'cancelled' : 'running' });
    return { ok: true };
  }

  async pendingApprovals(ctx: OrgContext) {
    const readable = ctx.readableDeptIds();
    const rows = await getDb()
      .select({ a: S.agentApprovals, run: S.agentRuns, agentName: S.agents.name })
      .from(S.agentApprovals)
      .innerJoin(S.agentRuns, eq(S.agentRuns.id, S.agentApprovals.runId))
      .innerJoin(S.agents, eq(S.agents.id, S.agentRuns.agentId))
      .where(and(eq(S.agentApprovals.orgId, ctx.orgId), eq(S.agentApprovals.status, 'pending'), readable ? (readable.length ? inArray(S.agentRuns.departmentId, readable) : sql`false`) : undefined))
      .orderBy(desc(S.agentApprovals.createdAt));
    return rows.map((x) => ({
      ...x.a,
      agentName: x.agentName,
      runInstruction: x.run.instruction,
      departmentId: x.run.departmentId,
      risk: TOOL_BY_NAME[x.a.toolName]?.risk,
      toolLabel: TOOL_BY_NAME[x.a.toolName]?.label ?? x.a.toolName,
      canDecide: ctx.canAdminDept(x.run.departmentId),
    }));
  }

  async decide(ctx: OrgContext, approvalId: string, input: z.infer<typeof decideApprovalSchema>) {
    const db = getDb();
    const [a] = await db.select().from(S.agentApprovals).where(and(eq(S.agentApprovals.orgId, ctx.orgId), eq(S.agentApprovals.id, approvalId)));
    if (!a) throw Errors.notFound('Approval');
    const run = await this.loadRun(ctx, a.runId);
    ctx.assertAdminDept(run.departmentId, 'Only department admins can approve agent actions');
    const res = await db.transaction(async (tx) => {
      const [upd] = await tx
        .update(S.agentApprovals)
        .set({ status: input.decision === 'approve' ? 'approved' : 'denied', decidedByMemberId: ctx.memberId, decidedAt: new Date(), note: input.note })
        .where(and(eq(S.agentApprovals.id, approvalId), eq(S.agentApprovals.status, 'pending')))
        .returning();
      if (!upd) throw Errors.conflict('This approval was already decided');
      const [resumed] = await tx
        .update(S.agentRuns)
        .set({ status: 'queued' })
        .where(and(eq(S.agentRuns.id, a.runId), eq(S.agentRuns.status, 'awaiting_approval')))
        .returning();
      await this.audit.log(ctx, 'agent.approval.decide', { type: 'agent_approval', id: approvalId }, { decision: input.decision, tool: a.toolName }, tx);
      return { resumed };
    });
    if (res.resumed) await enqueueRun(a.runId, `resume-${approvalId}`);
    publish({ type: 'agent_run.changed', orgId: ctx.orgId, deptId: run.departmentId, runId: run.id, agentId: run.agentId, status: 'queued' });
    return { ok: true };
  }

  /* ------------------------------------------------------------ integrations */

  /** Company-wide default monthly budget for new agents (Settings → AI & integrations). */
  private async orgDefaultBudget(orgId: string) {
    const [o] = await getDb().select({ s: S.organizations.settings }).from(S.organizations).where(eq(S.organizations.id, orgId));
    const v = (o?.s as { defaultAgentMonthlyBudgetUsd?: number } | null)?.defaultAgentMonthlyBudgetUsd;
    return typeof v === 'number' && v >= 0 ? v : 25;
  }

  async getGithub(ctx: OrgContext) {
    ctx.assertCompanyAdmin();
    const [i] = await getDb().select().from(S.integrations).where(and(eq(S.integrations.orgId, ctx.orgId), eq(S.integrations.kind, 'github')));
    return { enabled: i?.enabled ?? false, allowedRepos: i?.config.allowedRepos ?? [], hasToken: !!i?.secretEncrypted, updatedAt: i?.updatedAt ?? null };
  }

  async setGithub(ctx: OrgContext, input: z.infer<typeof githubIntegrationSchema>) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    const values = {
      orgId: ctx.orgId,
      kind: 'github',
      enabled: input.enabled,
      config: { allowedRepos: input.allowedRepos },
      ...(input.token ? { secretEncrypted: encryptSecret(input.token) } : {}),
      updatedAt: new Date(),
    };
    await db
      .insert(S.integrations)
      .values(values)
      .onConflictDoUpdate({ target: [S.integrations.orgId, S.integrations.kind], set: values });
    await this.audit.log(ctx, 'integration.update', { type: 'integration' }, { kind: 'github', enabled: input.enabled, repos: input.allowedRepos.length, tokenChanged: !!input.token });
    return this.getGithub(ctx);
  }
}
