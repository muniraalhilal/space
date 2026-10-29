/** Companies, members, departments, office layout and audit log (ported from apps/api/src/orgs). */
import {
  DEPT_THEME_DEFAULT_COLOR,
  normalizeAvatar,
  createOrgSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  updateOrgSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateMeInOrgSchema,
  updateOfficeLayoutSchema,
} from '@space/shared';
import type { z } from 'zod';
import { placeRooms, MAX_ROOMS_PER_FLOOR } from '../../../api/src/office/layout';
import { T, nowIso } from './store';
import { AuthUser, Errors, OrgContext, audit, byAsc, byDesc } from './core';

const activeMember = (orgId: string, id: string) => {
  const m = T.orgMembers.get(id);
  return m && m.orgId === orgId && !m.deactivatedAt ? m : undefined;
};

export async function createOrg(user: AuthUser, input: z.infer<typeof createOrgSchema>) {
  if (T.organizations.find((o) => o.slug === input.slug)) throw Errors.conflict('That workspace address is taken');
  const org = await T.organizations.insert({
    name: input.name,
    slug: input.slug,
    brandColor: input.brandColor,
    accentColor: '#f2b8c6',
    logoFileId: null,
    officeTheme: 'light',
    settings: { requireApprovalForAgentWrites: true, allowAgentExternalIntegrations: false },
    isDemo: false,
    requestSeq: 0,
    createdAt: nowIso(),
  });
  const member = await T.orgMembers.insert({ orgId: org.id, userId: user.id, role: 'company_admin', title: 'Company Admin', presence: 'available', avatar: {}, deactivatedAt: null, joinedAt: nowIso() });
  let i = 0;
  for (const d of input.departments) {
    const dept = await T.departments.insert({ orgId: org.id, name: d.name, description: null, theme: d.theme, color: DEPT_THEME_DEFAULT_COLOR[d.theme], floor: 1, sortOrder: i++, createdAt: nowIso() });
    await T.departmentMembers.insert({ id: `${dept.id}_${member.id}`, orgId: org.id, departmentId: dept.id, memberId: member.id, role: 'admin', createdAt: nowIso() });
  }
  await relayout(org.id, 1);
  await audit({ orgId: org.id, memberId: member.id, userId: user.id }, 'org.create', { type: 'organization', id: org.id }, { name: org.name });
  return org;
}

export function overview(ctx: OrgContext) {
  const org = T.organizations.get(ctx.orgId)!;
  const depts = listDepartments(ctx);
  const floors = [...new Set(depts.map((d) => d.floor))].sort((a, b) => a - b);
  const m = T.orgMembers.get(ctx.memberId)!;
  const u = T.users.get(m.userId);
  return {
    organization: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      displayName: `${org.name} Space`,
      brandColor: org.brandColor,
      accentColor: org.accentColor,
      logoFileId: org.logoFileId ?? null,
      officeTheme: org.officeTheme,
      isDemo: !!org.isDemo,
      settings: ctx.isCompanyAdmin ? (org.settings ?? {}) : undefined,
    },
    me: {
      memberId: ctx.memberId,
      role: ctx.role,
      name: u?.name ?? 'Unknown',
      email: u?.email ?? '',
      title: m.title,
      presence: m.presence,
      avatar: normalizeAvatar(m.avatar),
      departments: Object.fromEntries(ctx.deptRoles),
    },
    departments: depts,
    floors: floors.length ? floors : [1],
  };
}

export async function updateOrg(ctx: OrgContext, input: z.infer<typeof updateOrgSchema>) {
  ctx.assertCompanyAdmin();
  const org = T.organizations.get(ctx.orgId)!;
  const patch: Record<string, unknown> = {};
  if (input.name) patch.name = input.name;
  if (input.brandColor) patch.brandColor = input.brandColor;
  if (input.accentColor) patch.accentColor = input.accentColor;
  if (input.officeTheme) patch.officeTheme = input.officeTheme;
  if (input.settings) patch.settings = { ...(org.settings ?? {}), ...input.settings };
  await T.organizations.update(ctx.orgId, patch);
  await audit(ctx, 'org.update', { type: 'organization', id: ctx.orgId }, { fields: Object.keys(patch) });
  return { ok: true };
}

/* ---------------- members ---------------- */

