/** Projects, tasks, dependencies and comments (ported from apps/api/src/tasks + projects). */
import { createProjectSchema, updateProjectSchema, createTaskSchema, updateTaskSchema, taskQuerySchema, TASK_STATUS_LABEL, type TaskStatus } from '@space/shared';
import type { z } from 'zod';
import { T, nowIso } from './store';
import { Errors, OrgContext, audit, recordActivity, notify, byAsc, byDesc, userName, agentName } from './core';

type Assignee = { kind: 'member' | 'agent'; id: string } | null | undefined;

/* ---------------------------------------------------------------- projects */

export function listProjects(ctx: OrgContext, departmentId?: string) {
  const readable = ctx.readableDeptIds();
  if (departmentId && !ctx.canReadDept(departmentId)) return [];
  const projects = T.projects
    .where((p) => p.orgId === ctx.orgId && (departmentId ? p.departmentId === departmentId : !readable || readable.includes(p.departmentId)))
    .sort(byAsc((p) => p.name));
  return projects.map((p) => {
    const ts = T.tasks.where((t) => t.projectId === p.id && !t.parentId);
    return { ...p, taskCount: ts.length, doneCount: ts.filter((t) => t.status === 'done').length, canAdmin: ctx.canAdminDept(p.departmentId) };
  });
}

export function getProject(ctx: OrgContext, id: string) {
  const p = T.projects.get(id);
  if (!p || p.orgId !== ctx.orgId) throw Errors.notFound('Project');
  ctx.assertReadDept(p.departmentId, 'Project');
  return { ...p, canAdmin: ctx.canAdminDept(p.departmentId), canWrite: ctx.canWriteDept(p.departmentId) };
}

export async function createProject(ctx: OrgContext, input: z.infer<typeof createProjectSchema>) {
  ctx.assertAdminDept(input.departmentId);
  const dept = T.departments.get(input.departmentId);
  if (!dept || dept.orgId !== ctx.orgId) throw Errors.notFound('Department');
  const p = await T.projects.insert({
    orgId: ctx.orgId,
    departmentId: input.departmentId,
    name: input.name,
    description: input.description ?? null,
    status: 'active',
    dueDate: input.dueDate?.slice(0, 10) ?? null,
    color: input.color ?? dept.color,
    createdByMemberId: ctx.memberId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await recordActivity({ orgId: ctx.orgId, entityType: 'project', entityId: p.id, departmentId: p.departmentId, actorMemberId: ctx.memberId, verb: 'created' });
  await audit(ctx, 'project.create', { type: 'project', id: p.id }, { name: p.name });
  return p;
}

export async function updateProject(ctx: OrgContext, id: string, input: z.infer<typeof updateProjectSchema>) {
  const p = getProject(ctx, id);
  ctx.assertAdminDept(p.departmentId);
  const patch: Record<string, unknown> = { ...input, updatedAt: nowIso() };
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate?.slice(0, 10) ?? null;
  await T.projects.update(id, patch);
  await audit(ctx, 'project.update', { type: 'project', id }, input);
  return { ok: true };
}

export async function removeProject(ctx: OrgContext, id: string) {
  const p = getProject(ctx, id);
  ctx.assertAdminDept(p.departmentId);
  for (const t of T.tasks.where((t) => t.projectId === id)) await deleteTaskCascade(t.id);
  await T.projects.remove(id);
  await audit(ctx, 'project.delete', { type: 'project', id }, { name: p.name });
  return { ok: true };
}

/* ---------------------------------------------------------------- tasks */

export function listTasks(ctx: OrgContext, q: z.infer<typeof taskQuerySchema>) {
  const readable = ctx.readableDeptIds();
  const term = q.q?.toLowerCase();
  const rows = T.tasks.where((t) => {
    if (t.orgId !== ctx.orgId) return false;
    if (readable && !readable.includes(t.departmentId)) return false;
    if (q.projectId && t.projectId !== q.projectId) return false;
    if (q.departmentId && t.departmentId !== q.departmentId) return false;
    if (q.assignee === 'me' && !(t.assigneeMemberId === ctx.memberId || (t.collaboratorIds ?? []).includes(ctx.memberId))) return false;
    if (q.assignee && q.assignee !== 'me' && t.assigneeMemberId !== q.assignee && t.assigneeAgentId !== q.assignee) return false;
    if (q.status && t.status !== q.status) return false;
    if (q.priority && t.priority !== q.priority) return false;
    if (term && !String(t.title).toLowerCase().includes(term)) return false;
    if (q.dueFrom && !(t.dueDate && t.dueDate >= q.dueFrom.slice(0, 10))) return false;
    if (q.dueTo && !(t.dueDate && t.dueDate <= q.dueTo.slice(0, 10))) return false;
    if (q.parentId === 'root' && t.parentId) return false;
    if (q.parentId && q.parentId !== 'root' && t.parentId !== q.parentId) return false;
    return true;
  });
  rows.sort((a, b) => a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? 1 : -1));
  return rows.slice(0, q.limit).map((t) => {
    const p = T.projects.get(t.projectId);
    const subs = T.tasks.where((s) => s.parentId === t.id);
    return {
      ...publicTask(t),
      projectName: p?.name ?? '',
      projectColor: p?.color ?? null,
      subtaskCount: subs.length,
      subtaskDone: subs.filter((s) => s.status === 'done').length,
      commentCount: T.comments.where((c) => c.taskId === t.id).length,
    };
  });
}

/** Strip storage-only fields so responses match the server API. */
function publicTask(t: any) {
  const { collaboratorIds: _c, dependsOn: _d, ...rest } = t;
  return rest;
}

function load(ctx: OrgContext, id: string) {
  const t = T.tasks.get(id);
  if (!t || t.orgId !== ctx.orgId) throw Errors.notFound('Task');
  ctx.assertReadDept(t.departmentId, 'Task');
  return t;
}

export function listComments(ctx: OrgContext, taskId: string) {
  return T.comments
    .where((c) => c.orgId === ctx.orgId && c.taskId === taskId)
    .sort(byAsc((c) => c.createdAt))
    .map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, authorMemberId: c.authorMemberId ?? null, authorAgentId: c.authorAgentId ?? null, agentRunId: c.agentRunId ?? null, authorName: userName(c.authorMemberId) ?? agentName(c.authorAgentId) }));
}

