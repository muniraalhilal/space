import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { createProjectSchema, updateProjectSchema } from '@space/shared';
import type { z } from 'zod';
import { getDb, schema } from '../db/client';
import { OrgContext } from '../common/context';
import { Errors } from '../common/errors';
import { AuditService } from '../common/audit.service';
import { recordActivity } from '../common/activity';
import { publish } from '../realtime/bus';

const S = schema;

@Injectable()
export class ProjectsService {
  constructor(private readonly audit: AuditService) {}

  async list(ctx: OrgContext, departmentId?: string) {
    const readable = ctx.readableDeptIds();
    if (departmentId && !ctx.canReadDept(departmentId)) return [];
    const where = and(
      eq(S.projects.orgId, ctx.orgId),
      departmentId ? eq(S.projects.departmentId, departmentId) : readable ? (readable.length ? inArray(S.projects.departmentId, readable) : sql`false`) : undefined,
    );
    const db = getDb();
    const projects = await db.select().from(S.projects).where(where).orderBy(asc(S.projects.name));
    if (!projects.length) return [];
    const counts = await db
      .select({ p: S.tasks.projectId, s: S.tasks.status, n: count() })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), inArray(S.tasks.projectId, projects.map((p) => p.id)), sql`${S.tasks.parentId} IS NULL`))
      .groupBy(S.tasks.projectId, S.tasks.status);
    return projects.map((p) => {
      const c = counts.filter((x) => x.p === p.id);
      const total = c.reduce((a, b) => a + b.n, 0);
      const done = c.find((x) => x.s === 'done')?.n ?? 0;
      return { ...p, taskCount: total, doneCount: done, canAdmin: ctx.canAdminDept(p.departmentId) };
    });
  }

  async get(ctx: OrgContext, id: string) {
    const [p] = await getDb().select().from(S.projects).where(and(eq(S.projects.orgId, ctx.orgId), eq(S.projects.id, id)));
    if (!p) throw Errors.notFound('Project');
    ctx.assertReadDept(p.departmentId, 'Project');
    return { ...p, canAdmin: ctx.canAdminDept(p.departmentId), canWrite: ctx.canWriteDept(p.departmentId) };
  }

  async create(ctx: OrgContext, input: z.infer<typeof createProjectSchema>) {
    ctx.assertAdminDept(input.departmentId);
    const db = getDb();
    const [dept] = await db.select().from(S.departments).where(and(eq(S.departments.orgId, ctx.orgId), eq(S.departments.id, input.departmentId)));
    if (!dept) throw Errors.notFound('Department');
    const p = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(S.projects)
        .values({ orgId: ctx.orgId, departmentId: input.departmentId, name: input.name, description: input.description, dueDate: input.dueDate?.slice(0, 10) ?? null, color: input.color ?? dept.color, createdByMemberId: ctx.memberId })
        .returning();
      await recordActivity(tx, { orgId: ctx.orgId, entityType: 'project', entityId: p.id, departmentId: p.departmentId, actorMemberId: ctx.memberId, verb: 'created' });
      await this.audit.log(ctx, 'project.create', { type: 'project', id: p.id }, { name: p.name }, tx);
      return p;
    });
    publish({ type: 'project.changed', orgId: ctx.orgId, deptId: p.departmentId, projectId: p.id });
    return p;
  }

  async update(ctx: OrgContext, id: string, input: z.infer<typeof updateProjectSchema>) {
    const p = await this.get(ctx, id);
    ctx.assertAdminDept(p.departmentId);
    const patch = { ...input, dueDate: input.dueDate === undefined ? undefined : input.dueDate?.slice(0, 10) ?? null, updatedAt: new Date() };
    await getDb().update(S.projects).set(patch).where(and(eq(S.projects.orgId, ctx.orgId), eq(S.projects.id, id)));
    await this.audit.log(ctx, 'project.update', { type: 'project', id }, input);
    publish({ type: 'project.changed', orgId: ctx.orgId, deptId: p.departmentId, projectId: id });
    return { ok: true };
  }

  async remove(ctx: OrgContext, id: string) {
    const p = await this.get(ctx, id);
    ctx.assertAdminDept(p.departmentId);
    await getDb().transaction(async (tx) => {
      await tx.delete(S.projects).where(and(eq(S.projects.orgId, ctx.orgId), eq(S.projects.id, id)));
      await this.audit.log(ctx, 'project.delete', { type: 'project', id }, { name: p.name }, tx);
    });
    publish({ type: 'project.changed', orgId: ctx.orgId, deptId: p.departmentId, projectId: id });
    return { ok: true };
  }
}
