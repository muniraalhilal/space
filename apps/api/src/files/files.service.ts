import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { and, desc, eq, inArray, isNull, or, sql, SQL } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { OrgContext } from '../common/context';
import { Errors } from '../common/errors';
import { AuditService } from '../common/audit.service';
import { config } from '../config';
import { storage } from './storage';

const S = schema;

const ALLOWED_MIME = [
  /^image\/(png|jpeg|gif|webp)$/,
  /^application\/pdf$/,
  /^text\/(plain|markdown|csv)$/,
  /^application\/json$/,
  /^application\/vnd\.openxmlformats-officedocument\./,
  /^application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
  /^application\/zip$/,
];
const TEXTUAL = /^(text\/(plain|markdown|csv)|application\/json)$/;
const EXT_MIME: Record<string, string> = { md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', txt: 'text/plain', json: 'application/json' };

export interface UploadInput {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/** Normalise a client-supplied filename: strip paths and control characters. */
function cleanName(n: string) {
  return (n.split(/[\\/]/).pop() ?? 'file').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').slice(0, 180) || 'file';
}

@Injectable()
export class FilesService {
  constructor(private readonly audit: AuditService) {}

  /** Visibility rule for a file row. */
  private async canRead(ctx: OrgContext, f: typeof S.files.$inferSelect) {
    if (ctx.isCompanyAdmin) return true;
    if (f.requestId) {
      const [r] = await getDb().select().from(S.requests).where(eq(S.requests.id, f.requestId));
      if (r && (ctx.canReadDept(r.fromDepartmentId) || ctx.canReadDept(r.toDepartmentId))) return true;
    }
    if (f.departmentId) return ctx.canReadDept(f.departmentId);
    return !f.requestId; // company-wide knowledge
  }

  async list(ctx: OrgContext, opts: { departmentId?: string; knowledge?: boolean }) {
    const readable = ctx.readableDeptIds();
    const conds: (SQL | undefined)[] = [eq(S.files.orgId, ctx.orgId), isNull(S.files.deletedAt)];
    if (opts.departmentId) {
      if (!ctx.canReadDept(opts.departmentId)) return [];
      conds.push(eq(S.files.departmentId, opts.departmentId));
    } else if (readable) {
      conds.push(or(isNull(S.files.departmentId), readable.length ? inArray(S.files.departmentId, readable) : sql`false`));
      conds.push(isNull(S.files.requestId));
    }
    if (opts.knowledge) conds.push(eq(S.files.isKnowledge, true));
    const rows = await getDb()
      .select({
        id: S.files.id,
        name: S.files.name,
        mime: S.files.mime,
        size: S.files.size,
        departmentId: S.files.departmentId,
        taskId: S.files.taskId,
        requestId: S.files.requestId,
        isKnowledge: S.files.isKnowledge,
        ownerMemberId: S.files.ownerMemberId,
        ownerAgentId: S.files.ownerAgentId,
        ownerName: sql<string>`coalesce(${S.users.name}, ${S.agents.name})`,
        retentionUntil: S.files.retentionUntil,
        createdAt: S.files.createdAt,
      })
      .from(S.files)
      .leftJoin(S.orgMembers, eq(S.orgMembers.id, S.files.ownerMemberId))
      .leftJoin(S.users, eq(S.users.id, S.orgMembers.userId))
      .leftJoin(S.agents, eq(S.agents.id, S.files.ownerAgentId))
      .where(and(...conds))
      .orderBy(desc(S.files.createdAt))
      .limit(300);
    return rows;
  }

  async upload(ctx: OrgContext, file: UploadInput | undefined, meta: { departmentId?: string; taskId?: string; requestId?: string; isKnowledge?: boolean }) {
    ctx.assertNotViewer();
    if (!file) throw Errors.badRequest('No file received');
    if (file.size > config().MAX_UPLOAD_MB * 1024 * 1024) throw Errors.badRequest('File is too large');
    const name = cleanName(file.originalname);
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const mime = file.mimetype === 'application/octet-stream' && EXT_MIME[ext] ? EXT_MIME[ext] : file.mimetype;
    if (!ALLOWED_MIME.some((re) => re.test(mime))) throw Errors.validation({ file: [`File type ${mime} is not allowed`] });

    const db = getDb();
    let departmentId: string | null = meta.departmentId ?? null;
    if (meta.taskId) {
      const [t] = await db.select().from(S.tasks).where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.id, meta.taskId)));
      if (!t) throw Errors.notFound('Task');
      ctx.assertWriteDept(t.departmentId);
      departmentId = t.departmentId;
    } else if (meta.requestId) {
      const [r] = await db.select().from(S.requests).where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, meta.requestId)));
      if (!r || !(ctx.canReadDept(r.fromDepartmentId) || ctx.canReadDept(r.toDepartmentId))) throw Errors.notFound('Request');
      departmentId = null;
    } else if (departmentId) {
      ctx.assertWriteDept(departmentId);
    } else {
      ctx.assertCompanyAdmin(); // company-wide files
    }

    const sha = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${ctx.orgId}/${crypto.randomUUID()}`;
    await storage().put(storageKey, file.buffer, mime);
    const text = TEXTUAL.test(mime) ? file.buffer.toString('utf8').slice(0, 200_000) : null;
    const [row] = await db
      .insert(S.files)
      .values({
        orgId: ctx.orgId,
        departmentId,
        ownerMemberId: ctx.memberId,
        name,
        mime,
        size: file.size,
        sha256: sha,
        storageKey,
        taskId: meta.taskId ?? null,
        requestId: meta.requestId ?? null,
        isKnowledge: !!meta.isKnowledge,
        textContent: text,
      })
      .returning();
    await this.audit.log(ctx, 'file.upload', { type: 'file', id: row.id }, { name, size: file.size, mime });
    const { textContent, storageKey: _k, ...safe } = row;
    return safe;
  }

  async getForDownload(ctx: OrgContext, id: string) {
    const [f] = await getDb().select().from(S.files).where(and(eq(S.files.orgId, ctx.orgId), eq(S.files.id, id), isNull(S.files.deletedAt)));
    if (!f || !(await this.canRead(ctx, f))) throw Errors.notFound('File');
    return { file: f, stream: await storage().get(f.storageKey) };
  }

  async remove(ctx: OrgContext, id: string) {
    const db = getDb();
    const [f] = await db.select().from(S.files).where(and(eq(S.files.orgId, ctx.orgId), eq(S.files.id, id), isNull(S.files.deletedAt)));
    if (!f || !(await this.canRead(ctx, f))) throw Errors.notFound('File');
    const isOwner = f.ownerMemberId === ctx.memberId;
    const isAdmin = ctx.isCompanyAdmin || (f.departmentId ? ctx.canAdminDept(f.departmentId) : false);
    if (!isOwner && !isAdmin) throw Errors.forbidden('Only the owner or an admin can delete this file');
    if (f.retentionUntil && f.retentionUntil > new Date()) throw Errors.conflict('This file is under retention and cannot be deleted yet');
    await db.update(S.files).set({ deletedAt: new Date(), textContent: null }).where(eq(S.files.id, id));
    await storage().delete(f.storageKey).catch(() => undefined);
    await this.audit.log(ctx, 'file.delete', { type: 'file', id }, { name: f.name });
    return { ok: true };
  }
}