export function getTask(ctx: OrgContext, id: string) {
  const t = load(ctx, id);
  const project = T.projects.get(t.projectId);
  const pick = (x: any) => ({ id: x.id, title: x.title, status: x.status });
  const r = t.requestId ? T.requests.get(t.requestId) : null;
  const parent = t.parentId ? T.tasks.get(t.parentId) : null;
  return {
    ...publicTask(t),
    project: { id: project?.id, name: project?.name, color: project?.color ?? null },
    parent: parent ? { id: parent.id, title: parent.title } : null,
    subtasks: T.tasks.where((s) => s.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder).map(publicTask),
    dependencies: (t.dependsOn ?? []).map((d: string) => T.tasks.get(d)).filter(Boolean).map(pick),
    blocking: T.tasks.where((x) => (x.dependsOn ?? []).includes(id)).map(pick),
    collaboratorIds: t.collaboratorIds ?? [],
    comments: listComments(ctx, id),
    activity: T.activities.where((a) => a.orgId === ctx.orgId && a.entityType === 'task' && a.entityId === id).sort(byDesc((a) => a.createdAt)).slice(0, 50),
    files: T.files.where((f) => f.orgId === ctx.orgId && f.taskId === id && !f.deletedAt).map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt })),
    request: r ? { id: r.id, number: r.number, title: r.title, state: r.state } : null,
    canWrite: ctx.canWriteDept(t.departmentId),
    canAdmin: ctx.canAdminDept(t.departmentId),
  };
}

function validateAssignee(ctx: OrgContext, deptId: string, a: Assignee) {
  if (!a) return { assigneeMemberId: null, assigneeAgentId: null };
  if (a.kind === 'member') {
    const dm = T.departmentMembers.get(`${deptId}_${a.id}`);
    const m = T.orgMembers.get(a.id);
    if (!dm || !m || m.deactivatedAt || m.orgId !== ctx.orgId) throw Errors.validation({ fieldErrors: { assignee: ['Assignee must be a member of this department'] } });
    return { assigneeMemberId: a.id, assigneeAgentId: null };
  }
  const ag = T.agents.get(a.id);
  if (!ag || ag.orgId !== ctx.orgId || !ag.enabled || (ag.departmentId && ag.departmentId !== deptId)) throw Errors.validation({ fieldErrors: { assignee: ['This AI agent is not available to this department'] } });
  return { assigneeMemberId: null, assigneeAgentId: a.id };
}

function validateCollaborators(deptId: string, ids: string[]) {
  if (ids.some((id) => !T.departmentMembers.get(`${deptId}_${id}`))) throw Errors.validation({ fieldErrors: { collaboratorIds: ['Collaborators must be members of this department'] } });
}

