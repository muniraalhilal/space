import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { loginSchema, registerSchema } from '@space/shared';
import { getDb, schema } from '../db/client';
import { config } from '../config';
import { randomToken, sha256 } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { Public, SESSION_COOKIE } from '../common/guards';
import { AuthUser, CurrentUser } from '../common/context';
import { zp } from '../common/zod';
import { AuditService } from '../common/audit.service';

// A constant hash so login timing does not reveal whether an email exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 10);

const prefsSchema = z.object({
  focusMode: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  office3d: z.boolean().optional(),
  lastOrgId: z.string().uuid().optional(),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly audit: AuditService) {}

  private async startSession(userId: string, req: Request, res: Response) {
    const token = randomToken();
    const ttl = config().SESSION_TTL_DAYS * 86400_000;
    await getDb()
      .insert(schema.sessions)
      .values({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl), ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config().COOKIE_SECURE || config().NODE_ENV === 'production',
      maxAge: ttl,
      path: '/',
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(zp(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const [u] = await getDb()
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${body.email})`)
      .limit(1);
    const ok = await bcrypt.compare(body.password, u?.passwordHash ?? DUMMY_HASH);
    if (!u || !ok) throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect', 401);
    await this.startSession(u.id, req, res);
    await this.audit.log(null, 'auth.login', { type: 'user', id: u.id }, {}, undefined, { userId: u.id, ip: req.ip });
    return { user: { id: u.id, email: u.email, name: u.name } };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body(zp(registerSchema)) body: z.infer<typeof registerSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const db = getDb();
    const [exists] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${body.email})`)
      .limit(1);
    if (exists) throw Errors.conflict('An account with this email already exists');
    const [u] = await db
      .insert(schema.users)
      .values({ email: body.email.toLowerCase(), name: body.name, passwordHash: await bcrypt.hash(body.password, 12) })
      .returning();
    await this.startSession(u.id, req, res);
    return { user: { id: u.id, email: u.email, name: u.name } };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await getDb().delete(schema.sessions).where(eq(schema.sessions.id, user.sessionId));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await this.audit.log(null, 'auth.logout', { type: 'user', id: user.id }, {}, undefined, { userId: user.id });
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const db = getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    const orgs = await db
      .select({
        id: schema.organizations.id,
        slug: schema.organizations.slug,
        name: schema.organizations.name,
        brandColor: schema.organizations.brandColor,
        isDemo: schema.organizations.isDemo,
        role: schema.orgMembers.role,
        memberId: schema.orgMembers.id,
      })
      .from(schema.orgMembers)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.orgMembers.orgId))
      .where(and(eq(schema.orgMembers.userId, user.id), isNull(schema.orgMembers.deactivatedAt)))
      .orderBy(asc(schema.organizations.name));
    return {
      user: { id: u.id, email: u.email, name: u.name, isPlatformAdmin: u.isPlatformAdmin, preferences: u.preferences },
      organizations: orgs,
    };
  }

  @Patch('me/preferences')
  async prefs(@CurrentUser() user: AuthUser, @Body(zp(prefsSchema)) body: z.infer<typeof prefsSchema>) {
    const db = getDb();
    const [u] = await db.select({ p: schema.users.preferences }).from(schema.users).where(eq(schema.users.id, user.id));
    const preferences = { ...(u?.p ?? {}), ...body };
    await db.update(schema.users).set({ preferences }).where(eq(schema.users.id, user.id));
    return { preferences };
  }
}
