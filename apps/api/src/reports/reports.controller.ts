import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, sql, SQL } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { Org, OrgContext } from '../common/context';

const S = schema;

/**
 * All figures are computed from stored records at request time. Nothing here is estimated or
 * generated; AI-written commentary (if any) lives in agent run results and is labelled as such.
 */
@Injectable()
export class ReportsService {
  /** Latest activity the viewer is allowed to see (department-scoped unless company admin). */
  async recentActivity(ctx: OrgContext, limit: number) {
    const db = getDb();
    const readable = ctx.readableDeptIds();
    const rows = await db
      .select({
        id: S.activities.id,
        verb: S.activities.verb,
        entityType: S.activities.entityType,
        entityId: S.activities.entityId,
        departmentId: S.activities.departmentId,
        departmentName: S.departments.name,
        data: S.activities.data,
        createdAt: S.activities.createdAt,
        actor: sql<string | null>`coalesce(${S.users.name}, ${S.agents.name})`,
        actorIsAgent: sql<boolean>`${S.activities.actorAgentId} is not null`,
        title: sql<string | null>`coalesce(${S.tasks.title}, ${S.requests.title}, ${S.projects.name})`,
      })
      .from(S.activities)
      .leftJoin(S.departments, eq(S.departments.id, S.activities.departmentId))
      .leftJoin(S.orgMembers, eq(S.orgMembers.id, S.activities.actorMemberId))
      .leftJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .leftJoin(S.agents, eq(S.agents.id, S.activities.actorAgentId))
      .leftJoin(S.tasks, and(eq(S.activities.entityType, 'task'), eq(S.tasks.id, S.activities.entityId)))
      .leftJoin(S.requests, and(eq(S.activities.entityType, 'request'), eq(S.requests.id, S.activities.entityId)))
      .leftJoin(S.projects, and(eq(S.activities.entityType, 'project'), eq(S.projects.id, S.activities.entityId)))
      .where(and(eq(S.activities.orgId, ctx.orgId), readable ? (readable.length ? inArray(S.activities.departmentId, readable) : sql`false`) : undefined))
      .orderBy(desc(S.activities.createdAt))
      .limit(limit);
    return rows;
  }

