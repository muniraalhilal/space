/** Requests, messages, notifications, calendar and reports (ported from apps/api). */
import { availableActions, evaluateTransition, createRequestSchema, transitionRequestSchema, REQUEST_STATE_LABEL, normalizeAvatar, type RequestSide, type RequestState } from '@space/shared';
import type { z } from 'zod';
import { T, nowIso } from './store';
import { Errors, OrgContext, audit, recordActivity, notify, byAsc, byDesc, userName, agentName } from './core';

/* ------------------------------------------------------------------ requests */

const CLOSED = ['completed', 'rejected', 'cancelled'];

function sides(ctx: OrgContext, r: { fromDepartmentId: string; toDepartmentId: string }): RequestSide[] {
  const s: RequestSide[] = [];
  if (ctx.canAdminDept(r.fromDepartmentId)) s.push('requester');
  if (ctx.canAdminDept(r.toDepartmentId)) s.push('receiver');
  return s;
}
const visible = (ctx: OrgContext, r: any) => ctx.canReadDept(r.fromDepartmentId) || ctx.canReadDept(r.toDepartmentId);
const deptRef = (id: string) => {
  const d = T.departments.get(id);
  return { id, name: d?.name ?? 'Unknown', theme: d?.theme ?? 'general', color: d?.color ?? '#b9b5c2' };
};

export function listRequests(ctx: OrgContext, box: 'incoming' | 'outgoing' | 'all', state?: string, onlyId?: string) {
  const readable = ctx.readableDeptIds();
  if (readable && !readable.length) return [];
  const rows = T.requests.where((r) => {
    if (r.orgId !== ctx.orgId) return false;
    if (readable) {
      if (box === 'incoming' && !readable.includes(r.toDepartmentId)) return false;
      if (box === 'outgoing' && !readable.includes(r.fromDepartmentId)) return false;
      if (box === 'all' && !(readable.includes(r.toDepartmentId) || readable.includes(r.fromDepartmentId))) return false;
    }
    if (onlyId && r.id !== onlyId) return false;
    if (state === 'open' && CLOSED.includes(r.state)) return false;
    if (state === 'closed' && !CLOSED.includes(r.state)) return false;
    return true;
  });
  return rows
    .sort(byDesc((r) => r.updatedAt))
    .slice(0, 200)
    .map((r) => {
      const { events: _e, ...rest } = r;
      const ts = T.tasks.where((t) => t.requestId === r.id);
      return {
        ...rest,
        from: deptRef(r.fromDepartmentId),
        to: deptRef(r.toDepartmentId),
        creatorName: userName(r.createdByMemberId) ?? 'Unknown',
        progress: { total: ts.length, done: ts.filter((t) => t.status === 'done').length },
        actions: availableActions(r.state as RequestState, sides(ctx, r)),
      };
    });
}

function loadRequest(ctx: OrgContext, id: string) {
  const r = T.requests.get(id);
  if (!r || r.orgId !== ctx.orgId || !visible(ctx, r)) throw Errors.notFound('Request');
  return r;
}

export function getRequest(ctx: OrgContext, id: string) {
  const raw = loadRequest(ctx, id);
  const [r] = listRequests(ctx, 'all', undefined, id);
  if (!r) throw Errors.notFound('Request');
  return {
    ...r,
    events: (raw.events ?? []).map((e: any) => ({ ...e, actorName: userName(e.actorMemberId) })),
    comments: T.comments
      .where((c) => c.orgId === ctx.orgId && c.requestId === id)
      .sort(byAsc((c) => c.createdAt))
      .map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, authorMemberId: c.authorMemberId, authorName: userName(c.authorMemberId) ?? agentName(c.authorAgentId) })),
    tasks: T.tasks
      .where((t) => t.orgId === ctx.orgId && t.requestId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, progress: t.progress, dueDate: t.dueDate, assigneeMemberId: t.assigneeMemberId, assigneeAgentId: t.assigneeAgentId })),
    files: T.files.where((f) => f.orgId === ctx.orgId && f.requestId === id && !f.deletedAt).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt })),
    sides: sides(ctx, raw),
    canComment: !ctx.isViewer,
    canPlan: ctx.canAdminDept(raw.toDepartmentId),
  };
}

