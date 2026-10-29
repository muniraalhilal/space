import { Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, desc, eq, inArray, isNull, or, sql, SQL } from 'drizzle-orm';
import {
  availableActions,
  evaluateTransition,
  createRequestSchema,
  transitionRequestSchema,
  REQUEST_STATE_LABEL,
  type RequestSide,
  type RequestState,
} from '@space/shared';
import type { z } from 'zod';
import { DbOrTx, getDb, schema } from '../db/client';
import { OrgContext } from '../common/context';
import { Errors } from '../common/errors';
import { AuditService } from '../common/audit.service';
import { recordActivity } from '../common/activity';
import { NotificationsService } from '../notifications/notifications.service';
import { publish } from '../realtime/bus';

const S = schema;
const fromDept = aliasedTable(S.departments, 'from_dept');
const toDept = aliasedTable(S.departments, 'to_dept');

@Injectable()
export class RequestsService {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private sides(ctx: OrgContext, r: { fromDepartmentId: string; toDepartmentId: string }): RequestSide[] {
    const s: RequestSide[] = [];
    if (ctx.canAdminDept(r.fromDepartmentId)) s.push('requester');
    if (ctx.canAdminDept(r.toDepartmentId)) s.push('receiver');
    return s;
  }

  private visible(ctx: OrgContext, r: { fromDepartmentId: string; toDepartmentId: string }) {
    return ctx.canReadDept(r.fromDepartmentId) || ctx.canReadDept(r.toDepartmentId);
  }

  async list(ctx: OrgContext, box: 'incoming' | 'outgoing' | 'all', state?: string, onlyId?: string) {
    const readable = ctx.readableDeptIds();
    const conds: (SQL | undefined)[] = [eq(S.requests.orgId, ctx.orgId)];
    if (readable) {
      if (!readable.length) return [];
      if (box === 'incoming') conds.push(inArray(S.requests.toDepartmentId, readable));
      else if (box === 'outgoing') conds.push(inArray(S.requests.fromDepartmentId, readable));
      else conds.push(or(inArray(S.requests.toDepartmentId, readable), inArray(S.requests.fromDepartmentId, readable)));
    }
    if (onlyId) conds.push(eq(S.requests.id, onlyId));
    if (state === 'open') conds.push(sql`${S.requests.state} not in ('completed','rejected','cancelled')`);
    else if (state === 'closed') conds.push(sql`${S.requests.state} in ('completed','rejected','cancelled')`);
    const rows = await getDb()
      .select({
        r: S.requests,
        fromName: fromDept.name,
        fromTheme: fromDept.theme,
        fromColor: fromDept.color,
        toName: toDept.name,
        toTheme: toDept.theme,
        toColor: toDept.color,
        creatorName: S.users.name,
        taskTotal: sql<number>`(select count(*)::int from tasks t where t.request_id = ${S.requests.id})`,
        taskDone: sql<number>`(select count(*)::int from tasks t where t.request_id = ${S.requests.id} and t.status = 'done')`,
      })
      .from(S.requests)
      .innerJoin(fromDept, eq(fromDept.id, S.requests.fromDepartmentId))
      .innerJoin(toDept, eq(toDept.id, S.requests.toDepartmentId))
      .innerJoin(S.orgMembers, eq(S.orgMembers.id, S.requests.createdByMemberId))
      .innerJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(and(...conds))
      .orderBy(desc(S.requests.updatedAt))
      .limit(200);
    return rows.map((x) => ({
      ...x.r,
      from: { id: x.r.fromDepartmentId, name: x.fromName, theme: x.fromTheme, color: x.fromColor },
      to: { id: x.r.toDepartmentId, name: x.toName, theme: x.toTheme, color: x.toColor },
      creatorName: x.creatorName,
      progress: { total: x.taskTotal, done: x.taskDone },
      actions: availableActions(x.r.state as RequestState, this.sides(ctx, x.r)),
    }));
  }

