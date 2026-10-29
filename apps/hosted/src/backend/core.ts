/** Errors, authorization context and shared helpers for the in-page API (ported from apps/api). */
import type { DeptRole, OrgRole, AuditAction, NotificationKind } from '@space/shared';
import type { ZodTypeAny, z } from 'zod';
import { T, nowIso } from './store';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  validation: (details: unknown) => new AppError('VALIDATION_FAILED', 'The request is invalid', 422, details),
  unauthenticated: () => new AppError('UNAUTHENTICATED', 'Please choose who you are first', 401),
  forbidden: (msg = 'You do not have permission to do that') => new AppError('FORBIDDEN', msg, 403),
  notFound: (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`, 404),
  conflict: (msg: string) => new AppError('CONFLICT', msg, 409),
  version: () => new AppError('VERSION_CONFLICT', 'This item was changed by someone else. Refresh and try again.', 409),
  transition: (msg: string, code = 'INVALID_TRANSITION') => new AppError(code, msg, code === 'FORBIDDEN' ? 403 : 409),
  badRequest: (msg: string) => new AppError('BAD_REQUEST', msg, 400),
};

/** Validate input exactly like the server's zod pipe. */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value ?? {});
  if (!r.success) {
    const f = r.error.flatten();
    throw Errors.validation({ fieldErrors: f.fieldErrors, formErrors: f.formErrors });
  }
  return r.data;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export class OrgContext {
  constructor(
    public readonly orgId: string,
    public readonly memberId: string,
    public readonly userId: string,
    public readonly role: OrgRole,
    public readonly deptRoles: Map<string, DeptRole>,
  ) {}
  get isCompanyAdmin() {
    return this.role === 'company_admin';
  }
  get isViewer() {
    return this.role === 'viewer';
  }
  canReadDept(deptId: string) {
    return this.isCompanyAdmin || this.deptRoles.has(deptId);
  }
  canWriteDept(deptId: string) {
    return this.isCompanyAdmin || (!this.isViewer && this.deptRoles.has(deptId));
  }
  canAdminDept(deptId: string) {
    return this.isCompanyAdmin || (!this.isViewer && this.deptRoles.get(deptId) === 'admin');
  }
  readableDeptIds(): string[] | null {
    return this.isCompanyAdmin ? null : [...this.deptRoles.keys()];
  }
  assertReadDept(deptId: string, what = 'Resource') {
    if (!this.canReadDept(deptId)) throw Errors.notFound(what);
  }
  assertWriteDept(deptId: string) {
    if (!this.canWriteDept(deptId)) throw Errors.forbidden();
  }
  assertAdminDept(deptId: string, msg = 'Only department admins can do that') {
    if (!this.canAdminDept(deptId)) throw Errors.forbidden(msg);
  }
  assertCompanyAdmin() {
    if (!this.isCompanyAdmin) throw Errors.forbidden('Only company admins can do that');
  }
  assertNotViewer() {
    if (this.isViewer) throw Errors.forbidden('Viewers have read-only access');
  }
}

/** Build the context for a user inside a company; null when they are not an active member (→ 404). */
export function loadOrgContext(orgId: string, userId: string): OrgContext | null {
  const m = T.orgMembers.find((x) => x.orgId === orgId && x.userId === userId && !x.deactivatedAt);
  if (!m) return null;
  const dms = T.departmentMembers.where((d) => d.orgId === orgId && d.memberId === m.id);
  return new OrgContext(orgId, m.id, userId, m.role, new Map(dms.map((d) => [d.departmentId, d.role as DeptRole])));
}

/* ------------------------------------------------------------------ cross-cutting writes */

export async function audit(ctx: Pick<OrgContext, 'orgId' | 'memberId' | 'userId'> | null, action: AuditAction, entity?: { type: string; id?: string | null }, data: Record<string, unknown> = {}, extra: { userId?: string; agentId?: string } = {}) {
  await T.auditLogs.insert({
    orgId: ctx?.orgId ?? null,
    actorUserId: ctx?.userId ?? extra.userId ?? null,
    actorMemberId: ctx?.memberId ?? null,
    actorAgentId: extra.agentId ?? null,
    action,
    entityType: entity?.type ?? null,
    entityId: entity?.id ?? null,
    data,
    ip: null,
    createdAt: nowIso(),
  });
}

export async function recordActivity(a: { orgId: string; entityType: 'task' | 'project' | 'request' | 'agent_run' | 'file'; entityId: string; departmentId?: string | null; actorMemberId?: string | null; actorAgentId?: string | null; verb: string; data?: Record<string, unknown> }) {
  await T.activities.insert({
    orgId: a.orgId,
    entityType: a.entityType,
    entityId: a.entityId,
    departmentId: a.departmentId ?? null,
    actorMemberId: a.actorMemberId ?? null,
    actorAgentId: a.actorAgentId ?? null,
    verb: a.verb,
    data: a.data ?? {},
    createdAt: nowIso(),
  });
}

export async function notify(orgId: string, recipientIds: Iterable<string | null | undefined>, n: { kind: NotificationKind | string; title: string; body?: string | null; entityType?: string; entityId?: string }, exceptMemberId?: string) {
  const ids = [...new Set(recipientIds)].filter((id): id is string => !!id && id !== exceptMemberId);
  await Promise.all(
    ids.map((recipientMemberId) =>
      T.notifications.insert({ orgId, recipientMemberId, kind: n.kind, title: n.title, body: n.body ?? null, entityType: n.entityType ?? null, entityId: n.entityId ?? null, readAt: null, createdAt: nowIso() }),
    ),
  );
}

export function userName(memberId: string | null | undefined) {
  const m = T.orgMembers.get(memberId);
  return m ? (T.users.get(m.userId)?.name ?? null) : null;
}
export function agentName(agentId: string | null | undefined) {
  return T.agents.get(agentId)?.name ?? null;
}

export const byDesc = <R,>(k: (r: R) => string | number | null | undefined) => (a: R, b: R) => {
  const x = k(a) ?? '';
  const y = k(b) ?? '';
  return x < y ? 1 : x > y ? -1 : 0;
};
export const byAsc = <R,>(k: (r: R) => string | number | null | undefined) => (a: R, b: R) => {
  const x = k(a) ?? '';
  const y = k(b) ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
};
export const today = () => new Date().toISOString().slice(0, 10);
