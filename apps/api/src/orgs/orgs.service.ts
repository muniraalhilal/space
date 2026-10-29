import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, asc, count, eq, inArray, isNull, sql, desc } from 'drizzle-orm';
import {
  DEPT_THEME_DEFAULT_COLOR,
  normalizeAvatar,
  type CreateOrgInput,
  createDepartmentSchema,
  updateDepartmentSchema,
  updateOrgSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateMeInOrgSchema,
  updateOfficeLayoutSchema,
} from '@space/shared';
import type { z } from 'zod';
import { DbOrTx, getDb, schema } from '../db/client';
import { OrgContext, AuthUser } from '../common/context';
import { Errors } from '../common/errors';
import { AuditService } from '../common/audit.service';
import { publish } from '../realtime/bus';
import { placeRooms, MAX_ROOMS_PER_FLOOR } from '../office/layout';
import { randomToken } from '../common/crypto';

const S = schema;

@Injectable()
export class OrgsService {
  constructor(private readonly audit: AuditService) {}

  /* ---------------- organisation lifecycle ---------------- */

  async create(user: AuthUser, input: CreateOrgInput) {
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const [taken] = await tx.select({ id: S.organizations.id }).from(S.organizations).where(eq(S.organizations.slug, input.slug));
      if (taken) throw Errors.conflict('That workspace address is taken');
      const [org] = await tx
        .insert(S.organizations)
        .values({ name: input.name, slug: input.slug, brandColor: input.brandColor, settings: { requireApprovalForAgentWrites: true, allowAgentExternalIntegrations: false } })
        .returning();
      const [member] = await tx
        .insert(S.orgMembers)
        .values({ orgId: org.id, userId: user.id, role: 'company_admin', title: 'Company Admin', avatar: {} })
        .returning();
      let i = 0;
      for (const d of input.departments) {
        const [dept] = await tx
          .insert(S.departments)
          .values({ orgId: org.id, name: d.name, theme: d.theme, color: DEPT_THEME_DEFAULT_COLOR[d.theme], sortOrder: i++ })
          .returning();
        await tx.insert(S.departmentMembers).values({ orgId: org.id, departmentId: dept.id, memberId: member.id, role: 'admin' });
      }
      await this.relayout(tx, org.id, 1);
      await this.audit.log({ orgId: org.id, memberId: member.id, userId: user.id }, 'org.create', { type: 'organization', id: org.id }, { name: org.name }, tx);
      return org;
    });
    return result;
  }

  async overview(ctx: OrgContext) {
    const db = getDb();
    const [org] = await db.select().from(S.organizations).where(eq(S.organizations.id, ctx.orgId));
    const depts = await this.listDepartments(ctx);
    const floors = [...new Set(depts.map((d) => d.floor))].sort((a, b) => a - b);
    const [me] = await db
      .select({ m: S.orgMembers, u: { name: S.users.name, email: S.users.email } })
      .from(S.orgMembers)
      .innerJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(eq(S.orgMembers.id, ctx.memberId));
    return {
      organization: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        displayName: `${org.name} Space`,
        brandColor: org.brandColor,
        accentColor: org.accentColor,
        logoFileId: org.logoFileId,
        officeTheme: org.officeTheme,
        isDemo: org.isDemo,
        settings: ctx.isCompanyAdmin ? org.settings : undefined,
      },
      me: {
        memberId: ctx.memberId,
        role: ctx.role,
        name: me.u.name,
        email: me.u.email,
        title: me.m.title,
        presence: me.m.presence,
        avatar: normalizeAvatar(me.m.avatar),
        departments: Object.fromEntries(ctx.deptRoles),
      },
      departments: depts,
      floors: floors.length ? floors : [1],
    };
  }

  async update(ctx: OrgContext, input: z.infer<typeof updateOrgSchema>) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    const [org] = await db.select().from(S.organizations).where(eq(S.organizations.id, ctx.orgId));
    const patch: Partial<typeof S.organizations.$inferInsert> = {};
    if (input.name) patch.name = input.name;
    if (input.brandColor) patch.brandColor = input.brandColor;
    if (input.accentColor) patch.accentColor = input.accentColor;
    if (input.officeTheme) patch.officeTheme = input.officeTheme;
    if (input.settings) patch.settings = { ...org.settings, ...input.settings };
    await db.update(S.organizations).set(patch).where(eq(S.organizations.id, ctx.orgId));
    await this.audit.log(ctx, 'org.update', { type: 'organization', id: ctx.orgId }, { fields: Object.keys(patch) });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'branding' });
    return { ok: true };
  }

  /* ---------------- members ---------------- */

  async listMembers(ctx: OrgContext) {
    const db = getDb();
    const rows = await db
      .select({
        id: S.orgMembers.id,
        userId: S.orgMembers.userId,
        name: S.users.name,
        email: S.users.email,
        role: S.orgMembers.role,
        title: S.orgMembers.title,
        presence: S.orgMembers.presence,
        avatar: S.orgMembers.avatar,
        joinedAt: S.orgMembers.joinedAt,
      })
      .from(S.orgMembers)
      .innerJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(and(eq(S.orgMembers.orgId, ctx.orgId), isNull(S.orgMembers.deactivatedAt)))
      .orderBy(asc(S.users.name));
    const dms = await db
      .select({ memberId: S.departmentMembers.memberId, departmentId: S.departmentMembers.departmentId, role: S.departmentMembers.role })
      .from(S.departmentMembers)
      .where(eq(S.departmentMembers.orgId, ctx.orgId));
    // Each person's most recently touched in-progress task, shown in the office hover card.
    // Only included when the viewer is allowed to read that task's department.
    const active = await db
      .select({ id: S.tasks.id, title: S.tasks.title, departmentId: S.tasks.departmentId, memberId: S.tasks.assigneeMemberId, updatedAt: S.tasks.updatedAt })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.status, 'in_progress'), sql`${S.tasks.assigneeMemberId} is not null`))
      .orderBy(desc(S.tasks.updatedAt));
    const currentTask = new Map<string, { id: string; title: string }>();
    for (const t of active) {
      if (!t.memberId || currentTask.has(t.memberId) || !ctx.canReadDept(t.departmentId)) continue;
      currentTask.set(t.memberId, { id: t.id, title: t.title });
    }
    return rows.map((r) => ({
      ...r,
      currentTask: currentTask.get(r.id) ?? null,
      // Emails are visible to company admins only.
      email: ctx.isCompanyAdmin || r.id === ctx.memberId ? r.email : undefined,
      avatar: normalizeAvatar(r.avatar),
      departments: dms.filter((d) => d.memberId === r.id).map((d) => ({ departmentId: d.departmentId, role: d.role })),
    }));
  }

  async invite(ctx: OrgContext, input: z.infer<typeof inviteMemberSchema>) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    return db.transaction(async (tx) => {
      let [u] = await tx.select().from(S.users).where(sql`lower(${S.users.email}) = lower(${input.email})`);
      let temporaryPassword: string | undefined;
      if (!u) {
        // No email delivery is configured, so the admin receives a one-time temporary password to share securely.
        temporaryPassword = randomToken(12);
        [u] = await tx
          .insert(S.users)
          .values({ email: input.email.toLowerCase(), name: input.name, passwordHash: await bcrypt.hash(temporaryPassword, 12) })
          .returning();
      }
      const [existing] = await tx.select().from(S.orgMembers).where(and(eq(S.orgMembers.orgId, ctx.orgId), eq(S.orgMembers.userId, u.id)));
      if (existing && !existing.deactivatedAt) throw Errors.conflict('That person is already a member');
      let member;
      if (existing) {
        [member] = await tx.update(S.orgMembers).set({ deactivatedAt: null, role: input.role, title: input.title }).where(eq(S.orgMembers.id, existing.id)).returning();
      } else {
        [member] = await tx.insert(S.orgMembers).values({ orgId: ctx.orgId, userId: u.id, role: input.role, title: input.title, avatar: {} }).returning();
      }
      if (input.departmentId) {
        await this.assertDept(tx, ctx.orgId, input.departmentId);
        await tx
          .insert(S.departmentMembers)
          .values({ orgId: ctx.orgId, departmentId: input.departmentId, memberId: member.id, role: input.departmentRole ?? 'member' })
          .onConflictDoNothing();
      }
      await this.audit.log(ctx, 'member.invite', { type: 'member', id: member.id }, { email: input.email, role: input.role }, tx);
      publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'members' });
      return { memberId: member.id, temporaryPassword };
    });
  }

  async updateMember(ctx: OrgContext, memberId: string, input: z.infer<typeof updateMemberSchema>) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    const [m] = await db.select().from(S.orgMembers).where(and(eq(S.orgMembers.orgId, ctx.orgId), eq(S.orgMembers.id, memberId)));
    if (!m) throw Errors.notFound('Member');
    if (m.id === ctx.memberId && input.role && input.role !== 'company_admin') {
      await this.assertAnotherAdmin(ctx);
    }
    await db.update(S.orgMembers).set(input).where(eq(S.orgMembers.id, memberId));
    await this.audit.log(ctx, 'member.update', { type: 'member', id: memberId }, input);
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'members' });
    return { ok: true };
  }

  async removeMember(ctx: OrgContext, memberId: string) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    const [m] = await db.select().from(S.orgMembers).where(and(eq(S.orgMembers.orgId, ctx.orgId), eq(S.orgMembers.id, memberId)));
    if (!m) throw Errors.notFound('Member');
    if (m.role === 'company_admin') await this.assertAnotherAdmin(ctx, memberId);
    await db.transaction(async (tx) => {
      await tx.update(S.orgMembers).set({ deactivatedAt: new Date() }).where(eq(S.orgMembers.id, memberId));
      await tx.delete(S.departmentMembers).where(and(eq(S.departmentMembers.orgId, ctx.orgId), eq(S.departmentMembers.memberId, memberId)));
      await this.audit.log(ctx, 'member.remove', { type: 'member', id: memberId }, {}, tx);
    });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'members' });
    return { ok: true };
  }

  private async assertAnotherAdmin(ctx: OrgContext, excluding = ctx.memberId) {
    const [{ n }] = await getDb()
      .select({ n: count() })
      .from(S.orgMembers)
      .where(and(eq(S.orgMembers.orgId, ctx.orgId), eq(S.orgMembers.role, 'company_admin'), isNull(S.orgMembers.deactivatedAt), sql`${S.orgMembers.id} <> ${excluding}`));
    if (n < 1) throw Errors.conflict('A company needs at least one company admin');
  }

  async updateMe(ctx: OrgContext, input: z.infer<typeof updateMeInOrgSchema>) {
    await getDb()
      .update(S.orgMembers)
      .set({ ...(input.title !== undefined && { title: input.title }), ...(input.presence && { presence: input.presence }), ...(input.avatar && { avatar: input.avatar }) })
      .where(eq(S.orgMembers.id, ctx.memberId));
    publish({ type: 'presence.changed', orgId: ctx.orgId, memberId: ctx.memberId });
    return { ok: true };
  }

  /* ---------------- departments ---------------- */

  async listDepartments(ctx: OrgContext) {
    const db = getDb();
    const depts = await db.select().from(S.departments).where(eq(S.departments.orgId, ctx.orgId)).orderBy(asc(S.departments.sortOrder), asc(S.departments.name));
    const memberCounts = await db
      .select({ d: S.departmentMembers.departmentId, n: count() })
      .from(S.departmentMembers)
      .innerJoin(S.orgMembers, eq(S.orgMembers.id, S.departmentMembers.memberId))
      .where(and(eq(S.departmentMembers.orgId, ctx.orgId), isNull(S.orgMembers.deactivatedAt)))
      .groupBy(S.departmentMembers.departmentId);
    const agentCounts = await db
      .select({ d: S.agents.departmentId, n: count() })
      .from(S.agents)
      .where(and(eq(S.agents.orgId, ctx.orgId), eq(S.agents.enabled, true)))
      .groupBy(S.agents.departmentId);
    return depts.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      theme: d.theme,
      color: d.color,
      floor: d.floor,
      memberCount: memberCounts.find((c) => c.d === d.id)?.n ?? 0,
      agentCount: agentCounts.find((c) => c.d === d.id)?.n ?? 0,
      myRole: ctx.deptRoles.get(d.id) ?? null,
      canRead: ctx.canReadDept(d.id),
      canAdmin: ctx.canAdminDept(d.id),
    }));
  }

  async departmentDetail(ctx: OrgContext, deptId: string) {
    const db = getDb();
    const [d] = await db.select().from(S.departments).where(and(eq(S.departments.orgId, ctx.orgId), eq(S.departments.id, deptId)));
    if (!d) throw Errors.notFound('Department');
    const members = await db
      .select({ id: S.orgMembers.id, name: S.users.name, title: S.orgMembers.title, presence: S.orgMembers.presence, avatar: S.orgMembers.avatar, role: S.departmentMembers.role })
      .from(S.departmentMembers)
      .innerJoin(S.orgMembers, eq(S.orgMembers.id, S.departmentMembers.memberId))
      .innerJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .where(and(eq(S.departmentMembers.orgId, ctx.orgId), eq(S.departmentMembers.departmentId, deptId), isNull(S.orgMembers.deactivatedAt)))
      .orderBy(desc(S.departmentMembers.role), asc(S.users.name));
    let stats: Record<string, number> | null = null;
    if (ctx.canReadDept(deptId)) {
      const rows = await db
        .select({ s: S.tasks.status, n: count() })
        .from(S.tasks)
        .where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.departmentId, deptId)))
        .groupBy(S.tasks.status);
      stats = Object.fromEntries(rows.map((r) => [r.s, r.n]));
      const [{ open }] = await db
        .select({ open: count() })
        .from(S.requests)
        .where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.toDepartmentId, deptId), inArray(S.requests.state, ['submitted', 'clarification_requested'])));
      stats.incomingRequests = open;
    }
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      theme: d.theme,
      color: d.color,
      floor: d.floor,
      canRead: ctx.canReadDept(deptId),
      canAdmin: ctx.canAdminDept(deptId),
      members: members.map((m) => ({ ...m, avatar: normalizeAvatar(m.avatar) })),
      stats,
    };
  }

  async createDepartment(ctx: OrgContext, input: z.infer<typeof createDepartmentSchema>) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    const dept = await db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: count() }).from(S.departments).where(and(eq(S.departments.orgId, ctx.orgId), eq(S.departments.floor, input.floor)));
      if (n >= MAX_ROOMS_PER_FLOOR) throw Errors.conflict(`Floor ${input.floor} is full — choose another floor`);
      const [d] = await tx
        .insert(S.departments)
        .values({ orgId: ctx.orgId, name: input.name, description: input.description, theme: input.theme, color: input.color ?? DEPT_THEME_DEFAULT_COLOR[input.theme], floor: input.floor, sortOrder: n })
        .returning();
      await this.relayout(tx, ctx.orgId, input.floor);
      await this.audit.log(ctx, 'department.create', { type: 'department', id: d.id }, { name: d.name }, tx);
      return d;
    });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'departments' });
    return dept;
  }

  async updateDepartment(ctx: OrgContext, deptId: string, input: z.infer<typeof updateDepartmentSchema>) {
    const db = getDb();
    const [d] = await db.select().from(S.departments).where(and(eq(S.departments.orgId, ctx.orgId), eq(S.departments.id, deptId)));
    if (!d) throw Errors.notFound('Department');
    ctx.assertAdminDept(deptId);
    // Renaming or moving floors changes the company structure: company admins only.
    if ((input.name && input.name !== d.name) || (input.floor && input.floor !== d.floor)) ctx.assertCompanyAdmin();
    await db.transaction(async (tx) => {
      await tx.update(S.departments).set(input).where(eq(S.departments.id, deptId));
      if (input.floor && input.floor !== d.floor) {
        await this.relayout(tx, ctx.orgId, d.floor);
        await this.relayout(tx, ctx.orgId, input.floor);
      }
      await this.audit.log(ctx, 'department.update', { type: 'department', id: deptId }, input, tx);
    });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'departments' });
    return { ok: true };
  }

  async deleteDepartment(ctx: OrgContext, deptId: string) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    const [d] = await db.select().from(S.departments).where(and(eq(S.departments.orgId, ctx.orgId), eq(S.departments.id, deptId)));
    if (!d) throw Errors.notFound('Department');
    const [{ n }] = await db.select({ n: count() }).from(S.projects).where(and(eq(S.projects.orgId, ctx.orgId), eq(S.projects.departmentId, deptId)));
    const [{ r }] = await db
      .select({ r: count() })
      .from(S.requests)
      .where(and(eq(S.requests.orgId, ctx.orgId), sql`(${S.requests.fromDepartmentId} = ${deptId} OR ${S.requests.toDepartmentId} = ${deptId})`));
    if (n > 0 || r > 0) throw Errors.conflict('Archive or move this department’s projects and requests before deleting it');
    await db.transaction(async (tx) => {
      await tx.delete(S.departments).where(eq(S.departments.id, deptId));
      await this.relayout(tx, ctx.orgId, d.floor);
      await this.audit.log(ctx, 'department.delete', { type: 'department', id: deptId }, { name: d.name }, tx);
    });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'departments' });
    return { ok: true };
  }

  async setDepartmentMember(ctx: OrgContext, deptId: string, memberId: string, role: 'admin' | 'member') {
    ctx.assertAdminDept(deptId);
    // Granting department admin rights is a company-level decision.
    if (role === 'admin') ctx.assertCompanyAdmin();
    const db = getDb();
    await this.assertDept(db, ctx.orgId, deptId);
    const [m] = await db.select().from(S.orgMembers).where(and(eq(S.orgMembers.orgId, ctx.orgId), eq(S.orgMembers.id, memberId), isNull(S.orgMembers.deactivatedAt)));
    if (!m) throw Errors.notFound('Member');
    const [cur] = await db.select().from(S.departmentMembers).where(and(eq(S.departmentMembers.departmentId, deptId), eq(S.departmentMembers.memberId, memberId)));
    if (cur?.role === 'admin' && role === 'member') ctx.assertCompanyAdmin();
    await db
      .insert(S.departmentMembers)
      .values({ orgId: ctx.orgId, departmentId: deptId, memberId, role })
      .onConflictDoUpdate({ target: [S.departmentMembers.departmentId, S.departmentMembers.memberId], set: { role } });
    await this.audit.log(ctx, 'department.member.set', { type: 'department', id: deptId }, { memberId, role });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'members' });
    return { ok: true };
  }

  async removeDepartmentMember(ctx: OrgContext, deptId: string, memberId: string) {
    ctx.assertAdminDept(deptId);
    const db = getDb();
    const [cur] = await db
      .select()
      .from(S.departmentMembers)
      .where(and(eq(S.departmentMembers.orgId, ctx.orgId), eq(S.departmentMembers.departmentId, deptId), eq(S.departmentMembers.memberId, memberId)));
    if (!cur) throw Errors.notFound('Department member');
    if (cur.role === 'admin') ctx.assertCompanyAdmin();
    await db.delete(S.departmentMembers).where(and(eq(S.departmentMembers.departmentId, deptId), eq(S.departmentMembers.memberId, memberId)));
    await this.audit.log(ctx, 'department.member.set', { type: 'department', id: deptId }, { memberId, role: null });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'members' });
    return { ok: true };
  }

  /* ---------------- office layout ---------------- */

  async office(ctx: OrgContext) {
    const rows = await getDb().select().from(S.officeLayouts).where(eq(S.officeLayouts.orgId, ctx.orgId)).orderBy(asc(S.officeLayouts.floor));
    return rows.map((r) => ({ floor: r.floor, rooms: r.rooms }));
  }

  async updateOffice(ctx: OrgContext, input: z.infer<typeof updateOfficeLayoutSchema>) {
    ctx.assertCompanyAdmin();
    const db = getDb();
    const depts = await db
      .select({ id: S.departments.id })
      .from(S.departments)
      .where(and(eq(S.departments.orgId, ctx.orgId), eq(S.departments.floor, input.floor)));
    const ids = new Set(depts.map((d) => d.id));
    if (input.rooms.some((r) => !ids.has(r.departmentId))) throw Errors.badRequest('Rooms must reference departments on this floor');
    await db
      .insert(S.officeLayouts)
      .values({ orgId: ctx.orgId, floor: input.floor, rooms: input.rooms })
      .onConflictDoUpdate({ target: [S.officeLayouts.orgId, S.officeLayouts.floor], set: { rooms: input.rooms, updatedAt: new Date() } });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'office' });
    return { ok: true };
  }

  /** Recompute room placement for one floor, preserving existing rooms. */
  async relayout(tx: DbOrTx, orgId: string, floor: number) {
    const depts = await tx
      .select({ id: S.departments.id })
      .from(S.departments)
      .where(and(eq(S.departments.orgId, orgId), eq(S.departments.floor, floor)))
      .orderBy(asc(S.departments.sortOrder), asc(S.departments.createdAt));
    const [cur] = await tx.select().from(S.officeLayouts).where(and(eq(S.officeLayouts.orgId, orgId), eq(S.officeLayouts.floor, floor)));
    const rooms = placeRooms(cur?.rooms ?? [], depts.map((d) => d.id));
    await tx
      .insert(S.officeLayouts)
      .values({ orgId, floor, rooms })
      .onConflictDoUpdate({ target: [S.officeLayouts.orgId, S.officeLayouts.floor], set: { rooms, updatedAt: new Date() } });
  }

  async auditLog(ctx: OrgContext) {
    ctx.assertCompanyAdmin();
    return getDb()
      .select({ a: S.auditLogs, actor: S.users.name })
      .from(S.auditLogs)
      .leftJoin(S.users, eq(S.users.id, S.auditLogs.actorUserId))
      .where(eq(S.auditLogs.orgId, ctx.orgId))
      .orderBy(desc(S.auditLogs.createdAt))
      .limit(200)
      .then((rows) => rows.map((r) => ({ ...r.a, actorName: r.actor })));
  }

  private async assertDept(tx: DbOrTx, orgId: string, deptId: string) {
    const [d] = await tx.select({ id: S.departments.id }).from(S.departments).where(and(eq(S.departments.orgId, orgId), eq(S.departments.id, deptId)));
    if (!d) throw Errors.notFound('Department');
  }
}