  private async load(tx: DbOrTx, ctx: OrgContext, id: string) {
    const [r] = await tx.select().from(S.requests).where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, id)));
    if (!r || !this.visible(ctx, r)) throw Errors.notFound('Request');
    return r;
  }

  async get(ctx: OrgContext, id: string) {
    const db = getDb();
    await this.load(db, ctx, id);
    const [r] = await this.list(ctx, 'all', undefined, id);
    if (!r) throw Errors.notFound('Request');
    const events = await db
      .select({ e: S.requestEvents, actorName: S.users.name })
      .from(S.requestEvents)
      .leftJoin(S.orgMembers, eq(S.orgMembers.id, S.requestEvents.actorMemberId))
      .leftJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(and(eq(S.requestEvents.orgId, ctx.orgId), eq(S.requestEvents.requestId, id)))
      .orderBy(asc(S.requestEvents.createdAt));
    const comments = await db
      .select({ id: S.comments.id, body: S.comments.body, createdAt: S.comments.createdAt, authorMemberId: S.comments.authorMemberId, authorName: S.users.name })
      .from(S.comments)
      .leftJoin(S.orgMembers, eq(S.orgMembers.id, S.comments.authorMemberId))
      .leftJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(and(eq(S.comments.orgId, ctx.orgId), eq(S.comments.requestId, id)))
      .orderBy(asc(S.comments.createdAt));
    const tasks = await db
      .select({
        id: S.tasks.id,
        title: S.tasks.title,
        status: S.tasks.status,
        priority: S.tasks.priority,
        progress: S.tasks.progress,
        dueDate: S.tasks.dueDate,
        assigneeMemberId: S.tasks.assigneeMemberId,
        assigneeAgentId: S.tasks.assigneeAgentId,
      })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.requestId, id)))
      .orderBy(asc(S.tasks.sortOrder));
    const files = await db
      .select({ id: S.files.id, name: S.files.name, mime: S.files.mime, size: S.files.size, createdAt: S.files.createdAt })
      .from(S.files)
      .where(and(eq(S.files.orgId, ctx.orgId), eq(S.files.requestId, id), isNull(S.files.deletedAt)));
    return {
      ...r,
      events: events.map((e) => ({ ...e.e, actorName: e.actorName })),
      comments,
      tasks,
      files,
      sides: this.sides(ctx, r),
      canComment: !ctx.isViewer,
      canPlan: ctx.canAdminDept(r.toDepartmentId),
    };
  }

  private async deptAdmins(tx: DbOrTx, orgId: string, deptId: string) {
    const rows = await tx
      .select({ m: S.departmentMembers.memberId })
      .from(S.departmentMembers)
      .where(and(eq(S.departmentMembers.orgId, orgId), eq(S.departmentMembers.departmentId, deptId), eq(S.departmentMembers.role, 'admin')));
    return rows.map((r) => r.m);
  }

  async create(ctx: OrgContext, input: z.infer<typeof createRequestSchema>) {
    if (input.fromDepartmentId === input.toDepartmentId) throw Errors.validation({ toDepartmentId: ['Choose a different department'] });
    ctx.assertAdminDept(input.fromDepartmentId, 'Only admins of the requesting department can send requests');
    const db = getDb();
    const res = await db.transaction(async (tx) => {
      const depts = await tx
        .select()
        .from(S.departments)
        .where(and(eq(S.departments.orgId, ctx.orgId), inArray(S.departments.id, [input.fromDepartmentId, input.toDepartmentId])));
      if (depts.length !== 2) throw Errors.notFound('Department');
      // Row-locking increment gives a gap-free per-company request number.
      const [{ seq }] = await tx
        .update(S.organizations)
        .set({ requestSeq: sql`${S.organizations.requestSeq} + 1` })
        .where(eq(S.organizations.id, ctx.orgId))
        .returning({ seq: S.organizations.requestSeq });
      const [r] = await tx
        .insert(S.requests)
        .values({
          orgId: ctx.orgId,
          number: seq,
          fromDepartmentId: input.fromDepartmentId,
          toDepartmentId: input.toDepartmentId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate?.slice(0, 10) ?? null,
          labels: input.labels ?? [],
          createdByMemberId: ctx.memberId,
        })
        .returning();
      await tx.insert(S.requestEvents).values({ orgId: ctx.orgId, requestId: r.id, actorMemberId: ctx.memberId, action: 'create', fromState: null, toState: 'submitted' });
      await recordActivity(tx, { orgId: ctx.orgId, entityType: 'request', entityId: r.id, departmentId: r.toDepartmentId, actorMemberId: ctx.memberId, verb: 'created' });
      await this.audit.log(ctx, 'request.create', { type: 'request', id: r.id }, { to: r.toDepartmentId }, tx);
      const fromName = depts.find((d) => d.id === r.fromDepartmentId)!.name;
      const notify = await this.notifications.create(
        tx,
        ctx.orgId,
        await this.deptAdmins(tx, ctx.orgId, r.toDepartmentId),
        { kind: 'request_received', title: `${fromName} sent a request: ${r.title}`, entityType: 'request', entityId: r.id },
        ctx.memberId,
      );
      return { r, notify };
    });
    res.notify();
    publish({ type: 'request.changed', orgId: ctx.orgId, deptIds: [res.r.fromDepartmentId, res.r.toDepartmentId], requestId: res.r.id });
    return res.r;
  }

  async transition(ctx: OrgContext, id: string, input: z.infer<typeof transitionRequestSchema>) {
    const db = getDb();
    const res = await db.transaction(async (tx) => {
      const r = await this.load(tx, ctx, id);
      if (r.version !== input.version) throw Errors.version();
      const verdict = evaluateTransition(r.state as RequestState, input.action, this.sides(ctx, r), input.note);
      if (!verdict.ok) {
        if (verdict.code === 'FORBIDDEN_SIDE') throw Errors.forbidden(verdict.message);
        if (verdict.code === 'NOTE_REQUIRED') throw Errors.validation({ note: [verdict.message] });
        throw Errors.transition(verdict.message);
      }
      const now = new Date();
      const [updated] = await tx
        .update(S.requests)
        .set({
          state: verdict.to,
          version: r.version + 1,
          updatedAt: now,
          ...(verdict.to === 'delivered' && { deliveredAt: now }),
          ...(verdict.to === 'completed' && { completedAt: now }),
        })
        .where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, id), eq(S.requests.version, input.version)))
        .returning();
      if (!updated) throw Errors.version();
      await tx.insert(S.requestEvents).values({ orgId: ctx.orgId, requestId: id, actorMemberId: ctx.memberId, action: input.action, fromState: r.state, toState: verdict.to, note: input.note?.trim() || null });
      await recordActivity(tx, { orgId: ctx.orgId, entityType: 'request', entityId: id, departmentId: r.toDepartmentId, actorMemberId: ctx.memberId, verb: input.action, data: { from: r.state, to: verdict.to } });
      await this.audit.log(ctx, 'request.transition', { type: 'request', id }, { action: input.action, from: r.state, to: verdict.to }, tx);
      const recipients = new Set([...(await this.deptAdmins(tx, ctx.orgId, r.fromDepartmentId)), ...(await this.deptAdmins(tx, ctx.orgId, r.toDepartmentId)), r.createdByMemberId]);
      const notify = await this.notifications.create(
        tx,
        ctx.orgId,
        recipients,
        { kind: 'request_updated', title: `#${r.number} ${r.title}: ${REQUEST_STATE_LABEL[verdict.to]}`, body: input.note?.slice(0, 160), entityType: 'request', entityId: id },
        ctx.memberId,
      );
      return { updated, notify };
    });
    res.notify();
    publish({ type: 'request.changed', orgId: ctx.orgId, deptIds: [res.updated.fromDepartmentId, res.updated.toDepartmentId], requestId: id });
    return res.updated;
  }

  async addComment(ctx: OrgContext, id: string, body: string) {
    ctx.assertNotViewer();
    const db = getDb();
    const res = await db.transaction(async (tx) => {
      const r = await this.load(tx, ctx, id);
      const [c] = await tx.insert(S.comments).values({ orgId: ctx.orgId, requestId: id, authorMemberId: ctx.memberId, body }).returning();
      const recipients = new Set([...(await this.deptAdmins(tx, ctx.orgId, r.fromDepartmentId)), ...(await this.deptAdmins(tx, ctx.orgId, r.toDepartmentId)), r.createdByMemberId]);
      const notify = await this.notifications.create(tx, ctx.orgId, recipients, { kind: 'request_comment', title: `Comment on #${r.number} ${r.title}`, body: body.slice(0, 140), entityType: 'request', entityId: id }, ctx.memberId);
      return { c, r, notify };
    });
    res.notify();
    publish({ type: 'request.changed', orgId: ctx.orgId, deptIds: [res.r.fromDepartmentId, res.r.toDepartmentId], requestId: id });
    return res.c;
  }
}
