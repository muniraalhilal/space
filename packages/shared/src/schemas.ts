import { z } from 'zod';
import { AGENT_WORKFLOWS, DEPT_THEMES, ORG_ROLES, DEPT_ROLES, PRIORITIES, TASK_STATUSES, PRESENCE_STATUSES, AGENT_ROLES } from './domain';
import { REQUEST_ACTIONS } from './request-machine';
import { avatarConfigSchema, robotConfigSchema } from './avatar';

const uuid = z.string().uuid();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #a1b2c3');
const name = z.string().trim().min(1).max(120);
const longText = z.string().max(20_000);
const isoDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

/* ---------- auth ---------- */
export const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
export const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
  name: name,
});

/* ---------- organizations ---------- */
export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Lowercase letters, numbers and dashes');

export const createOrgSchema = z.object({
  name: name.max(60),
  slug: slugSchema,
  brandColor: hex.default('#7c83e8'),
  departments: z
    .array(z.object({ name: name.max(60), theme: z.enum(DEPT_THEMES) }))
    .max(20)
    .default([]),
});

export const updateOrgSchema = z.object({
  name: name.max(60).optional(),
  brandColor: hex.optional(),
  accentColor: hex.optional(),
  officeTheme: z.enum(['light', 'warm', 'cool']).optional(),
  settings: z
    .object({
      allowAgentExternalIntegrations: z.boolean().optional(),
      requireApprovalForAgentWrites: z.boolean().optional(),
      defaultAgentMonthlyBudgetUsd: z.number().min(0).max(100_000).optional(),
    })
    .optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  name: name,
  role: z.enum(ORG_ROLES),
  title: z.string().max(80).optional(),
  departmentId: uuid.optional(),
  departmentRole: z.enum(DEPT_ROLES).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(ORG_ROLES).optional(),
  title: z.string().max(80).optional(),
});

export const updateMeInOrgSchema = z.object({
  title: z.string().max(80).optional(),
  presence: z.enum(PRESENCE_STATUSES).optional(),
  avatar: avatarConfigSchema.optional(),
});

/* ---------- departments ---------- */
export const createDepartmentSchema = z.object({
  name: name.max(60),
  description: z.string().max(500).optional(),
  theme: z.enum(DEPT_THEMES),
  color: hex.optional(),
  floor: z.number().int().min(1).max(20).default(1),
});
export const updateDepartmentSchema = createDepartmentSchema.partial();
export const setDepartmentMemberSchema = z.object({ memberId: uuid, role: z.enum(DEPT_ROLES) });

/* ---------- projects ---------- */
export const createProjectSchema = z.object({
  departmentId: uuid,
  name: name,
  description: longText.optional(),
  dueDate: isoDate.nullable().optional(),
  color: hex.optional(),
});
export const updateProjectSchema = createProjectSchema.omit({ departmentId: true }).partial().extend({
  status: z.enum(['active', 'on_hold', 'completed', 'archived']).optional(),
});

/* ---------- tasks ---------- */
export const assigneeRef = z.object({ kind: z.enum(['member', 'agent']), id: uuid });
export const createTaskSchema = z.object({
  projectId: uuid,
  parentId: uuid.nullable().optional(),
  title: name.max(200),
  description: longText.optional(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(PRIORITIES).default('medium'),
  dueDate: isoDate.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  assignee: assigneeRef.nullable().optional(),
  collaboratorIds: z.array(uuid).max(20).optional(),
  requestId: uuid.nullable().optional(),
  labels: z.array(z.string().max(30)).max(10).optional(),
});
export const updateTaskSchema = z.object({
  /** Optimistic concurrency token — the `version` the client last saw. */
  version: z.number().int().min(0),
  title: name.max(200).optional(),
  description: longText.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: isoDate.nullable().optional(),
  startDate: isoDate.nullable().optional(),
  assignee: assigneeRef.nullable().optional(),
  collaboratorIds: z.array(uuid).max(20).optional(),
  labels: z.array(z.string().max(30)).max(10).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().optional(),
});
export const addDependencySchema = z.object({ dependsOnId: uuid });
export const taskQuerySchema = z.object({
  projectId: uuid.optional(),
  departmentId: uuid.optional(),
  assignee: z.enum(['me']).or(uuid).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  q: z.string().max(100).optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  parentId: uuid.or(z.literal('root')).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/* ---------- comments ---------- */
export const createCommentSchema = z.object({ body: z.string().trim().min(1).max(5000) });

/* ---------- cross-department requests ---------- */
export const createRequestSchema = z.object({
  fromDepartmentId: uuid,
  toDepartmentId: uuid,
  title: name.max(200),
  description: longText.min(1),
  priority: z.enum(PRIORITIES).default('medium'),
  dueDate: isoDate.nullable().optional(),
  labels: z.array(z.string().max(30)).max(10).optional(),
});
export const transitionRequestSchema = z.object({
  action: z.enum(REQUEST_ACTIONS),
  note: z.string().max(5000).optional(),
  /** Optimistic concurrency token. */
  version: z.number().int().min(0),
});

/* ---------- messages ---------- */
export const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(5000) });
export const openConversationSchema = z.object({ memberId: uuid });

/* ---------- agents ---------- */
export const createAgentSchema = z.object({
  name: name.max(60),
  role: z.enum(AGENT_ROLES),
  description: z.string().max(1000).optional(),
  departmentId: uuid.nullable().optional(),
  tools: z.array(z.string().max(60)).max(40),
  autonomy: z.enum(['supervised', 'autonomous']).default('supervised'),
  model: z.string().max(100).optional(),
  /** Omitted → the company's default budget (Settings → AI & integrations). */
  monthlyBudgetUsd: z.number().min(0).max(100_000).optional(),
  maxStepsPerRun: z.number().int().min(1).max(40).default(12),
  robot: robotConfigSchema.optional(),
  systemPrompt: z.string().max(8000).optional(),
});
export const updateAgentSchema = createAgentSchema.partial().extend({ enabled: z.boolean().optional() });
export const createAgentRunSchema = z.object({
  /** Department whose authorized context the run operates in. */
  departmentId: uuid,
  instruction: z.string().trim().min(3).max(8000),
  taskId: uuid.nullable().optional(),
  requestId: uuid.nullable().optional(),
  fileIds: z.array(uuid).max(10).optional(),
  idempotencyKey: z.string().max(100).optional(),
  /** `llm` runs the model tool-loop; the others are deterministic built-in workflows (no LLM involved). */
  workflow: z.enum(AGENT_WORKFLOWS).default('llm'),
});
export const decideApprovalSchema = z.object({ decision: z.enum(['approve', 'deny']), note: z.string().max(1000).optional() });

export const githubIntegrationSchema = z.object({
  token: z.string().min(10).max(500).optional(),
  allowedRepos: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/)).max(50),
  enabled: z.boolean(),
});

/* ---------- office ---------- */
export const officeLayoutRoomSchema = z.object({
  departmentId: uuid,
  x: z.number().min(-40).max(40),
  z: z.number().min(-40).max(40),
  w: z.number().min(3).max(12),
  d: z.number().min(3).max(12),
});
export const updateOfficeLayoutSchema = z.object({ floor: z.number().int().min(1).max(20), rooms: z.array(officeLayoutRoomSchema).max(40) });

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type TransitionRequestInput = z.infer<typeof transitionRequestSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type CreateAgentRunInput = z.infer<typeof createAgentRunSchema>;