  async summary(ctx: OrgContext, days: number) {
    const db = getDb();
    const since = new Date(Date.now() - days * 86400_000);
    const readable = ctx.readableDeptIds();
    const deptFilter = (col: any): SQL | undefined => (readable ? (readable.length ? inArray(col, readable) : sql`false`) : undefined);

    const depts = await db.select({ id: S.departments.id, name: S.departments.name, theme: S.departments.theme, color: S.departments.color }).from(S.departments).where(and(eq(S.departments.orgId, ctx.orgId), deptFilter(S.departments.id)));

    const byDeptStatus = await db
      .select({ d: S.tasks.departmentId, s: S.tasks.status, n: count() })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), deptFilter(S.tasks.departmentId)))
      .groupBy(S.tasks.departmentId, S.tasks.status);

    const completedInWindow = await db
      .select({ d: S.tasks.departmentId, n: count() })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), deptFilter(S.tasks.departmentId), gte(S.tasks.completedAt, since)))
      .groupBy(S.tasks.departmentId);

    const overdue = await db
      .select({ d: S.tasks.departmentId, n: count() })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), deptFilter(S.tasks.departmentId), sql`${S.tasks.dueDate} < current_date`, sql`${S.tasks.status} <> 'done'`))
      .groupBy(S.tasks.departmentId);

    const daily = await db
      .select({ day: sql<string>`to_char(date_trunc('day', ${S.tasks.completedAt}), 'YYYY-MM-DD')`, n: count() })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), deptFilter(S.tasks.departmentId), gte(S.tasks.completedAt, since)))
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const reqFilter = readable
      ? readable.length
        ? sql`(${inArray(S.requests.fromDepartmentId, readable)} OR ${inArray(S.requests.toDepartmentId, readable)})`
        : sql`false`
      : undefined;
    const requestStates = await db.select({ s: S.requests.state, n: count() }).from(S.requests).where(and(eq(S.requests.orgId, ctx.orgId), reqFilter)).groupBy(S.requests.state);

    const workload = await db
      .select({ memberId: S.tasks.assigneeMemberId, name: S.users.name, n: count() })
      .from(S.tasks)
      .innerJoin(S.orgMembers, eq(S.orgMembers.id, S.tasks.assigneeMemberId))
      .innerJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(and(eq(S.tasks.orgId, ctx.orgId), deptFilter(S.tasks.departmentId), sql`${S.tasks.status} <> 'done'`))
      .groupBy(S.tasks.assigneeMemberId, S.users.name)
      .orderBy(desc(count()))
      .limit(15);

    const agentStats = await db
      .select({ s: S.agentRuns.status, n: count(), cost: sql<string>`coalesce(sum(${S.agentRuns.costUsd}),0)::text` })
      .from(S.agentRuns)
      .where(and(eq(S.agentRuns.orgId, ctx.orgId), deptFilter(S.agentRuns.departmentId), gte(S.agentRuns.createdAt, since)))
      .groupBy(S.agentRuns.status);

    const highlights = await db
      .select({ a: S.activities, actor: sql<string>`coalesce(${S.users.name}, ${S.agents.name})`, title: sql<string>`coalesce(${S.tasks.title}, ${S.requests.title})` })
      .from(S.activities)
      .leftJoin(S.orgMembers, eq(S.orgMembers.id, S.activities.actorMemberId))
      .leftJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .leftJoin(S.agents, eq(S.agents.id, S.activities.actorAgentId))
      .leftJoin(S.tasks, and(eq(S.activities.entityType, 'task'), eq(S.tasks.id, S.activities.entityId)))
      .leftJoin(S.requests, and(eq(S.activities.entityType, 'request'), eq(S.requests.id, S.activities.entityId)))
      .where(
        and(
          eq(S.activities.orgId, ctx.orgId),
          deptFilter(S.activities.departmentId),
          gte(S.activities.createdAt, new Date(Date.now() - 86400_000)),
          inArray(S.activities.verb, ['status_changed', 'created', 'accept', 'deliver', 'approve']),
        ),
      )
      .orderBy(desc(S.activities.createdAt))
      .limit(20);

    return {
      windowDays: days,
      generatedAt: new Date().toISOString(),
      departments: depts.map((d) => {
        const st = byDeptStatus.filter((x) => x.d === d.id);
        const total = st.reduce((a, b) => a + b.n, 0);
        return {
          ...d,
          total,
          byStatus: Object.fromEntries(st.map((x) => [x.s, x.n])),
          completedInWindow: completedInWindow.find((x) => x.d === d.id)?.n ?? 0,
          overdue: overdue.find((x) => x.d === d.id)?.n ?? 0,
        };
      }),
      dailyCompletions: daily,
      requests: Object.fromEntries(requestStates.map((r) => [r.s, r.n])),
      workload,
      agentRuns: agentStats.map((a) => ({ status: a.s, count: a.n, costUsd: Number(a.cost) })),
      highlights: highlights.map((h) => ({ id: h.a.id, verb: h.a.verb, entityType: h.a.entityType, entityId: h.a.entityId, data: h.a.data, actor: h.actor, title: h.title, createdAt: h.a.createdAt })),
    };
  }
}

@Controller('orgs/:orgId/reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}
  @Get('summary')
  summary(@Org() ctx: OrgContext, @Query('days') days?: string) {
    const d = Math.min(Math.max(parseInt(days ?? '14', 10) || 14, 1), 180);
    return this.svc.summary(ctx, d);
  }
  @Get('activity')
  activity(@Org() ctx: OrgContext, @Query('limit') limit?: string) {
    return this.svc.recentActivity(ctx, Math.min(Math.max(parseInt(limit ?? '8', 10) || 8, 1), 50));
  }
}
