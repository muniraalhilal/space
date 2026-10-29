import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, SQL } from 'drizzle-orm';
import { createTaskSchema, updateTaskSchema, taskQuerySchema, TASK_STATUS_LABEL, type TaskStatus } from '@space/shared';
import type { z } from 'zod';
import { DbOrTx, getDb, schema } from '../db/client';
import { OrgContext } from '../common/context';
import { Errors } from '../common/errors';
import { AuditService } from '../common/audit.service';
import { recordActivity } from '../common/activity';
import { NotificationsService } from '../notifications/notifications.service';
import { publish } from '../realtime/bus';

const S = schema;
type Assignee = { kind: 'member' | 'agent'; id: string } | null | undefined;

@Injectable()
export class TasksService {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ---------------------------------------------------------------- queries */

  async list(ctx: OrgContext, q: z.infer<typeof taskQuerySchema>) {
    const conds: (SQL | undefined)[] = [eq(S.tasks.orgId, ctx.orgId)];
    const readable = ctx.readableDeptIds();
    if (readable) conds.push(readable.length ? inArray(S.tasks.departmentId, readable) : sql`false`);
    if (q.projectId) conds.push(eq(S.tasks.projectId, q.projectId));
    if (q.departmentId) conds.push(eq(S.tasks.departmentId, q.departmentId));
    if (q.assignee === 'me') conds.push(or(eq(S.tasks.assigneeMemberId, ctx.memberId), sql`exists (select 1 from task_collaborators tc where tc.task_id = ${S.tasks.id} and tc.member_id = ${ctx.memberId})`));
    else if (q.assignee) conds.push(or(eq(S.tasks.assigneeMemberId, q.assignee), eq(S.tasks.assigneeAgentId, q.assignee)));
    if (q.status) conds.push(eq(S.tasks.status, q.status));
    if (q.priority) conds.push(eq(S.tasks.priority, q.priority));
    if (q.q) conds.push(sql`${S.tasks.title} ILIKE ${'%' + q.q.replace(/[%_\\]/g, (m) => '\\' + m) + '%'}`);
    if (q.dueFrom) conds.push(gte(S.tasks.dueDate, q.dueFrom.slice(0, 10)));
    if (q.dueTo) conds.push(lte(S.tasks.dueDate, q.dueTo.slice(0, 10)));
    if (q.parentId === 'root') conds.push(isNull(S.tasks.parentId));
    else if (q.parentId) conds.push(eq(S.tasks.parentId, q.parentId));

    const rows = await getDb()
      .select({
        t: S.tasks,
        projectName: S.projects.name,
        projectColor: S.projects.color,
        subtaskCount: sql<number>`(select count(*)::int from tasks st where st.parent_id = ${S.tasks.id})`,
        subtaskDone: sql<number>`(select count(*)::int from tasks st where st.parent_id = ${S.tasks.id} and st.status = 'done')`,
        commentCount: sql<number>`(select count(*)::int from comments c where c.task_id = ${S.tasks.id})`,
      })
      .from(S.tasks)
      .innerJoin(S.projects, eq(S.projects.id, S.tasks.projectId))
      .where(and(...conds))
      .orderBy(asc(S.tasks.sortOrder), desc(S.tasks.createdAt))
      .limit(q.limit);
    return rows.map((r) => ({ ...r.t, projectName: r.projectName, projectColor: r.projectColor, subtaskCount: r.subtaskCount, subtaskDone: r.subtaskDone, commentCount: r.commentCount }));
  }