export function listMembers(ctx: OrgContext) {
  const rows = T.orgMembers
    .where((m) => m.orgId === ctx.orgId && !m.deactivatedAt)
    .map((m) => ({ m, u: T.users.get(m.userId) }))
    .filter((x) => x.u)
    .sort(byAsc((x) => x.u!.name));
  const dms = T.departmentMembers.where((d) => d.orgId === ctx.orgId);
  const active = T.tasks.where((t) => t.orgId === ctx.orgId && t.status === 'in_progress' && !!t.assigneeMemberId).sort(byDesc((t) => t.updatedAt));
  const currentTask = new Map<string, { id: string; title: string }>();
  for (const t of active) {
    if (currentTask.has(t.assigneeMemberId) || !ctx.canReadDept(t.departmentId)) continue;
    currentTask.set(t.assigneeMemberId, { id: t.id, title: t.title });
  }
  return rows.map(({ m, u }) => ({
    id: m.id,
    userId: m.userId,
    name: u!.name,
    email: ctx.isCompanyAdmin || m.id === ctx.memberId ? u!.email : undefined,
    role: m.role,
    title: m.title ?? null,
    presence: m.presence,
    avatar: normalizeAvatar(m.avatar),
    joinedAt: m.joinedAt,
    currentTask: currentTask.get(m.id) ?? null,
    departments: dms.filter((d) => d.memberId === m.id).map((d) => ({ departmentId: d.departmentId, role: d.role })),
  }));
}

/**
 * Add someone to the company. In the hosted Space there are no passwords: the new person appears
 * on the "Who are you?" screen and anyone who opens the page as them can pick their name.
 */
export async function invite(ctx: OrgContext, input: z.infer<typeof inviteMemberSchema>) {
  ctx.assertCompanyAdmin();
  let u = T.users.find((x) => String(x.email).toLowerCase() === input.email.toLowerCase());
  if (!u) u = await T.users.insert({ email: input.email.toLowerCase(), name: input.name, createdAt: nowIso() });
  const existing = T.orgMembers.find((m) => m.orgId === ctx.orgId && m.userId === u!.id);
  if (existing && !existing.deactivatedAt) throw Errors.conflict('That person is already a member');
  const member = existing
    ? await T.orgMembers.update(existing.id, { deactivatedAt: null, role: input.role, title: input.title ?? null })
    : await T.orgMembers.insert({ orgId: ctx.orgId, userId: u.id, role: input.role, title: input.title ?? null, presence: 'offline', avatar: {}, deactivatedAt: null, joinedAt: nowIso() });
  if (input.departmentId) {
    assertDept(ctx.orgId, input.departmentId);
    const key = `${input.departmentId}_${member.id}`;
    if (!T.departmentMembers.get(key)) await T.departmentMembers.insert({ id: key, orgId: ctx.orgId, departmentId: input.departmentId, memberId: member.id, role: input.departmentRole ?? 'member', createdAt: nowIso() });
  }
  await audit(ctx, 'member.invite', { type: 'member', id: member.id }, { email: input.email, role: input.role });
  return { memberId: member.id, note: 'They can open this page and choose their name to sign in.' };
}

export async function updateMember(ctx: OrgContext, memberId: string, input: z.infer<typeof updateMemberSchema>) {
  ctx.assertCompanyAdmin();
  const m = T.orgMembers.get(memberId);
  if (!m || m.orgId !== ctx.orgId) throw Errors.notFound('Member');
  if (m.id === ctx.memberId && input.role && input.role !== 'company_admin') assertAnotherAdmin(ctx);
  await T.orgMembers.update(memberId, input);
  await audit(ctx, 'member.update', { type: 'member', id: memberId }, input);
  return { ok: true };
}

export async function removeMember(ctx: OrgContext, memberId: string) {
  ctx.assertCompanyAdmin();
  const m = T.orgMembers.get(memberId);
  if (!m || m.orgId !== ctx.orgId) throw Errors.notFound('Member');
  if (m.role === 'company_admin') assertAnotherAdmin(ctx, memberId);
  await T.orgMembers.update(memberId, { deactivatedAt: nowIso() });
  for (const d of T.departmentMembers.where((x) => x.orgId === ctx.orgId && x.memberId === memberId)) await T.departmentMembers.remove(d.id);
  await audit(ctx, 'member.remove', { type: 'member', id: memberId });
  return { ok: true };
}

function assertAnotherAdmin(ctx: OrgContext, excluding = ctx.memberId) {
  const n = T.orgMembers.where((m) => m.orgId === ctx.orgId && m.role === 'company_admin' && !m.deactivatedAt && m.id !== excluding).length;
  if (n < 1) throw Errors.conflict('A company needs at least one company admin');
}

