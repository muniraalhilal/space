/**
 * Agent tool implementations.
 *
 * Every tool runs with a ToolContext bound to (org, department, agent, run). Tools can only reach
 * data of that department in that company — the scoping is applied inside each query, never taken
 * from model-provided arguments. Arguments from the model are validated with zod like any other
 * untrusted input.
 */
import { z } from 'zod';
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { TOOL_BY_NAME, type ToolMeta } from '@space/shared';
import { getDb, schema } from '../../db/client';
import { recordActivity } from '../../common/activity';
import { publish } from '../../realtime/bus';
import { storage } from '../../files/storage';
import { github, GithubClient } from './github';

const S = schema;

export interface ToolContext {
  orgId: string;
  departmentId: string;
  agentId: string;
  runId: string;
  /** Files explicitly attached to the run (still subject to department visibility). */
  fileIds: string[];
  github?: GithubClient | null;
}

export interface ToolDef {
  meta: ToolMeta;
  /** JSON schema advertised to the model. */
  inputSchema: Record<string, unknown>;
  validate: z.ZodTypeAny;
  run: (ctx: ToolContext, input: any) => Promise<unknown>;
}

const MAX_TOOL_OUTPUT = 12_000;

export class ToolError extends Error {}

async function deptTask(ctx: ToolContext, taskId: string) {
  const [t] = await getDb()
    .select()
    .from(S.tasks)
    .where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.departmentId, ctx.departmentId), eq(S.tasks.id, taskId)));
  if (!t) throw new ToolError('Task not found in this department');
  return t;
}

const uuid = z.string().uuid();
const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/);