  private async load(tx: DbOrTx, ctx: OrgContext, id: string) {
    const [t] = await tx.select().from(S.tasks).where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.id, id)));
    if (!t) throw Errors.notFound('Task');
    ctx.assertReadDept(t.departmentId, 'Task');
    return t;
  }

  async get(ctx: OrgContext, id: string) {
    const db = getDb();
    const t = await this.load(db, ctx, id);
    const [project] = await db.select().from(S.projects).where(eq(S.projects.id, t.projectId));
    const subtasks = await db.select().from(S.tasks).where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.parentId, id))).orderBy(asc(S.tasks.sortOrder), asc(S.tasks.createdAt));
    const deps = await db
      .select({ id: S.tasks.id, title: S.tasks.title, status: S.tasks.status })
      .from(S.taskDependencies)
      .innerJoin(S.tasks, eq(S.tasks.id, S.taskDependencies.dependsOnId))
      .where(and(eq(S.taskDependencies.orgId, ctx.orgId), eq(S.taskDependencies.taskId, id)));
    const blocking = await db
      .select({ id: S.tasks.id, title: S.tasks.title, status: S.tasks.status })
      .from(S.taskDependencies)
      .innerJoin(S.tasks, eq(S.tasks.id, S.taskDependencies.taskId))
      .where(and(eq(S.taskDependencies.orgId, ctx.orgId), eq(S.taskDependencies.dependsOnId, id)));
    const collaborators = await db
      .select({ memberId: S.taskCollaborators.memberId })
      .from(S.taskCollaborators)
      .where(and(eq(S.taskCollaborators.orgId, ctx.orgId), eq(S.taskCollaborators.taskId, id)));
    const comments = await this.listComments(ctx, id);
    const activity = await db
      .select()
      .from(S.activities)
      .where(and(eq(S.activities.orgId, ctx.orgId), eq(S.activities.entityType, 'task'), eq(S.activities.entityId, id)))
      .orderBy(desc(S.activities.createdAt))
      .limit(50);
    const files = await db
      .select({ id: S.files.id, name: S.files.name, mime: S.files.mime, size: S.files.size, createdAt: S.files.createdAt })
      .from(S.files)
      .where(and(eq(S.files.orgId, ctx.orgId), eq(S.files.taskId, id), isNull(S.files.deletedAt)));
    let request = null;
    if (t.requestId) {
      const [r] = await db
        .select({ id: S.requests.id, number: S.requests.number, title: S.requests.title, state: S.requests.state })
        .from(S.requests)
        .where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, t.requestId)));
      request = r ?? null;
    }
    const parent = t.parentId ? (await db.select({ id: S.tasks.id, title: S.tasks.title }).from(S.tasks).where(eq(S.tasks.id, t.parentId)))[0] ?? null : null;
    return {
      ...t,
      project: { id: project.id, name: project.name, color: project.color },
      parent,
      subtasks,
      dependencies: deps,
      blocking,
      collaboratorIds: collaborators.map((c) => c.memberId),
      comments,
      activity,
      files,
      request,
      canWrite: ctx.canWriteDept(t.departmentId),
      canAdmin: ctx.canAdminDept(t.departmentId),
    };
  }

  /* ---------------------------------------------------------------- validation helpers */

  private async validateAssignee(tx: DbOrTx, ctx: OrgContext, deptId: string, a: Assignee) {
    if (!a) return { assigneeMemberId: null, assigneeAgentId: null };
    if (a.kind === 'member') {
      const [m] = await tx
        .select({ id: S.departmentMembers.memberId })
        .from(S.departmentMembers)
        .innerJoin(S.orgMembers, eq(S.orgMembers.id, S.departmentMembers.memberId))
        .where(and(eq(S.departmentMembers.orgId, ctx.orgId), eq(S.departmentMembers.departmentId, deptId), eq(S.departmentMembers.memberId, a.id), isNull(S.orgMembers.deactivatedAt)));
      if (!m) throw Errors.validation({ assignee: ['Assignee must be a member of this department'] });
      return { assigneeMemberId: a.id, assigneeAgentId: null };
    }
    const [ag] = await tx
      .select()
      .from(S.agents)
      .where(and(eq(S.agents.orgId, ctx.orgId), eq(S.agents.id, a.id), eq(S.agents.enabled, true), or(eq(S.agents.departmentId, deptId), isNull(S.agents.departmentId))));
    if (!ag) throw Errors.validation({ assignee: ['This AI agent is not available to this department'] });
    return { assigneeMemberId: null, assigneeAgentId: a.id };
  }

  private async validateCollaborators(tx: DbOrTx, ctx: OrgContext, deptId: string, ids: string[]) {
    if (!ids.length) return;
    const rows = await tx
      .select({ id: S.departmentMembers.memberId })
      .from(S.departmentMembers)
      .where(and(eq(S.departmentMembers.orgId, ctx.orgId), eq(S.departmentMembers.departmentId, deptId), inArray(S.departmentMembers.memberId, ids)));
    if (rows.length !== new Set(ids).size) throw Errors.validation({ collaboratorIds: ['Collaborators must be members of this department'] });
  }

  /* ---------------------------------------------------------------- mutations */

  async create(ctx: OrgContext, input: z.infer<typeof createTaskSchema>) {
    const db = getDb();
    const res = await db.transaction(async (tx) => {
      const [project] = await tx.select().from(S.projects).where(and(eq(S.projects.orgId, ctx.orgId), eq(S.projects.id, input.projectId)));
      if (!project) throw Errors.notFound('Project');
      ctx.assertReadDept(project.departmentId, 'Project');
      ctx.assertWriteDept(project.departmentId);
      if (input.parentId) {
        const [parent] = await tx.select().from(S.tasks).where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.id, input.parentId)));
        if (!parent || parent.projectId !== project.id) throw Errors.validation({ parentId: ['Parent task must be in the same project'] });
        if (parent.parentId) throw Errors.validation({ parentId: ['Subtasks cannot be nested more than one level'] });
      }
      if (input.requestId) {
        const [r] = await tx.select().from(S.requests).where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, input.requestId)));
        if (!r || r.toDepartmentId !== project.departmentId) throw Errors.validation({ requestId: ['Only the receiving department can plan work for a request'] });
        if (!['accepted', 'in_progress', 'changes_requested'].includes(r.state)) throw Errors.validation({ requestId: ['Accept the request before planning tasks for it'] });
        ctx.assertAdminDept(project.departmentId, 'Only department admins can divide a request into tasks');
      }
      const assignee = await this.validateAssignee(tx, ctx, project.departmentId, input.assignee);
      await this.validateCollaborators(tx, ctx, project.departmentId, input.collaboratorIds ?? []);
      const [{ maxSort }] = await tx.select({ maxSort: sql<number>`coalesce(max(${S.tasks.sortOrder}), 0)` }).from(S.tasks).where(eq(S.tasks.projectId, project.id));
      const [t] = await tx
        .insert(S.tasks)
        .values({
          orgId: ctx.orgId,
          projectId: project.id,
          departmentId: project.departmentId,
          parentId: input.parentId ?? null,
          requestId: input.requestId ?? null,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          dueDate: input.dueDate?.slice(0, 10) ?? null,
          startDate: input.startDate?.slice(0, 10) ?? null,
          labels: input.labels ?? [],
          sortOrder: Number(maxSort) + 1,
          createdByMemberId: ctx.memberId,
          completedAt: input.status === 'done' ? new Date() : null,
          ...assignee,
        })
        .returning();
      if (input.collaboratorIds?.length) {
        await tx.insert(S.taskCollaborators).values([...new Set(input.collaboratorIds)].map((memberId) => ({ orgId: ctx.orgId, taskId: t.id, memberId })));
      }
      await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: t.id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'created', data: { title: t.title } });
      if (t.requestId) await this.syncRequestProgress(tx, ctx, t.requestId);
      await this.audit.log(ctx, 'task.create', { type: 'task', id: t.id }, { projectId: t.projectId }, tx);
      const notify = await this.notifications.create(
        tx,
        ctx.orgId,
        [assignee.assigneeMemberId, ...(input.collaboratorIds ?? [])].filter(Boolean) as string[],
        { kind: 'task_assigned', title: `New task: ${t.title}`, body: project.name, entityType: 'task', entityId: t.id },
        ctx.memberId,
      );
      return { t, notify };
    });
    res.notify();
    this.emit(ctx, res.t);
    return res.t;
  }

  async update(ctx: OrgContext, id: string, input: z.infer<typeof updateTaskSchema>) {
    const db = getDb();
    const res = await db.transaction(async (tx) => {
      const cur = await this.load(tx, ctx, id);
      ctx.assertWriteDept(cur.departmentId);
      if (cur.version !== input.version) throw Errors.version();

      const patch: Partial<typeof S.tasks.$inferInsert> = { updatedAt: new Date(), version: cur.version + 1 };
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const set = <K extends keyof typeof patch>(k: K, v: (typeof patch)[K], from: unknown) => {
        if (v !== undefined && v !== from) {
          patch[k] = v;
          changes[k as string] = { from, to: v };
        }
      };
      set('title', input.title, cur.title);
      set('description', input.description, cur.description);
      set('priority', input.priority, cur.priority);
      set('progress', input.progress, cur.progress);
      set('sortOrder', input.sortOrder, cur.sortOrder);
      if (input.labels) patch.labels = input.labels;
      if (input.dueDate !== undefined) set('dueDate', input.dueDate?.slice(0, 10) ?? null, cur.dueDate);
      if (input.startDate !== undefined) set('startDate', input.startDate?.slice(0, 10) ?? null, cur.startDate);

      if (input.status && input.status !== cur.status) {
        if (input.status === 'done') {
          const open = await tx
            .select({ title: S.tasks.title })
            .from(S.taskDependencies)
            .innerJoin(S.tasks, eq(S.tasks.id, S.taskDependencies.dependsOnId))
            .where(and(eq(S.taskDependencies.taskId, id), sql`${S.tasks.status} <> 'done'`));
          if (open.length) throw Errors.validation({ status: [`Blocked by unfinished dependency: ${open.map((o) => o.title).join(', ')}`] });
          patch.completedAt = new Date();
          patch.progress = 100;
        } else if (cur.status === 'done') {
          patch.completedAt = null;
        }
        set('status', input.status, cur.status);
      }

      let newAssigneeMember: string | null = null;
      if (input.assignee !== undefined) {
        const a = await this.validateAssignee(tx, ctx, cur.departmentId, input.assignee);
        if (a.assigneeMemberId !== cur.assigneeMemberId || a.assigneeAgentId !== cur.assigneeAgentId) {
          Object.assign(patch, a);
          changes.assignee = { from: cur.assigneeMemberId ?? cur.assigneeAgentId, to: a.assigneeMemberId ?? a.assigneeAgentId };
          newAssigneeMember = a.assigneeMemberId;
        }
      }
      if (input.collaboratorIds) {
        await this.validateCollaborators(tx, ctx, cur.departmentId, input.collaboratorIds);
        await tx.delete(S.taskCollaborators).where(eq(S.taskCollaborators.taskId, id));
        if (input.collaboratorIds.length) {
          await tx.insert(S.taskCollaborators).values([...new Set(input.collaboratorIds)].map((memberId) => ({ orgId: ctx.orgId, taskId: id, memberId })));
        }
      }

      // Optimistic concurrency: the version guard in the WHERE clause makes concurrent writers fail cleanly.
      const [t] = await tx
        .update(S.tasks)
        .set(patch)
        .where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.id, id), eq(S.tasks.version, input.version)))
        .returning();
      if (!t) throw Errors.version();

      if (changes.status) {
        await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'status_changed', data: changes.status });
      }
      if (changes.assignee) {
        await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'assigned', data: changes.assignee });
      }
      const other = Object.keys(changes).filter((k) => !['status', 'assignee', 'sortOrder', 'progress'].includes(k));
      if (other.length) {
        await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'updated', data: { fields: other } });
      }
      if (t.requestId && changes.status) await this.syncRequestProgress(tx, ctx, t.requestId);
      await this.audit.log(ctx, 'task.update', { type: 'task', id }, { fields: Object.keys(changes) }, tx);

      const notifiers: Array<() => void> = [];
      if (newAssigneeMember) {
        notifiers.push(await this.notifications.create(tx, ctx.orgId, [newAssigneeMember], { kind: 'task_assigned', title: `Assigned to you: ${t.title}`, entityType: 'task', entityId: id }, ctx.memberId));
      }
      if (changes.status) {
        const watchers = await this.watchers(tx, t);
        notifiers.push(
          await this.notifications.create(
            tx,
            ctx.orgId,
            watchers,
            { kind: 'task_updated', title: `${t.title} → ${TASK_STATUS_LABEL[t.status as TaskStatus]}`, entityType: 'task', entityId: id },
            ctx.memberId,
          ),
        );
      }
      return { t, notifiers };
    });
    res.notifiers.forEach((n) => n());
    this.emit(ctx, res.t);
    return res.t;
  }

  async remove(ctx: OrgContext, id: string) {
    const db = getDb();
    const t = await db.transaction(async (tx) => {
      const t = await this.load(tx, ctx, id);
      if (!(ctx.canAdminDept(t.departmentId) || (t.createdByMemberId === ctx.memberId && ctx.canWriteDept(t.departmentId)))) {
        throw Errors.forbidden('Only the creator or a department admin can delete this task');
      }
      await tx.delete(S.tasks).where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.id, id)));
      if (t.requestId) await this.syncRequestProgress(tx, ctx, t.requestId);
      await this.audit.log(ctx, 'task.delete', { type: 'task', id }, { title: t.title }, tx);
      return t;
    });
    this.emit(ctx, t);
    return { ok: true };
  }

  async addDependency(ctx: OrgContext, id: string, dependsOnId: string) {
    const db = getDb();
    const t = await db.transaction(async (tx) => {
      const t = await this.load(tx, ctx, id);
      ctx.assertWriteDept(t.departmentId);
      const dep = await this.load(tx, ctx, dependsOnId);
      if (dep.departmentId !== t.departmentId) throw Errors.validation({ dependsOnId: ['Dependencies must be within the same department'] });
      if (dep.id === t.id) throw Errors.validation({ dependsOnId: ['A task cannot depend on itself'] });
      // Reject cycles: does `dependsOnId` (transitively) depend on `id`?
      const cyc = await tx.execute(sql`
        with recursive chain(id) as (
          select depends_on_id from task_dependencies where task_id = ${dependsOnId}
          union
          select td.depends_on_id from task_dependencies td join chain c on td.task_id = c.id
        ) select 1 from chain where id = ${id} limit 1`);
      if (cyc.rows.length) throw Errors.validation({ dependsOnId: ['That would create a circular dependency'] });
      await tx.insert(S.taskDependencies).values({ orgId: ctx.orgId, taskId: id, dependsOnId }).onConflictDoNothing();
      await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'dependency_added', data: { dependsOnId, title: dep.title } });
      return t;
    });
    this.emit(ctx, t);
    return { ok: true };
  }

  async removeDependency(ctx: OrgContext, id: string, dependsOnId: string) {
    const db = getDb();
    const t = await this.load(db, ctx, id);
    ctx.assertWriteDept(t.departmentId);
    await db.delete(S.taskDependencies).where(and(eq(S.taskDependencies.orgId, ctx.orgId), eq(S.taskDependencies.taskId, id), eq(S.taskDependencies.dependsOnId, dependsOnId)));
    this.emit(ctx, t);
    return { ok: true };
  }

  /* ---------------------------------------------------------------- comments */

  async listComments(ctx: OrgContext, taskId: string) {
    return getDb()
      .select({
        id: S.comments.id,
        body: S.comments.body,
        createdAt: S.comments.createdAt,
        authorMemberId: S.comments.authorMemberId,
        authorAgentId: S.comments.authorAgentId,
        agentRunId: S.comments.agentRunId,
        authorName: sql<string>`coalesce(${S.users.name}, ${S.agents.name})`,
      })
      .from(S.comments)
      .leftJoin(S.orgMembers, eq(S.orgMembers.id, S.comments.authorMemberId))
      .leftJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .leftJoin(S.agents, eq(S.agents.id, S.comments.authorAgentId))
      .where(and(eq(S.comments.orgId, ctx.orgId), eq(S.comments.taskId, taskId)))
      .orderBy(asc(S.comments.createdAt));
  }

  async addComment(ctx: OrgContext, taskId: string, body: string) {
    // Viewers may read but not comment.
    ctx.assertNotViewer();
    const db = getDb();
    const res = await db.transaction(async (tx) => {
      const t = await this.load(tx, ctx, taskId);
      const [c] = await tx.insert(S.comments).values({ orgId: ctx.orgId, taskId, authorMemberId: ctx.memberId, body }).returning();
      await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: taskId, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'commented' });
      const notify = await this.notifications.create(tx, ctx.orgId, await this.watchers(tx, t), { kind: 'task_comment', title: `New comment on ${t.title}`, body: body.slice(0, 140), entityType: 'task', entityId: taskId }, ctx.memberId);
      return { c, t, notify };
    });
    res.notify();
    this.emit(ctx, res.t);
    return res.c;
  }

  /* ---------------------------------------------------------------- helpers */

  private async watchers(tx: DbOrTx, t: typeof S.tasks.$inferSelect) {
    const collab = await tx.select({ m: S.taskCollaborators.memberId }).from(S.taskCollaborators).where(eq(S.taskCollaborators.taskId, t.id));
    return [t.assigneeMemberId, t.createdByMemberId, ...collab.map((c) => c.m)].filter(Boolean) as string[];
  }

  /**
   * Keep a request "in progress" once the receiving side starts working on its tasks.
   * This never completes or approves a request — that remains an explicit requester decision.
   */
  private async syncRequestProgress(tx: DbOrTx, ctx: OrgContext, requestId: string) {
    const [r] = await tx.select().from(S.requests).where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, requestId)));
    if (r) publish({ type: 'request.changed', orgId: ctx.orgId, deptIds: [r.fromDepartmentId, r.toDepartmentId], requestId });
  }

  private emit(ctx: OrgContext, t: { id: string; departmentId: string; projectId: string }) {
    publish({ type: 'task.changed', orgId: ctx.orgId, deptId: t.departmentId, taskId: t.id, projectId: t.projectId });
  }
}
