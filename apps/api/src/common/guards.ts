import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import type { DeptRole, OrgRole } from '@space/shared';
import { getDb, schema } from '../db/client';
import { sha256 } from './crypto';
import { Errors } from './errors';
import { OrgContext, AuthUser } from './context';

export const SESSION_COOKIE = 'space_session';
export const PUBLIC_KEY = 'space:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves a session token to a user. Shared by HTTP guard and websocket gateway. */
export async function resolveSession(token: string | undefined): Promise<AuthUser | null> {
  if (!token || token.length > 200) return null;
  const db = getDb();
  const rows = await db
    .select({ sid: schema.sessions.id, lastSeen: schema.sessions.lastSeenAt, u: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.lastSeen.getTime() > 5 * 60_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, row.sid));
  }
  return { id: row.u.id, email: row.u.email, name: row.u.name, isPlatformAdmin: row.u.isPlatformAdmin, sessionId: row.sid };
}

/** Loads the membership + department roles of a user in an org. Returns null when not an active member. */
export async function loadOrgContext(orgId: string, userId: string, ip?: string): Promise<OrgContext | null> {
  if (!UUID_RE.test(orgId)) return null;
  const db = getDb();
  const [m] = await db
    .select()
    .from(schema.orgMembers)
    .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId), isNull(schema.orgMembers.deactivatedAt)))
    .limit(1);
  if (!m) return null;
  const dms = await db
    .select({ d: schema.departmentMembers.departmentId, r: schema.departmentMembers.role })
    .from(schema.departmentMembers)
    .where(and(eq(schema.departmentMembers.orgId, orgId), eq(schema.departmentMembers.memberId, m.id)));
  return new OrgContext(orgId, m.id, userId, m.role as OrgRole, new Map(dms.map((x) => [x.d, x.r as DeptRole])), ip);
}

/**
 * Global guard:
 *  1. authenticates the session cookie (unless @Public)
 *  2. enforces a CSRF header on state-changing requests (cookies are SameSite=Lax; the custom header
 *     cannot be attached cross-origin without a CORS preflight, which this API never grants)
 *  3. for any route with an `:orgId` param, verifies active membership and attaches OrgContext.
 *     Non-members get 404 so the existence of other tenants is not revealed.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser; org?: OrgContext }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-space-csrf'] !== '1') {
      throw Errors.forbidden('Missing CSRF header');
    }

    const user = await resolveSession(req.cookies?.[SESSION_COOKIE]);
    if (user) req.user = user;
    if (isPublic) return true;
    if (!user) throw Errors.unauthenticated();

    const orgId = (req.params as Record<string, string>)?.orgId;
    if (orgId) {
      const org = await loadOrgContext(orgId, user.id, req.ip);
      if (!org) throw Errors.notFound('Workspace');
      req.org = org;
    }
    return true;
  }
}
