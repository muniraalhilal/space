import { caps } from './caps';
/** Request router for the in-page API: same paths, inputs and responses as apps/api. */
import { z } from 'zod';
import {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  addDependencySchema,
  createCommentSchema,
  createRequestSchema,
  transitionRequestSchema,
  sendMessageSchema,
  openConversationSchema,
  createAgentSchema,
  updateAgentSchema,
  createAgentRunSchema,
  decideApprovalSchema,
  updateOrgSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateMeInOrgSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  setDepartmentMemberSchema,
  updateOfficeLayoutSchema,
} from '@space/shared';
import { AppError, Errors, OrgContext, loadOrgContext, parse } from './core';
import { store, StoreError } from './store';
import * as id from './identity';
import * as orgs from './orgs';
import * as work from './work';
import * as collab from './collab';
import * as files from './files';
import * as agents from './agents';

type Handler = (a: { ctx: OrgContext; p: Record<string, string>; q: URLSearchParams; body: any }) => unknown;
type Route = { method: string; re: RegExp; keys: string[]; fn: Handler };
const routes: Route[] = [];
const UUIDISH = '[A-Za-z0-9_-]+';
function on(method: string, path: string, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_m, k) => (keys.push(k), `(${UUIDISH})`)) + '$');
  routes.push({ method, re, keys, fn });
}

const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(4000).optional(),
    location: z.string().max(120).optional(),
    departmentId: z.string().uuid().nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    attendeeIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: 'End must be after start', path: ['endsAt'] });
const rangeSchema = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) });
const githubSchema = z.object({}).passthrough();
const q2o = (q: URLSearchParams) => Object.fromEntries(q.entries());
const isUuid = (s?: string | null) => !!s && /^[0-9a-f-]{36}$/i.test(s);

/* organisations */
on('GET', '/orgs/:orgId', ({ ctx }) => orgs.overview(ctx));
on('PATCH', '/orgs/:orgId', ({ ctx, body }) => orgs.updateOrg(ctx, parse(updateOrgSchema, body)));
on('PATCH', '/orgs/:orgId/me', ({ ctx, body }) => orgs.updateMe(ctx, parse(updateMeInOrgSchema, body)));
on('GET', '/orgs/:orgId/members', ({ ctx }) => orgs.listMembers(ctx));
on('POST', '/orgs/:orgId/members', ({ ctx, body }) => orgs.invite(ctx, parse(inviteMemberSchema, body)));
on('PATCH', '/orgs/:orgId/members/:memberId', ({ ctx, p, body }) => orgs.updateMember(ctx, p.memberId, parse(updateMemberSchema, body)));
on('DELETE', '/orgs/:orgId/members/:memberId', ({ ctx, p }) => orgs.removeMember(ctx, p.memberId));
on('GET', '/orgs/:orgId/departments', ({ ctx }) => orgs.listDepartments(ctx));
on('POST', '/orgs/:orgId/departments', ({ ctx, body }) => orgs.createDepartment(ctx, parse(createDepartmentSchema, body)));
on('GET', '/orgs/:orgId/departments/:deptId', ({ ctx, p }) => orgs.departmentDetail(ctx, p.deptId));
on('PATCH', '/orgs/:orgId/departments/:deptId', ({ ctx, p, body }) => orgs.updateDepartment(ctx, p.deptId, parse(updateDepartmentSchema, body)));
on('DELETE', '/orgs/:orgId/departments/:deptId', ({ ctx, p }) => orgs.deleteDepartment(ctx, p.deptId));
on('PUT', '/orgs/:orgId/departments/:deptId/members', ({ ctx, p, body }) => {
  const b = parse(setDepartmentMemberSchema, body);
  return orgs.setDepartmentMember(ctx, p.deptId, b.memberId, b.role);
});
on('DELETE', '/orgs/:orgId/departments/:deptId/members/:memberId', ({ ctx, p }) => orgs.removeDepartmentMember(ctx, p.deptId, p.memberId));
on('GET', '/orgs/:orgId/office', ({ ctx }) => orgs.office(ctx));
on('PUT', '/orgs/:orgId/office', ({ ctx, body }) => orgs.updateOffice(ctx, parse(updateOfficeLayoutSchema, body)));
on('GET', '/orgs/:orgId/audit', ({ ctx }) => orgs.auditLog(ctx));