export async function createTask(ctx: OrgContext, input: z.infer<typeof createTaskSchema>) {
  const project = T.projects.get(input.projectId);
  if (!project || project.orgId !== ctx.orgId) throw Errors.notFound('Project');
  ctx.assertReadDept(project.departmentId, 'Project');
  ctx.assertWriteDept(project.departmentId);
  if (input.parentId) {
    const parent = T.tasks.get(input.parentId);
    if (!parent || parent.projectId !== project.id) throw Errors.validation({ fieldErrors: { parentId: ['Parent task must be in the same project'] } });
    if (parent.parentId) throw Errors.validation({ fieldErrors: { parentId: ['Subtasks cannot be nested more than one level'] } });
  }
  if (input.requestId) {
    const r = T.requests.get(input.requestId);
    if (!r || r.orgId !== ctx.orgId || r.toDepartmentId !== project.departmentId) throw Errors.validation({ fieldErrors: { requestId: ['Only the receiving department can plan work for a request'] } });
    if (!['accepted', 'in_progress', 'changes_requested'].includes(r.state)) throw Errors.validation({ fieldErrors: { requestId: ['Accept the request before planning tasks for it'] } });
    ctx.assertAdminDept(project.departmentId, 'Only department admins can divide a request into tasks');
  }
  const assignee = validateAssignee(ctx, project.departmentId, input.assignee);
  validateCollaborators(project.departmentId, input.collaboratorIds ?? []);
  const maxSort = Math.max(0, ...T.tasks.where((t) => t.projectId === project.id).map((t) => Number(t.sortOrder) || 0));
  const t = await T.tasks.insert({
    orgId: ctx.orgId,
    projectId: project.id,
    departmentId: project.departmentId,
    parentId: input.parentId ?? null,
    requestId: input.requestId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: input.status,
    priority: input.priority,
    dueDate: input.dueDate?.slice(0, 10) ?? null,
    startDate: input.startDate?.slice(0, 10) ?? null,
    labels: input.labels ?? [],
    progress: 0,
    sortOrder: maxSort + 1,
    version: 0,
    createdByMemberId: ctx.memberId,
    createdByAgentId: null,
    completedAt: input.status === 'done' ? nowIso() : null,
    collaboratorIds: [...new Set(input.collaboratorIds ?? [])],
    dependsOn: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...assignee,
  });
  await recordActivity({ orgId: ctx.orgId, entityType: 'task', entityId: t.id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'created', data: { title: t.title } });
  await audit(ctx, 'task.create', { type: 'task', id: t.id }, { projectId: t.projectId });
  await notify(ctx.orgId, [assignee.assigneeMemberId, ...(input.collaboratorIds ?? [])], { kind: 'task_assigned', title: `New task: ${t.title}`, body: project.name, entityType: 'task', entityId: t.id }, ctx.memberId);
  return publicTask(t);
}

export async function updateTask(ctx: OrgContext, id: string, input: z.infer<typeof updateTaskSchema>) {
  const cur = load(ctx, id);
  ctx.assertWriteDept(cur.departmentId);
  if (cur.version !== input.version) throw Errors.version();
  const patch: Record<string, unknown> = { updatedAt: nowIso(), version: cur.version + 1 };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const set = (k: string, v: unknown, from: unknown) => {
    if (v !== undefined && v !== from) {
      patch[k] = v;
      changes[k] = { from, to: v };
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
      const open = (cur.dependsOn ?? []).map((d: string) => T.tasks.get(d)).filter((d: any) => d && d.status !== 'done');
      if (open.length) throw Errors.validation({ fieldErrors: { status: [`Blocked by unfinished dependency: ${open.map((o: any) => o.title).join(', ')}`] } });
      patch.completedAt = nowIso();
      patch.progress = 100;
    } else if (cur.status === 'done') {
      patch.completedAt = null;
    }
    set('status', input.status, cur.status);
  }
  let newAssigneeMember: string | null = null;
  if (input.assignee !== undefined) {
    const a = validateAssignee(ctx, cur.departmentId, input.assignee);
    if (a.assigneeMemberId !== cur.assigneeMemberId || a.assigneeAgentId !== cur.assigneeAgentId) {
      Object.assign(patch, a);
      changes.assignee = { from: cur.assigneeMemberId ?? cur.assigneeAgentId, to: a.assigneeMemberId ?? a.assigneeAgentId };
      newAssigneeMember = a.assigneeMemberId;
    }
  }
  if (input.collaboratorIds) {
    validateCollaborators(cur.departmentId, input.collaboratorIds);
    patch.collaboratorIds = [...new Set(input.collaboratorIds)];
  }
  const t = await T.tasks.update(id, patch);
  if (changes.status) await recordActivity({ orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'status_changed', data: changes.status });
  if (changes.assignee) await recordActivity({ orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'assigned', data: changes.assignee });
  const other = Object.keys(changes).filter((k) => !['status', 'assignee', 'sortOrder', 'progress'].includes(k));
  if (other.length) await recordActivity({ orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'updated', data: { fields: other } });
  await audit(ctx, 'task.update', { type: 'task', id }, { fields: Object.keys(changes) });
  if (newAssigneeMember) await notify(ctx.orgId, [newAssigneeMember], { kind: 'task_assigned', title: `Assigned to you: ${t.title}`, entityType: 'task', entityId: id }, ctx.memberId);
  if (changes.status) await notify(ctx.orgId, watchers(t), { kind: 'task_updated', title: `${t.title} → ${TASK_STATUS_LABEL[t.status as TaskStatus]}`, entityType: 'task', entityId: id }, ctx.memberId);
  return publicTask(t);
}