const deptAdmins = (orgId: string, deptId: string) => T.departmentMembers.where((d) => d.orgId === orgId && d.departmentId === deptId && d.role === 'admin').map((d) => d.memberId);
const event = (ctx: OrgContext, action: string, fromState: string | null, toState: string, note?: string | null) => ({ id: crypto.randomUUID(), actorMemberId: ctx.memberId, action, fromState, toState, note: note ?? null, createdAt: nowIso() });

export async function createRequest(ctx: OrgContext, input: z.infer<typeof createRequestSchema>) {
  if (input.fromDepartmentId === input.toDepartmentId) throw Errors.validation({ fieldErrors: { toDepartmentId: ['Choose a different department'] } });
  ctx.assertAdminDept(input.fromDepartmentId, 'Only admins of the requesting department can send requests');
  const from = T.departments.get(input.fromDepartmentId);
  const to = T.departments.get(input.toDepartmentId);
  if (!from || !to || from.orgId !== ctx.orgId || to.orgId !== ctx.orgId) throw Errors.notFound('Department');
  const org = T.organizations.get(ctx.orgId)!;
  const seq = Math.max(Number(org.requestSeq) || 0, ...T.requests.where((r) => r.orgId === ctx.orgId).map((r) => r.number)) + 1;
  await T.organizations.update(ctx.orgId, { requestSeq: seq });
  const r = await T.requests.insert({
    orgId: ctx.orgId,
    number: seq,
    fromDepartmentId: input.fromDepartmentId,
    toDepartmentId: input.toDepartmentId,
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: input.dueDate?.slice(0, 10) ?? null,
    labels: input.labels ?? [],
    state: 'submitted',
    version: 0,
    createdByMemberId: ctx.memberId,
    deliveredAt: null,
    completedAt: null,
    events: [event(ctx, 'create', null, 'submitted')],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await recordActivity({ orgId: ctx.orgId, entityType: 'request', entityId: r.id, departmentId: r.toDepartmentId, actorMemberId: ctx.memberId, verb: 'created' });
  await audit(ctx, 'request.create', { type: 'request', id: r.id }, { to: r.toDepartmentId });
  await notify(ctx.orgId, deptAdmins(ctx.orgId, r.toDepartmentId), { kind: 'request_received', title: `${from.name} sent a request: ${r.title}`, entityType: 'request', entityId: r.id }, ctx.memberId);
  const { events: _e, ...out } = r;
  return out;
}

export async function transitionRequest(ctx: OrgContext, id: string, input: z.infer<typeof transitionRequestSchema>) {
  const r = loadRequest(ctx, id);
  if (r.version !== input.version) throw Errors.version();
  const verdict = evaluateTransition(r.state as RequestState, input.action, sides(ctx, r), input.note);
  if (!verdict.ok) {
    if (verdict.code === 'FORBIDDEN_SIDE') throw Errors.forbidden(verdict.message);
    if (verdict.code === 'NOTE_REQUIRED') throw Errors.validation({ fieldErrors: { note: [verdict.message] } });
    throw Errors.transition(verdict.message);
  }
  const now = nowIso();
  const updated = await T.requests.update(id, {
    state: verdict.to,
    version: r.version + 1,
    updatedAt: now,
    ...(verdict.to === 'delivered' && { deliveredAt: now }),
    ...(verdict.to === 'completed' && { completedAt: now }),
    events: [...(r.events ?? []), event(ctx, input.action, r.state, verdict.to, input.note?.trim() || null)],
  });
  await recordActivity({ orgId: ctx.orgId, entityType: 'request', entityId: id, departmentId: r.toDepartmentId, actorMemberId: ctx.memberId, verb: input.action, data: { from: r.state, to: verdict.to } });
  await audit(ctx, 'request.transition', { type: 'request', id }, { action: input.action, from: r.state, to: verdict.to });
  await notify(
    ctx.orgId,
    new Set([...deptAdmins(ctx.orgId, r.fromDepartmentId), ...deptAdmins(ctx.orgId, r.toDepartmentId), r.createdByMemberId]),
    { kind: 'request_updated', title: `#${r.number} ${r.title}: ${REQUEST_STATE_LABEL[verdict.to]}`, body: input.note?.slice(0, 160), entityType: 'request', entityId: id },
    ctx.memberId,
  );
  const { events: _e, ...out } = updated;
  return out;
}

export async function addRequestComment(ctx: OrgContext, id: string, body: string) {
  ctx.assertNotViewer();
  const r = loadRequest(ctx, id);
  const c = await T.comments.insert({ orgId: ctx.orgId, taskId: null, requestId: id, authorMemberId: ctx.memberId, authorAgentId: null, agentRunId: null, body, createdAt: nowIso() });
  await notify(ctx.orgId, new Set([...deptAdmins(ctx.orgId, r.fromDepartmentId), ...deptAdmins(ctx.orgId, r.toDepartmentId), r.createdByMemberId]), { kind: 'request_comment', title: `Comment on #${r.number} ${r.title}`, body: body.slice(0, 140), entityType: 'request', entityId: id }, ctx.memberId);
  return c;
}

/* ------------------------------------------------------------------ notifications */

export function listNotifications(ctx: OrgContext, unreadOnly: boolean) {
  const mine = T.notifications.where((n) => n.orgId === ctx.orgId && n.recipientMemberId === ctx.memberId);
  return { items: mine.filter((n) => !unreadOnly || !n.readAt).sort(byDesc((n) => n.createdAt)).slice(0, 100), unread: mine.filter((n) => !n.readAt).length };
}

export async function markNotificationsRead(ctx: OrgContext, id: string) {
  const targets = T.notifications.where((n) => n.orgId === ctx.orgId && n.recipientMemberId === ctx.memberId && !n.readAt && (id === 'all' || n.id === id));
  for (const n of targets) await T.notifications.update(n.id, { readAt: nowIso() });
  return { ok: true };
}

/* ------------------------------------------------------------------ messages */

export function listConversations(ctx: OrgContext) {
  const mine = T.conversations.where((c) => c.orgId === ctx.orgId && c.members && ctx.memberId in c.members).sort(byDesc((c) => c.lastMessageAt));
  return mine.map((c) => {
    const otherId = Object.keys(c.members).find((m) => m !== ctx.memberId);
    const om = T.orgMembers.get(otherId);
    const msgs = T.messages.where((m) => m.conversationId === c.id).sort(byDesc((m) => m.createdAt));
    const lastRead = c.members[ctx.memberId];
    return {
      id: c.id,
      other: om ? { id: om.id, name: T.users.get(om.userId)?.name ?? 'Unknown', title: om.title ?? null, avatar: normalizeAvatar(om.avatar), presence: om.presence } : null,
      lastMessage: msgs[0] ?? null,
      unread: msgs.filter((m) => m.senderMemberId !== ctx.memberId && (!lastRead || m.createdAt > lastRead)).length,
    };
  });
}

export async function openConversation(ctx: OrgContext, otherId: string) {
  if (otherId === ctx.memberId) throw Errors.badRequest('You cannot message yourself');
  const other = T.orgMembers.get(otherId);
  if (!other || other.orgId !== ctx.orgId || other.deactivatedAt) throw Errors.notFound('Member');
  const dmKey = [ctx.memberId, otherId].sort().join(':');
  const existing = T.conversations.find((c) => c.orgId === ctx.orgId && c.dmKey === dmKey);
  if (existing) return { id: existing.id };
  // Deterministic id so two people opening the same DM at once land in one thread.
  const id = `dm-${dmKey.replace(':', '-')}`;
  await T.conversations.insert({ id, orgId: ctx.orgId, dmKey, members: { [ctx.memberId]: null, [otherId]: null }, lastMessageAt: null, createdAt: nowIso() });
  return { id };
}

function assertConversation(ctx: OrgContext, id: string) {
  const c = T.conversations.get(id);
  if (!c || c.orgId !== ctx.orgId || !(ctx.memberId in (c.members ?? {}))) throw Errors.notFound('Conversation');
  return c;
}

export function listMessages(ctx: OrgContext, id: string) {
  assertConversation(ctx, id);
  return T.messages.where((m) => m.conversationId === id).sort(byAsc((m) => m.createdAt)).slice(-100);
}

export async function sendMessage(ctx: OrgContext, id: string, body: string) {
  const c = assertConversation(ctx, id);
  const msg = await T.messages.insert({ orgId: ctx.orgId, conversationId: id, senderMemberId: ctx.memberId, body, createdAt: nowIso() });
  await T.conversations.update(id, { lastMessageAt: msg.createdAt, members: { ...c.members, [ctx.memberId]: msg.createdAt } });
  return msg;
}

export async function markConversationRead(ctx: OrgContext, id: string) {
  const c = assertConversation(ctx, id);
  await T.conversations.update(id, { members: { ...c.members, [ctx.memberId]: nowIso() } });
  return { ok: true };
}

/* ------------------------------------------------------------------ calendar */

export function calendarRange(ctx: OrgContext, from: string, to: string) {
  const readable = ctx.readableDeptIds();
  const events = T.events
    .where((e) => e.orgId === ctx.orgId && e.startsAt < new Date(to).toISOString() && e.endsAt >= new Date(from).toISOString())
    .filter((e) => !readable || !e.departmentId || readable.includes(e.departmentId) || (e.attendeeIds ?? []).includes(ctx.memberId))
    .sort(byAsc((e) => e.startsAt))
    .map((e) => ({ ...e, attendeeIds: e.attendeeIds ?? [] }));
  const tasks = T.tasks
    .where((t) => t.orgId === ctx.orgId && t.dueDate && t.dueDate >= from.slice(0, 10) && t.dueDate < to.slice(0, 10) && (!readable || readable.includes(t.departmentId)))
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status, priority: t.priority, departmentId: t.departmentId, assigneeMemberId: t.assigneeMemberId }));
  return { events, tasks };
}