export async function updateMe(ctx: OrgContext, input: z.infer<typeof updateMeInOrgSchema>) {
  await T.orgMembers.update(ctx.memberId, {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.presence && { presence: input.presence }),
    ...(input.avatar && { avatar: input.avatar }),
  });
  return { ok: true };
}

/* ---------------- departments ---------------- */

export function listDepartments(ctx: OrgContext) {
  const depts = T.departments.where((d) => d.orgId === ctx.orgId).sort((a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(b.name));
  const dms = T.departmentMembers.where((d) => d.orgId === ctx.orgId && !!activeMember(ctx.orgId, d.memberId));
  const agents = T.agents.where((a) => a.orgId === ctx.orgId && a.enabled);
  return depts.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description ?? null,
    theme: d.theme,
    color: d.color,
    floor: d.floor,
    memberCount: dms.filter((x) => x.departmentId === d.id).length,
    agentCount: agents.filter((a) => a.departmentId === d.id).length,
    myRole: ctx.deptRoles.get(d.id) ?? null,
    canRead: ctx.canReadDept(d.id),
    canAdmin: ctx.canAdminDept(d.id),
  }));
}

export function departmentDetail(ctx: OrgContext, deptId: string) {
  const d = T.departments.get(deptId);
  if (!d || d.orgId !== ctx.orgId) throw Errors.notFound('Department');
  const members = T.departmentMembers
    .where((x) => x.orgId === ctx.orgId && x.departmentId === deptId)
    .map((x) => ({ x, m: activeMember(ctx.orgId, x.memberId) }))
    .filter((y) => y.m)
    .map(({ x, m }) => ({ id: m!.id, name: T.users.get(m!.userId)?.name ?? 'Unknown', title: m!.title ?? null, presence: m!.presence, avatar: normalizeAvatar(m!.avatar), role: x.role }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'member' ? 1 : -1));
  let stats: Record<string, number> | null = null;
  if (ctx.canReadDept(deptId)) {
    stats = {};
    for (const t of T.tasks.where((t) => t.orgId === ctx.orgId && t.departmentId === deptId)) stats[t.status] = (stats[t.status] ?? 0) + 1;
    stats.incomingRequests = T.requests.where((r) => r.orgId === ctx.orgId && r.toDepartmentId === deptId && ['submitted', 'clarification_requested'].includes(r.state)).length;
  }
  return { id: d.id, name: d.name, description: d.description ?? null, theme: d.theme, color: d.color, floor: d.floor, canRead: ctx.canReadDept(deptId), canAdmin: ctx.canAdminDept(deptId), members, stats };
}

export async function createDepartment(ctx: OrgContext, input: z.infer<typeof createDepartmentSchema>) {
  ctx.assertCompanyAdmin();
  const n = T.departments.where((d) => d.orgId === ctx.orgId && d.floor === input.floor).length;
  if (n >= MAX_ROOMS_PER_FLOOR) throw Errors.conflict(`Floor ${input.floor} is full — choose another floor`);
  if (T.departments.find((d) => d.orgId === ctx.orgId && String(d.name).toLowerCase() === input.name.toLowerCase())) throw Errors.conflict('That already exists');
  const d = await T.departments.insert({ orgId: ctx.orgId, name: input.name, description: input.description ?? null, theme: input.theme, color: input.color ?? DEPT_THEME_DEFAULT_COLOR[input.theme], floor: input.floor, sortOrder: n, createdAt: nowIso() });
  await relayout(ctx.orgId, input.floor);
  await audit(ctx, 'department.create', { type: 'department', id: d.id }, { name: d.name });
  return d;
}

export async function updateDepartment(ctx: OrgContext, deptId: string, input: z.infer<typeof updateDepartmentSchema>) {
  const d = T.departments.get(deptId);
  if (!d || d.orgId !== ctx.orgId) throw Errors.notFound('Department');
  ctx.assertAdminDept(deptId);
  if ((input.name && input.name !== d.name) || (input.floor && input.floor !== d.floor)) ctx.assertCompanyAdmin();
  await T.departments.update(deptId, input);
  if (input.floor && input.floor !== d.floor) {
    await relayout(ctx.orgId, d.floor);
    await relayout(ctx.orgId, input.floor);
  }
  await audit(ctx, 'department.update', { type: 'department', id: deptId }, input);
  return { ok: true };
}