/* projects & tasks */
on('GET', '/orgs/:orgId/projects', ({ ctx, q }) => work.listProjects(ctx, isUuid(q.get('departmentId')) ? q.get('departmentId')! : undefined));
on('POST', '/orgs/:orgId/projects', ({ ctx, body }) => work.createProject(ctx, parse(createProjectSchema, body)));
on('GET', '/orgs/:orgId/projects/:id', ({ ctx, p }) => work.getProject(ctx, p.id));
on('PATCH', '/orgs/:orgId/projects/:id', ({ ctx, p, body }) => work.updateProject(ctx, p.id, parse(updateProjectSchema, body)));
on('DELETE', '/orgs/:orgId/projects/:id', ({ ctx, p }) => work.removeProject(ctx, p.id));
on('GET', '/orgs/:orgId/tasks', ({ ctx, q }) => work.listTasks(ctx, parse(taskQuerySchema, q2o(q))));
on('POST', '/orgs/:orgId/tasks', ({ ctx, body }) => work.createTask(ctx, parse(createTaskSchema, body)));
on('GET', '/orgs/:orgId/tasks/:id', ({ ctx, p }) => work.getTask(ctx, p.id));
on('PATCH', '/orgs/:orgId/tasks/:id', ({ ctx, p, body }) => work.updateTask(ctx, p.id, parse(updateTaskSchema, body)));
on('DELETE', '/orgs/:orgId/tasks/:id', ({ ctx, p }) => work.removeTask(ctx, p.id));
on('POST', '/orgs/:orgId/tasks/:id/dependencies', ({ ctx, p, body }) => work.addDependency(ctx, p.id, parse(addDependencySchema, body).dependsOnId));
on('DELETE', '/orgs/:orgId/tasks/:id/dependencies/:depId', ({ ctx, p }) => work.removeDependency(ctx, p.id, p.depId));
on('POST', '/orgs/:orgId/tasks/:id/comments', ({ ctx, p, body }) => work.addTaskComment(ctx, p.id, parse(createCommentSchema, body).body));

/* requests */
on('GET', '/orgs/:orgId/requests', ({ ctx, q }) => {
  const box = q.get('box');
  return collab.listRequests(ctx, box === 'incoming' || box === 'outgoing' ? box : 'all', q.get('state') ?? undefined);
});
on('POST', '/orgs/:orgId/requests', ({ ctx, body }) => collab.createRequest(ctx, parse(createRequestSchema, body)));
on('GET', '/orgs/:orgId/requests/:id', ({ ctx, p }) => collab.getRequest(ctx, p.id));
on('POST', '/orgs/:orgId/requests/:id/transitions', ({ ctx, p, body }) => collab.transitionRequest(ctx, p.id, parse(transitionRequestSchema, body)));
on('POST', '/orgs/:orgId/requests/:id/comments', ({ ctx, p, body }) => collab.addRequestComment(ctx, p.id, parse(createCommentSchema, body).body));

/* messages & notifications */
on('GET', '/orgs/:orgId/conversations', ({ ctx }) => collab.listConversations(ctx));
on('POST', '/orgs/:orgId/conversations', ({ ctx, body }) => collab.openConversation(ctx, parse(openConversationSchema, body).memberId));
on('GET', '/orgs/:orgId/conversations/:id/messages', ({ ctx, p }) => collab.listMessages(ctx, p.id));
on('POST', '/orgs/:orgId/conversations/:id/messages', ({ ctx, p, body }) => collab.sendMessage(ctx, p.id, parse(sendMessageSchema, body).body));
on('POST', '/orgs/:orgId/conversations/:id/read', ({ ctx, p }) => collab.markConversationRead(ctx, p.id));
on('GET', '/orgs/:orgId/notifications', ({ ctx, q }) => collab.listNotifications(ctx, q.get('unread') === 'true'));
on('POST', '/orgs/:orgId/notifications/:id/read', ({ ctx, p }) => collab.markNotificationsRead(ctx, p.id));

/* calendar & reports */
on('GET', '/orgs/:orgId/calendar', ({ ctx, q }) => {
  const r = parse(rangeSchema, q2o(q));
  return collab.calendarRange(ctx, r.from, r.to);
});
on('GET', '/orgs/:orgId/calendar/next/:memberId', ({ ctx, p }) => collab.nextEventFor(ctx, p.memberId));
on('POST', '/orgs/:orgId/calendar', ({ ctx, body }) => collab.createEvent(ctx, parse(eventSchema, body)));
on('DELETE', '/orgs/:orgId/calendar/:id', ({ ctx, p }) => collab.removeEvent(ctx, p.id));
on('GET', '/orgs/:orgId/reports/summary', ({ ctx, q }) => collab.reportSummary(ctx, Math.min(Math.max(parseInt(q.get('days') ?? '14', 10) || 14, 1), 180)));
on('GET', '/orgs/:orgId/reports/activity', ({ ctx, q }) => collab.recentActivity(ctx, Math.min(Math.max(parseInt(q.get('limit') ?? '8', 10) || 8, 1), 50)));