export const TOOLS: Record<string, ToolDef> = {
  list_department_tasks: {
    meta: TOOL_BY_NAME.list_department_tasks,
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['todo', 'in_progress', 'in_review', 'blocked', 'done'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
    validate: z.object({ status: z.enum(['todo', 'in_progress', 'in_review', 'blocked', 'done']).optional(), limit: z.number().int().min(1).max(50).default(25) }),
    async run(ctx, i) {
      return getDb()
        .select({ id: S.tasks.id, title: S.tasks.title, status: S.tasks.status, priority: S.tasks.priority, dueDate: S.tasks.dueDate, progress: S.tasks.progress })
        .from(S.tasks)
        .where(and(eq(S.tasks.orgId, ctx.orgId), eq(S.tasks.departmentId, ctx.departmentId), i.status ? eq(S.tasks.status, i.status) : undefined))
        .orderBy(desc(S.tasks.updatedAt))
        .limit(i.limit);
    },
  },
  get_task: {
    meta: TOOL_BY_NAME.get_task,
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
    validate: z.object({ task_id: uuid }),
    async run(ctx, i) {
      const t = await deptTask(ctx, i.task_id);
      const comments = await getDb()
        .select({ body: S.comments.body, at: S.comments.createdAt })
        .from(S.comments)
        .where(and(eq(S.comments.orgId, ctx.orgId), eq(S.comments.taskId, t.id)))
        .orderBy(asc(S.comments.createdAt))
        .limit(30);
      const subtasks = await getDb().select({ id: S.tasks.id, title: S.tasks.title, status: S.tasks.status }).from(S.tasks).where(eq(S.tasks.parentId, t.id));
      return { id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, dueDate: t.dueDate, progress: t.progress, subtasks, comments };
    },
  },
  get_request: {
    meta: TOOL_BY_NAME.get_request,
    inputSchema: { type: 'object', properties: { request_id: { type: 'string' } }, required: ['request_id'] },
    validate: z.object({ request_id: uuid }),
    async run(ctx, i) {
      const [r] = await getDb()
        .select()
        .from(S.requests)
        .where(and(eq(S.requests.orgId, ctx.orgId), eq(S.requests.id, i.request_id), or(eq(S.requests.toDepartmentId, ctx.departmentId), eq(S.requests.fromDepartmentId, ctx.departmentId))));
      if (!r) throw new ToolError('Request not found for this department');
      return { id: r.id, number: r.number, title: r.title, description: r.description, state: r.state, priority: r.priority, dueDate: r.dueDate };
    },
  },
  read_file: {
    meta: TOOL_BY_NAME.read_file,
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
    validate: z.object({ file_id: uuid }),
    async run(ctx, i) {
      const [f] = await getDb()
        .select()
        .from(S.files)
        .where(and(eq(S.files.orgId, ctx.orgId), eq(S.files.id, i.file_id), isNull(S.files.deletedAt), or(eq(S.files.departmentId, ctx.departmentId), and(isNull(S.files.departmentId), isNull(S.files.requestId)))));
      if (!f) throw new ToolError('File not found or not accessible to this department');
      if (f.textContent == null) {
        if (!/^(text\/|application\/json)/.test(f.mime)) throw new ToolError(`File type ${f.mime} cannot be read as text`);
      }
      return { name: f.name, mime: f.mime, text: (f.textContent ?? '').slice(0, 60_000) };
    },
  },
  department_stats: {
    meta: TOOL_BY_NAME.department_stats,
    inputSchema: { type: 'object', properties: {} },
    validate: z.object({}),
    async run(ctx) {
      return departmentStats(ctx.orgId, ctx.departmentId);
    },
  },
  add_task_comment: {
    meta: TOOL_BY_NAME.add_task_comment,
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, body: { type: 'string', maxLength: 4000 } }, required: ['task_id', 'body'] },
    validate: z.object({ task_id: uuid, body: z.string().min(1).max(4000) }),
    async run(ctx, i) {
      const t = await deptTask(ctx, i.task_id);
      const [c] = await getDb().transaction(async (tx) => {
        const r = await tx.insert(S.comments).values({ orgId: ctx.orgId, taskId: t.id, authorAgentId: ctx.agentId, agentRunId: ctx.runId, body: i.body }).returning();
        await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: t.id, departmentId: t.departmentId, actorAgentId: ctx.agentId, verb: 'commented' });
        return r;
      });
      publish({ type: 'task.changed', orgId: ctx.orgId, deptId: t.departmentId, taskId: t.id, projectId: t.projectId });
      return { ok: true, comment_id: c.id };
    },
  },
  create_subtask: {
    meta: TOOL_BY_NAME.create_subtask,
    inputSchema: {
      type: 'object',
      properties: { parent_task_id: { type: 'string' }, title: { type: 'string', maxLength: 200 }, description: { type: 'string', maxLength: 4000 } },
      required: ['parent_task_id', 'title'],
    },
    validate: z.object({ parent_task_id: uuid, title: z.string().min(1).max(200), description: z.string().max(4000).optional() }),
    async run(ctx, i) {
      const parent = await deptTask(ctx, i.parent_task_id);
      if (parent.parentId) throw new ToolError('Subtasks cannot be nested');
      const [t] = await getDb().transaction(async (tx) => {
        const r = await tx
          .insert(S.tasks)
          .values({ orgId: ctx.orgId, projectId: parent.projectId, departmentId: parent.departmentId, parentId: parent.id, title: i.title, description: i.description, createdByAgentId: ctx.agentId, requestId: parent.requestId })
          .returning();
        await recordActivity(tx, { orgId: ctx.orgId, entityType: 'task', entityId: r[0].id, departmentId: parent.departmentId, actorAgentId: ctx.agentId, verb: 'created', data: { title: i.title, runId: ctx.runId } });
        return r;
      });
      publish({ type: 'task.changed', orgId: ctx.orgId, deptId: t.departmentId, taskId: t.id, projectId: t.projectId });
      return { ok: true, task_id: t.id };
    },
  },
  save_document: {
    meta: TOOL_BY_NAME.save_document,
    inputSchema: { type: 'object', properties: { name: { type: 'string', maxLength: 120 }, markdown: { type: 'string', maxLength: 60000 }, task_id: { type: 'string' } }, required: ['name', 'markdown'] },
    validate: z.object({ name: z.string().min(1).max(120), markdown: z.string().min(1).max(60_000), task_id: uuid.optional() }),
    async run(ctx, i) {
      if (i.task_id) await deptTask(ctx, i.task_id);
      return saveDocument(ctx, i.name, i.markdown, i.task_id);
    },
  },
  github_list_issues: {
    meta: TOOL_BY_NAME.github_list_issues,
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name' }, state: { type: 'string', enum: ['open', 'closed', 'all'] } }, required: ['repo'] },
    validate: z.object({ repo, state: z.enum(['open', 'closed', 'all']).default('open') }),
    async run(ctx, i) {
      return github(ctx).listIssues(i.repo, i.state);
    },
  },
  github_get_pull_request: {
    meta: TOOL_BY_NAME.github_get_pull_request,
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, number: { type: 'integer' } }, required: ['repo', 'number'] },
    validate: z.object({ repo, number: z.number().int().positive() }),
    async run(ctx, i) {
      return github(ctx).getPullRequest(i.repo, i.number);
    },
  },
  github_recent_commits: {
    meta: TOOL_BY_NAME.github_recent_commits,
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, limit: { type: 'integer', maximum: 30 } }, required: ['repo'] },
    validate: z.object({ repo, limit: z.number().int().min(1).max(30).default(15) }),
    async run(ctx, i) {
      return github(ctx).recentCommits(i.repo, i.limit);
    },
  },
  github_create_issue: {
    meta: TOOL_BY_NAME.github_create_issue,
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, title: { type: 'string', maxLength: 200 }, body: { type: 'string', maxLength: 20000 } }, required: ['repo', 'title'] },
    validate: z.object({ repo, title: z.string().min(1).max(200), body: z.string().max(20_000).default('') }),
    async run(ctx, i) {
      return github(ctx).createIssue(i.repo, i.title, `${i.body}\n\n---\n_Created by an AI agent in Space after human approval._`);
    },
  },
};