async function deleteTaskCascade(id: string) {
  for (const s of T.tasks.where((x) => x.parentId === id)) await deleteTaskCascade(s.id);
  for (const c of T.comments.where((c) => c.taskId === id)) await T.comments.remove(c.id);
  for (const x of T.tasks.where((x) => (x.dependsOn ?? []).includes(id))) await T.tasks.update(x.id, { dependsOn: x.dependsOn.filter((d: string) => d !== id) });
  for (const f of T.files.where((f) => f.taskId === id)) await T.files.update(f.id, { taskId: null });
  await T.tasks.remove(id);
}

export async function removeTask(ctx: OrgContext, id: string) {
  const t = load(ctx, id);
  if (!(ctx.canAdminDept(t.departmentId) || (t.createdByMemberId === ctx.memberId && ctx.canWriteDept(t.departmentId)))) throw Errors.forbidden('Only the creator or a department admin can delete this task');
  await deleteTaskCascade(id);
  await audit(ctx, 'task.delete', { type: 'task', id }, { title: t.title });
  return { ok: true };
}

export async function addDependency(ctx: OrgContext, id: string, dependsOnId: string) {
  const t = load(ctx, id);
  ctx.assertWriteDept(t.departmentId);
  const dep = load(ctx, dependsOnId);
  if (dep.departmentId !== t.departmentId) throw Errors.validation({ fieldErrors: { dependsOnId: ['Dependencies must be within the same department'] } });
  if (dep.id === t.id) throw Errors.validation({ fieldErrors: { dependsOnId: ['A task cannot depend on itself'] } });
  // Reject cycles: does `dependsOnId` (transitively) depend on `id`?
  const seen = new Set<string>();
  const stack = [...(dep.dependsOn ?? [])];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === id) throw Errors.validation({ fieldErrors: { dependsOnId: ['That would create a circular dependency'] } });
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...(T.tasks.get(x)?.dependsOn ?? []));
  }
  if (!(t.dependsOn ?? []).includes(dependsOnId)) await T.tasks.update(id, { dependsOn: [...(t.dependsOn ?? []), dependsOnId] });
  await recordActivity({ orgId: ctx.orgId, entityType: 'task', entityId: id, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'dependency_added', data: { dependsOnId, title: dep.title } });
  return { ok: true };
}

export async function removeDependency(ctx: OrgContext, id: string, dependsOnId: string) {
  const t = load(ctx, id);
  ctx.assertWriteDept(t.departmentId);
  await T.tasks.update(id, { dependsOn: (t.dependsOn ?? []).filter((d: string) => d !== dependsOnId) });
  return { ok: true };
}

export async function addTaskComment(ctx: OrgContext, taskId: string, body: string) {
  ctx.assertNotViewer();
  const t = load(ctx, taskId);
  const c = await T.comments.insert({ orgId: ctx.orgId, taskId, requestId: null, authorMemberId: ctx.memberId, authorAgentId: null, agentRunId: null, body, createdAt: nowIso() });
  await recordActivity({ orgId: ctx.orgId, entityType: 'task', entityId: taskId, departmentId: t.departmentId, actorMemberId: ctx.memberId, verb: 'commented' });
  await notify(ctx.orgId, watchers(t), { kind: 'task_comment', title: `New comment on ${t.title}`, body: body.slice(0, 140), entityType: 'task', entityId: taskId }, ctx.memberId);
  return c;
}

function watchers(t: any) {
  return [t.assigneeMemberId, t.createdByMemberId, ...(t.collaboratorIds ?? [])].filter(Boolean) as string[];
}