export function nextEventFor(ctx: OrgContext, memberId: string) {
  const now = nowIso();
  return T.events.where((e) => e.orgId === ctx.orgId && (e.attendeeIds ?? []).includes(memberId) && e.endsAt >= now).sort(byAsc((e) => e.startsAt))[0] ?? null;
}

export async function createEvent(ctx: OrgContext, input: { title: string; description?: string; location?: string; departmentId?: string | null; startsAt: string; endsAt: string; attendeeIds: string[] }) {
  ctx.assertNotViewer();
  if (input.departmentId) ctx.assertWriteDept(input.departmentId);
  return T.events.insert({
    orgId: ctx.orgId,
    departmentId: input.departmentId ?? null,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startsAt: new Date(input.startsAt).toISOString(),
    endsAt: new Date(input.endsAt).toISOString(),
    createdByMemberId: ctx.memberId,
    attendeeIds: [...new Set([ctx.memberId, ...input.attendeeIds])],
    createdAt: nowIso(),
  });
}

export async function removeEvent(ctx: OrgContext, id: string) {
  const ev = T.events.get(id);
  if (!ev || ev.orgId !== ctx.orgId) throw Errors.notFound('Event');
  if (ev.createdByMemberId !== ctx.memberId && !(ev.departmentId ? ctx.canAdminDept(ev.departmentId) : ctx.isCompanyAdmin)) throw Errors.forbidden();
  await T.events.remove(id);
  return { ok: true };
}