export async function departmentStats(orgId: string, departmentId: string) {
  const db = getDb();
  const byStatus = await db
    .select({ s: S.tasks.status, n: count() })
    .from(S.tasks)
    .where(and(eq(S.tasks.orgId, orgId), eq(S.tasks.departmentId, departmentId)))
    .groupBy(S.tasks.status);
  const [{ overdue }] = await db
    .select({ overdue: count() })
    .from(S.tasks)
    .where(and(eq(S.tasks.orgId, orgId), eq(S.tasks.departmentId, departmentId), sql`${S.tasks.dueDate} < current_date`, sql`${S.tasks.status} <> 'done'`));
  const [{ done7 }] = await db
    .select({ done7: count() })
    .from(S.tasks)
    .where(and(eq(S.tasks.orgId, orgId), eq(S.tasks.departmentId, departmentId), sql`${S.tasks.completedAt} > now() - interval '7 days'`));
  const reqs = await db
    .select({ s: S.requests.state, n: count() })
    .from(S.requests)
    .where(and(eq(S.requests.orgId, orgId), eq(S.requests.toDepartmentId, departmentId)))
    .groupBy(S.requests.state);
  const upcoming = await db
    .select({ title: S.tasks.title, dueDate: S.tasks.dueDate, status: S.tasks.status, priority: S.tasks.priority })
    .from(S.tasks)
    .where(and(eq(S.tasks.orgId, orgId), eq(S.tasks.departmentId, departmentId), sql`${S.tasks.status} <> 'done'`, sql`${S.tasks.dueDate} is not null`))
    .orderBy(asc(S.tasks.dueDate))
    .limit(8);
  return {
    tasksByStatus: Object.fromEntries(byStatus.map((x) => [x.s, x.n])),
    overdueTasks: overdue,
    completedLast7Days: done7,
    incomingRequestsByState: Object.fromEntries(reqs.map((x) => [x.s, x.n])),
    upcomingDeadlines: upcoming,
  };
}

export async function saveDocument(ctx: ToolContext, name: string, markdown: string, taskId?: string) {
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const buf = Buffer.from(markdown, 'utf8');
  const key = `${ctx.orgId}/${crypto.randomUUID()}`;
  await storage().put(key, buf, 'text/markdown');
  const [f] = await getDb()
    .insert(S.files)
    .values({
      orgId: ctx.orgId,
      departmentId: ctx.departmentId,
      ownerAgentId: ctx.agentId,
      name: fileName,
      mime: 'text/markdown',
      size: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      storageKey: key,
      taskId: taskId ?? null,
      isKnowledge: true,
      textContent: markdown,
    })
    .returning();
  return { ok: true, file_id: f.id, name: fileName };
}

/** Serialise tool output for the model, fenced as untrusted data and size-capped. */
export function wrapToolOutput(toolName: string, output: unknown) {
  let s = typeof output === 'string' ? output : JSON.stringify(output, null, 1);
  if (s.length > MAX_TOOL_OUTPUT) s = s.slice(0, MAX_TOOL_OUTPUT) + '\n…[truncated]';
  // Neutralise attempts to close the fence from inside the data.
  s = s.replace(/<\/?untrusted_data/gi, '<_untrusted_data');
  return `<untrusted_data source="${toolName}">\n${s}\n</untrusted_data>`;
}

export { inArray };