/* files */
on('GET', '/orgs/:orgId/files', ({ ctx, q }) => files.listFiles(ctx, { departmentId: isUuid(q.get('departmentId')) ? q.get('departmentId')! : undefined, knowledge: q.get('knowledge') === 'true' }));
on('POST', '/orgs/:orgId/files', ({ ctx, body }) => files.uploadFile(ctx, body as FormData));
on('GET', '/orgs/:orgId/files/:id/download', ({ ctx, p }) => files.fileForDownload(ctx, p.id));
on('DELETE', '/orgs/:orgId/files/:id', ({ ctx, p }) => files.removeFile(ctx, p.id));

/* agents */
on('GET', '/orgs/:orgId/agents', ({ ctx }) => agents.listAgents(ctx));
on('GET', '/orgs/:orgId/agents/meta', () => agents.meta());
on('POST', '/orgs/:orgId/agents', ({ ctx, body }) => agents.createAgent(ctx, parse(createAgentSchema, body)));
on('GET', '/orgs/:orgId/agents/:id', ({ ctx, p }) => agents.getAgent(ctx, p.id));
on('PATCH', '/orgs/:orgId/agents/:id', ({ ctx, p, body }) => agents.updateAgent(ctx, p.id, parse(updateAgentSchema, body)));
on('POST', '/orgs/:orgId/agents/:id/runs', ({ ctx, p, body }) => agents.createRun(ctx, p.id, parse(createAgentRunSchema, body)));
on('GET', '/orgs/:orgId/agent-runs', ({ ctx, q }) => agents.listRuns(ctx, isUuid(q.get('agentId')) ? q.get('agentId')! : undefined, isUuid(q.get('departmentId')) ? q.get('departmentId')! : undefined));
on('GET', '/orgs/:orgId/agent-runs/:runId', ({ ctx, p }) => agents.getRun(ctx, p.runId));
on('POST', '/orgs/:orgId/agent-runs/:runId/cancel', ({ ctx, p }) => agents.cancelRun(ctx, p.runId));
on('GET', '/orgs/:orgId/agent-approvals', ({ ctx }) => agents.pendingApprovals(ctx));
on('POST', '/orgs/:orgId/agent-approvals/:id/decision', ({ ctx, p, body }) => agents.decide(ctx, p.id, parse(decideApprovalSchema, body)));
on('GET', '/orgs/:orgId/integrations/github', ({ ctx }) => agents.getGithub(ctx));
on('PUT', '/orgs/:orgId/integrations/github', ({ ctx, body }) => (parse(githubSchema, body), agents.setGithub(ctx)));

/** Public (no company context) routes. */
async function publicRoute(method: string, path: string, body: unknown) {
  if (method === 'GET' && path === '/auth/me') return id.me();
  if (method === 'GET' && path === '/auth/people') return { people: id.people(), companies: id.joinable(), viewerName: await id.viewerName(), signedIn: !!id.currentUser(), account: id.account(), demo: caps.platform === 'demo' };
  if (method === 'POST' && path === '/auth/login') return id.signInAs(body);
  if (method === 'POST' && path === '/auth/join') return id.joinAsSelf(body);
  if (method === 'POST' && path === '/auth/logout') return id.signOut();
  if (method === 'POST' && path === '/auth/account/logout') {
    await id.signOut();
    await caps.signOut?.();
    return { ok: true };
  }
  if (method === 'PATCH' && path === '/auth/me/preferences') return id.setPreferences(body);
  if (method === 'POST' && path === '/orgs') return id.createCompany(body);
  if (method === 'GET' && path === '/health') return { status: store.status };
  return undefined;
}

export async function handle(method: string, url: string, body: unknown): Promise<unknown> {
  await store.ready();
  if (store.status === 'unavailable') throw new AppError('UNAVAILABLE', caps.platform === 'web' ? 'Sign in to use this Space.' : 'Sign in to use this Space.', 503);
  const [path, qs = ''] = url.split('?');
  const q = new URLSearchParams(qs);
  try {
    const pub = await publicRoute(method, path, body);
    if (pub !== undefined) return pub;
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const p = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const user = id.requireUser();
      const ctx = loadOrgContext(p.orgId, user.id);
      // Non-members get 404, exactly like the server: other companies' existence is not revealed.
      if (!ctx) throw Errors.notFound('Company');
      return await r.fn({ ctx, p, q, body });
    }
    throw Errors.notFound('Route');
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof StoreError) throw new AppError('STORE', e.message, 503);
    console.error(e);
    throw new AppError('INTERNAL', (e as Error)?.message ?? 'Something went wrong', 500);
  }
}