/* ------------------------------------------------------------------ reports */

export function reportSummary(ctx: OrgContext, days: number) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const readable = ctx.readableDeptIds();
  const inScope = (d: string | null | undefined) => !readable || (!!d && readable.includes(d));
  const depts = T.departments.where((d) => d.orgId === ctx.orgId && inScope(d.id));
  const tasks = T.tasks.where((t) => t.orgId === ctx.orgId && inScope(t.departmentId));
  const today = new Date().toISOString().slice(0, 10);
  const daily: Record<string, number> = {};
  for (const t of tasks) if (t.completedAt && t.completedAt >= since) daily[t.completedAt.slice(0, 10)] = (daily[t.completedAt.slice(0, 10)] ?? 0) + 1;
  const reqs = T.requests.where((r) => r.orgId === ctx.orgId && (!readable || readable.includes(r.fromDepartmentId) || readable.includes(r.toDepartmentId)));
  const requests: Record<string, number> = {};
  for (const r of reqs) requests[r.state] = (requests[r.state] ?? 0) + 1;
  const load = new Map<string, number>();
  for (const t of tasks) if (t.assigneeMemberId && t.status !== 'done') load.set(t.assigneeMemberId, (load.get(t.assigneeMemberId) ?? 0) + 1);
  const runs = T.agentRuns.where((r) => r.orgId === ctx.orgId && inScope(r.departmentId) && r.createdAt >= since);
  const runStats = new Map<string, { count: number; cost: number }>();
  for (const r of runs) {
    const s = runStats.get(r.status) ?? { count: 0, cost: 0 };
    s.count++;
    s.cost += Number(r.costUsd) || 0;
    runStats.set(r.status, s);
  }
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const highlights = T.activities
    .where((a) => a.orgId === ctx.orgId && inScope(a.departmentId) && a.createdAt >= dayAgo && ['status_changed', 'created', 'accept', 'deliver', 'approve'].includes(a.verb))
    .sort(byDesc((a) => a.createdAt))
    .slice(0, 20)
    .map((a) => ({ id: a.id, verb: a.verb, entityType: a.entityType, entityId: a.entityId, data: a.data, actor: userName(a.actorMemberId) ?? agentName(a.actorAgentId), title: activityTitle(a), createdAt: a.createdAt }));
  return {
    windowDays: days,
    generatedAt: nowIso(),
    departments: depts.map((d) => {
      const st = tasks.filter((t) => t.departmentId === d.id);
      const byStatus: Record<string, number> = {};
      for (const t of st) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      return {
        id: d.id,
        name: d.name,
        theme: d.theme,
        color: d.color,
        total: st.length,
        byStatus,
        completedInWindow: st.filter((t) => t.completedAt && t.completedAt >= since).length,
        overdue: st.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'done').length,
      };
    }),
    dailyCompletions: Object.entries(daily)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, n]) => ({ day, n })),
    requests,
    workload: [...load.entries()]
      .map(([memberId, n]) => ({ memberId, name: userName(memberId) ?? 'Unknown', n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 15),
    agentRuns: [...runStats.entries()].map(([status, s]) => ({ status, count: s.count, costUsd: s.cost })),
    highlights,
  };
}

function activityTitle(a: any) {
  if (a.entityType === 'task') return T.tasks.get(a.entityId)?.title ?? (a.data?.title as string) ?? null;
  if (a.entityType === 'request') return T.requests.get(a.entityId)?.title ?? null;
  if (a.entityType === 'project') return T.projects.get(a.entityId)?.name ?? null;
  return null;
}

export function recentActivity(ctx: OrgContext, limit: number) {
  const readable = ctx.readableDeptIds();
  return T.activities
    .where((a) => a.orgId === ctx.orgId && (!readable || (!!a.departmentId && readable.includes(a.departmentId))))
    .sort(byDesc((a) => a.createdAt))
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      verb: a.verb,
      entityType: a.entityType,
      entityId: a.entityId,
      departmentId: a.departmentId,
      departmentName: T.departments.get(a.departmentId)?.name ?? null,
      data: a.data ?? {},
      createdAt: a.createdAt,
      actor: userName(a.actorMemberId) ?? agentName(a.actorAgentId),
      actorIsAgent: !!a.actorAgentId,
      title: activityTitle(a),
    }));
}
