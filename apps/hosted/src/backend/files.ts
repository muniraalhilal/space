/** Files & knowledge (ported from apps/api/src/files). Bytes live in the artifact's asset store. */
import { T, nowIso } from './store';
import { Errors, OrgContext, audit, byDesc, userName, agentName } from './core';
import { caps } from './caps';

/** Types the artifact asset store accepts. */
const ALLOWED: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', json: 'application/json',
};
const TEXTUAL = /^(text\/(plain|markdown|csv)|application\/json)$/;
const MAX_MB = 20;

function cleanName(n: string) {
  return (n.split(/[\\/]/).pop() ?? 'file').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').slice(0, 180) || 'file';
}

function canRead(ctx: OrgContext, f: any) {
  if (ctx.isCompanyAdmin) return true;
  if (f.requestId) {
    const r = T.requests.get(f.requestId);
    if (r && (ctx.canReadDept(r.fromDepartmentId) || ctx.canReadDept(r.toDepartmentId))) return true;
  }
  if (f.departmentId) return ctx.canReadDept(f.departmentId);
  return !f.requestId;
}

const publicFile = (f: any) => {
  const { textContent: _t, assetId: _a, ...rest } = f;
  return { ...rest, ownerName: userName(f.ownerMemberId) ?? agentName(f.ownerAgentId) };
};

export function listFiles(ctx: OrgContext, opts: { departmentId?: string; knowledge?: boolean }) {
  const readable = ctx.readableDeptIds();
  if (opts.departmentId && !ctx.canReadDept(opts.departmentId)) return [];
  return T.files
    .where((f) => {
      if (f.orgId !== ctx.orgId || f.deletedAt) return false;
      if (opts.departmentId) {
        if (f.departmentId !== opts.departmentId) return false;
      } else if (readable) {
        if (f.requestId) return false;
        if (f.departmentId && !readable.includes(f.departmentId)) return false;
      }
      if (opts.knowledge && !f.isKnowledge) return false;
      return true;
    })
    .sort(byDesc((f) => f.createdAt))
    .slice(0, 300)
    .map(publicFile);
}

export async function uploadFile(ctx: OrgContext, form: FormData) {
  ctx.assertNotViewer();
  const file = form.get('file');
  if (!(file instanceof Blob)) throw Errors.badRequest('No file received');
  if (!caps.assets) throw Errors.forbidden('Uploading files isn’t available to you on this page. Ask the owner for edit access.');
  if (file.size > MAX_MB * 1024 * 1024) throw Errors.badRequest(`File is too large (max ${MAX_MB} MB)`);
  const name = cleanName((file as File).name ?? 'file');
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const mime = ALLOWED[ext];
  if (!mime) throw Errors.validation({ fieldErrors: { file: [`.${ext || '?'} files can’t be stored here. Use PNG, JPG, GIF, WebP, SVG, PDF, TXT, Markdown, CSV or JSON.`] } });
  const meta = { departmentId: (form.get('departmentId') as string) || undefined, taskId: (form.get('taskId') as string) || undefined, requestId: (form.get('requestId') as string) || undefined, isKnowledge: form.get('isKnowledge') === 'true' };

  let departmentId: string | null = meta.departmentId ?? null;
  if (meta.taskId) {
    const t = T.tasks.get(meta.taskId);
    if (!t || t.orgId !== ctx.orgId) throw Errors.notFound('Task');
    ctx.assertWriteDept(t.departmentId);
    departmentId = t.departmentId;
  } else if (meta.requestId) {
    const r = T.requests.get(meta.requestId);
    if (!r || r.orgId !== ctx.orgId || !(ctx.canReadDept(r.fromDepartmentId) || ctx.canReadDept(r.toDepartmentId))) throw Errors.notFound('Request');
    departmentId = null;
  } else if (departmentId) {
    ctx.assertWriteDept(departmentId);
  } else {
    ctx.assertCompanyAdmin();
  }

  let up: { id: string; sizeBytes: number };
  try {
    up = await caps.assets.upload(file, { type: mime, orgId: ctx.orgId });
  } catch (e: any) {
    throw Errors.badRequest(e?.message ?? 'Upload failed');
  }
  const text = TEXTUAL.test(mime) ? (await file.text()).slice(0, 100_000) : null;
  const row = await T.files.insert({
    orgId: ctx.orgId,
    departmentId,
    ownerMemberId: ctx.memberId,
    ownerAgentId: null,
    name,
    mime,
    size: up.sizeBytes ?? file.size,
    assetId: up.id,
    taskId: meta.taskId ?? null,
    requestId: meta.requestId ?? null,
    isKnowledge: !!meta.isKnowledge,
    textContent: text,
    retentionUntil: null,
    deletedAt: null,
    createdAt: nowIso(),
  });
  await audit(ctx, 'file.upload', { type: 'file', id: row.id }, { name, size: file.size, mime });
  return publicFile(row);
}

/** Resolve a file for download: an asset URL, or the stored text for agent-written documents. */
export async function fileForDownload(ctx: OrgContext, id: string) {
  const f = T.files.get(id);
  if (!f || f.orgId !== ctx.orgId || f.deletedAt || !canRead(ctx, f)) throw Errors.notFound('File');
  return { name: f.name as string, mime: f.mime as string, url: f.assetId ? (caps.assetUrl ? await caps.assetUrl(f.assetId) : `/_blob/${f.assetId}`) : null, text: (f.textContent as string | null) ?? null };
}

export async function removeFile(ctx: OrgContext, id: string) {
  const f = T.files.get(id);
  if (!f || f.orgId !== ctx.orgId || f.deletedAt || !canRead(ctx, f)) throw Errors.notFound('File');
  const isOwner = f.ownerMemberId === ctx.memberId;
  const isAdmin = ctx.isCompanyAdmin || (f.departmentId ? ctx.canAdminDept(f.departmentId) : false);
  if (!isOwner && !isAdmin) throw Errors.forbidden('Only the owner or an admin can delete this file');
  if (f.retentionUntil && f.retentionUntil > nowIso()) throw Errors.conflict('This file is under retention and cannot be deleted yet');
  await T.files.update(id, { deletedAt: nowIso(), textContent: null });
  if (f.assetId && caps.assets) await caps.assets.delete(f.assetId).catch(() => undefined);
  await audit(ctx, 'file.delete', { type: 'file', id }, { name: f.name });
  return { ok: true };
}

/** Agent-written Markdown documents are stored as text in the file record (no asset needed). */
export async function saveDocument(c: { orgId: string; departmentId: string; agentId: string }, name: string, markdown: string, taskId?: string) {
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const md = markdown.slice(0, 100_000);
  const f = await T.files.insert({
    orgId: c.orgId,
    departmentId: c.departmentId,
    ownerMemberId: null,
    ownerAgentId: c.agentId,
    name: fileName,
    mime: 'text/markdown',
    size: new TextEncoder().encode(md).length,
    assetId: null,
    taskId: taskId ?? null,
    requestId: null,
    isKnowledge: true,
    textContent: md,
    retentionUntil: null,
    deletedAt: null,
    createdAt: nowIso(),
  });
  return { ok: true, file_id: f.id, name: fileName };
}