export async function deleteDepartment(ctx: OrgContext, deptId: string) {
  ctx.assertCompanyAdmin();
  const d = T.departments.get(deptId);
  if (!d || d.orgId !== ctx.orgId) throw Errors.notFound('Department');
  const n = T.projects.where((p) => p.orgId === ctx.orgId && p.departmentId === deptId).length;
  const r = T.requests.where((x) => x.orgId === ctx.orgId && (x.fromDepartmentId === deptId || x.toDepartmentId === deptId)).length;
  if (n > 0 || r > 0) throw Errors.conflict('Archive or move this department’s projects and requests before deleting it');
  await T.departments.remove(deptId);
  for (const x of T.departmentMembers.where((x) => x.departmentId === deptId)) await T.departmentMembers.remove(x.id);
  for (const a of T.agents.where((a) => a.departmentId === deptId)) await T.agents.remove(a.id);
  await relayout(ctx.orgId, d.floor);
  await audit(ctx, 'department.delete', { type: 'department', id: deptId }, { name: d.name });
  return { ok: true };
}

export async function setDepartmentMember(ctx: OrgContext, deptId: string, memberId: string, role: 'admin' | 'member') {
  ctx.assertAdminDept(deptId);
  if (role === 'admin') ctx.assertCompanyAdmin();
  assertDept(ctx.orgId, deptId);
  if (!activeMember(ctx.orgId, memberId)) throw Errors.notFound('Member');
  const key = `${deptId}_${memberId}`;
  const cur = T.departmentMembers.get(key);
  if (cur?.role === 'admin' && role === 'member') ctx.assertCompanyAdmin();
  if (cur) await T.departmentMembers.update(key, { role });
  else await T.departmentMembers.insert({ id: key, orgId: ctx.orgId, departmentId: deptId, memberId, role, createdAt: nowIso() });
  await audit(ctx, 'department.member.set', { type: 'department', id: deptId }, { memberId, role });
  return { ok: true };
}

export async function removeDepartmentMember(ctx: OrgContext, deptId: string, memberId: string) {
  ctx.assertAdminDept(deptId);
  const key = `${deptId}_${memberId}`;
  const cur = T.departmentMembers.get(key);
  if (!cur || cur.orgId !== ctx.orgId) throw Errors.notFound('Department member');
  if (cur.role === 'admin') ctx.assertCompanyAdmin();
  await T.departmentMembers.remove(key);
  await audit(ctx, 'department.member.set', { type: 'department', id: deptId }, { memberId, role: null });
  return { ok: true };
}

/* ---------------- office layout ---------------- */

export function office(ctx: OrgContext) {
  return T.officeLayouts
    .where((l) => l.orgId === ctx.orgId)
    .sort((a, b) => a.floor - b.floor)
    .map((l) => ({ floor: l.floor, rooms: l.rooms ?? [] }));
}

export async function updateOffice(ctx: OrgContext, input: z.infer<typeof updateOfficeLayoutSchema>) {
  ctx.assertCompanyAdmin();
  const ids = new Set(T.departments.where((d) => d.orgId === ctx.orgId && d.floor === input.floor).map((d) => d.id));
  if (input.rooms.some((r) => !ids.has(r.departmentId))) throw Errors.badRequest('Rooms must reference departments on this floor');
  await upsertLayout(ctx.orgId, input.floor, input.rooms);
  return { ok: true };
}

export async function relayout(orgId: string, floor: number) {
  const depts = T.departments.where((d) => d.orgId === orgId && d.floor === floor).sort((a, b) => a.sortOrder - b.sortOrder || String(a.createdAt).localeCompare(b.createdAt));
  const cur = T.officeLayouts.get(`${orgId}_${floor}`);
  await upsertLayout(orgId, floor, placeRooms(cur?.rooms ?? [], depts.map((d) => d.id)));
}

async function upsertLayout(orgId: string, floor: number, rooms: unknown[]) {
  const id = `${orgId}_${floor}`;
  if (T.officeLayouts.get(id)) await T.officeLayouts.update(id, { rooms, updatedAt: nowIso() });
  else await T.officeLayouts.insert({ id, orgId, floor, rooms, updatedAt: nowIso() });
}

export function auditLog(ctx: OrgContext) {
  ctx.assertCompanyAdmin();
  return T.auditLogs
    .where((a) => a.orgId === ctx.orgId)
    .sort(byDesc((a) => a.createdAt))
    .slice(0, 200)
    .map((a) => ({ ...a, actorName: T.users.get(a.actorUserId)?.name ?? null }));
}

function assertDept(orgId: string, deptId: string) {
  const d = T.departments.get(deptId);
  if (!d || d.orgId !== orgId) throw Errors.notFound('Department');
}
