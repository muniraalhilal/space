import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { OrgRole, DeptRole } from '@space/shared';
import { Errors } from './errors';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  sessionId: string;
}

/**
 * The authorization context of the current principal inside ONE company.
 * Every tenant-scoped service method takes this object and must filter by `orgId`.
 */
export class OrgContext {
  constructor(
    public readonly orgId: string,
    public readonly memberId: string,
    public readonly userId: string,
    public readonly role: OrgRole,
    /** departmentId -> role in that department */
    public readonly deptRoles: Map<string, DeptRole>,
    public readonly ip?: string,
  ) {}

  get isCompanyAdmin() {
    return this.role === 'company_admin';
  }
  get isViewer() {
    return this.role === 'viewer';
  }
  /** Read department-scoped data (projects, tasks, files, agent runs). */
  canReadDept(deptId: string) {
    return this.isCompanyAdmin || this.deptRoles.has(deptId);
  }
  /** Create/update department-scoped work items. */
  canWriteDept(deptId: string) {
    return this.isCompanyAdmin || (!this.isViewer && this.deptRoles.has(deptId));
  }
  /** Department Admin operations: membership, request decisions, review, agents. */
  canAdminDept(deptId: string) {
    return this.isCompanyAdmin || (!this.isViewer && this.deptRoles.get(deptId) === 'admin');
  }
  /** `null` means "all departments" (company admin). */
  readableDeptIds(): string[] | null {
    return this.isCompanyAdmin ? null : [...this.deptRoles.keys()];
  }
  adminDeptIds(): string[] {
    return [...this.deptRoles.entries()].filter(([, r]) => r === 'admin').map(([d]) => d);
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

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  if (!req.user) throw Errors.unauthenticated();
  return req.user;
});

export const Org = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => {
  const req = ctx.switchToHttp().getRequest();
  if (!req.org) throw Errors.forbidden();
  return req.org;
});
