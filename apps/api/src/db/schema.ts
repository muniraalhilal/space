/**
 * Space database schema (PostgreSQL, Drizzle ORM).
 *
 * Tenant integrity is enforced *in the database*: every tenant-owned table carries `org_id`
 * and references its parents through composite foreign keys `(org_id, parent_id) -> parent(org_id, id)`.
 * It is therefore impossible to persist a row that links records from two different companies,
 * even if an application bug slipped past the service-layer checks.
 */
import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
  date,
  doublePrecision,
  primaryKey,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
  bigint,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const orgId = () => uuid('org_id').notNull();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ enums */
export const orgRole = pgEnum('org_role', ['company_admin', 'employee', 'viewer']);
export const deptRole = pgEnum('dept_role', ['admin', 'member']);
export const deptTheme = pgEnum('dept_theme', ['development', 'design', 'marketing', 'hr', 'finance', 'operations', 'product', 'general']);
export const taskStatus = pgEnum('task_status', ['todo', 'in_progress', 'in_review', 'blocked', 'done']);
export const priority = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);
export const projectStatus = pgEnum('project_status', ['active', 'on_hold', 'completed', 'archived']);
export const presence = pgEnum('presence', ['available', 'working', 'in_meeting', 'focus', 'remote', 'away', 'on_break', 'offline']);
export const requestState = pgEnum('request_state', [
  'submitted',
  'clarification_requested',
  'accepted',
  'in_progress',
  'delivered',
  'changes_requested',
  'completed',
  'rejected',
  'cancelled',
]);
export const agentRole = pgEnum('agent_role', ['coding', 'research', 'design', 'data', 'documentation', 'project']);
export const agentAutonomy = pgEnum('agent_autonomy', ['supervised', 'autonomous']);
export const agentRunStatus = pgEnum('agent_run_status', ['queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled', 'timed_out']);
export const approvalStatus = pgEnum('approval_status', ['pending', 'approved', 'denied', 'expired']);

/* ------------------------------------------------------------------ identity */
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    preferences: jsonb('preferences').$type<{ focusMode?: boolean; reducedMotion?: boolean; office3d?: boolean; lastOrgId?: string }>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ tenancy */
export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    brandColor: text('brand_color').notNull().default('#7c83e8'),
    accentColor: text('accent_color').notNull().default('#f2b8c6'),
    logoFileId: uuid('logo_file_id'),
    officeTheme: text('office_theme').notNull().default('light'),
    settings: jsonb('settings')
      .$type<{ allowAgentExternalIntegrations?: boolean; requireApprovalForAgentWrites?: boolean; defaultAgentMonthlyBudgetUsd?: number }>()
      .notNull()
      .default({}),
    isDemo: boolean('is_demo').notNull().default(false),
    requestSeq: integer('request_seq').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)],
);

export const orgMembers = pgTable(
  'org_members',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull().default('employee'),
    title: text('title'),
    presence: presence('presence').notNull().default('available'),
    avatar: jsonb('avatar').notNull().default({}),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    joinedAt: createdAt(),
  },
  (t) => [unique('org_members_org_user_uq').on(t.orgId, t.userId), unique('org_members_org_id_uq').on(t.orgId, t.id)],
);

export const departments = pgTable(
  'departments',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    theme: deptTheme('theme').notNull().default('general'),
    color: text('color').notNull(),
    floor: integer('floor').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('departments_org_id_uq').on(t.orgId, t.id),
    uniqueIndex('departments_org_name_uq').on(t.orgId, sql`lower(${t.name})`),
  ],
);

export const departmentMembers = pgTable(
  'department_members',
  {
    orgId: orgId(),
    departmentId: uuid('department_id').notNull(),
    memberId: uuid('member_id').notNull(),
    role: deptRole('role').notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.departmentId, t.memberId] }),
    foreignKey({ columns: [t.orgId, t.departmentId], foreignColumns: [departments.orgId, departments.id], name: 'dm_dept_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.memberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'dm_member_fk' }).onDelete('cascade'),
    index('dm_member_idx').on(t.memberId),
  ],
);

export const officeLayouts = pgTable(
  'office_layouts',
  {
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    floor: integer('floor').notNull(),
    rooms: jsonb('rooms').$type<Array<{ departmentId: string; x: number; z: number; w: number; d: number }>>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.floor] })],
);

/* ------------------------------------------------------------------ AI agents */
export const agents = pgTable(
  'agents',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    /** null = central (company-wide) service agent */
    departmentId: uuid('department_id'),
    name: text('name').notNull(),
    role: agentRole('role').notNull(),
    description: text('description'),
    tools: text('tools').array().notNull().default(sql`'{}'::text[]`),
    autonomy: agentAutonomy('autonomy').notNull().default('supervised'),
    model: text('model'),
    systemPrompt: text('system_prompt'),
    monthlyBudgetUsd: numeric('monthly_budget_usd', { precision: 10, scale: 2 }).notNull().default('25'),
    maxStepsPerRun: integer('max_steps_per_run').notNull().default(12),
    robot: jsonb('robot').notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('agents_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.departmentId], foreignColumns: [departments.orgId, departments.id], name: 'agents_dept_fk' }).onDelete('cascade'),
  ],
);

/* ------------------------------------------------------------------ projects & tasks */
export const projects = pgTable(
  'projects',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: projectStatus('status').notNull().default('active'),
    color: text('color'),
    dueDate: date('due_date'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('projects_org_id_uq').on(t.orgId, t.id),
    unique('projects_org_dept_id_uq').on(t.orgId, t.departmentId, t.id),
    foreignKey({ columns: [t.orgId, t.departmentId], foreignColumns: [departments.orgId, departments.id], name: 'projects_dept_fk' }).onDelete('cascade'),
    index('projects_dept_idx').on(t.orgId, t.departmentId),
  ],
);

export const requests = pgTable(
  'requests',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    fromDepartmentId: uuid('from_department_id').notNull(),
    toDepartmentId: uuid('to_department_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    priority: priority('priority').notNull().default('medium'),
    dueDate: date('due_date'),
    labels: text('labels').array().notNull().default(sql`'{}'::text[]`),
    state: requestState('state').notNull().default('submitted'),
    version: integer('version').notNull().default(0),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('requests_org_id_uq').on(t.orgId, t.id),
    unique('requests_org_number_uq').on(t.orgId, t.number),
    foreignKey({ columns: [t.orgId, t.fromDepartmentId], foreignColumns: [departments.orgId, departments.id], name: 'requests_from_fk' }),
    foreignKey({ columns: [t.orgId, t.toDepartmentId], foreignColumns: [departments.orgId, departments.id], name: 'requests_to_fk' }),
    foreignKey({ columns: [t.orgId, t.createdByMemberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'requests_creator_fk' }),
    check('requests_distinct_depts', sql`${t.fromDepartmentId} <> ${t.toDepartmentId}`),
    index('requests_to_idx').on(t.orgId, t.toDepartmentId, t.state),
    index('requests_from_idx').on(t.orgId, t.fromDepartmentId, t.state),
  ],
);

export const requestEvents = pgTable(
  'request_events',
  {
    id: id(),
    orgId: orgId(),
    requestId: uuid('request_id').notNull(),
    actorMemberId: uuid('actor_member_id'),
    action: text('action').notNull(),
    fromState: requestState('from_state'),
    toState: requestState('to_state').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.requestId], foreignColumns: [requests.orgId, requests.id], name: 'request_events_req_fk' }).onDelete('cascade'),
    index('request_events_req_idx').on(t.requestId, t.createdAt),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    orgId: orgId(),
    projectId: uuid('project_id').notNull(),
    /** Denormalised from the project (kept consistent by a composite FK) for fast authorization filters. */
    departmentId: uuid('department_id').notNull(),
    parentId: uuid('parent_id'),
    requestId: uuid('request_id'),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatus('status').notNull().default('todo'),
    priority: priority('priority').notNull().default('medium'),
    assigneeMemberId: uuid('assignee_member_id'),
    assigneeAgentId: uuid('assignee_agent_id'),
    dueDate: date('due_date'),
    startDate: date('start_date'),
    progress: integer('progress').notNull().default(0),
    labels: text('labels').array().notNull().default(sql`'{}'::text[]`),
    sortOrder: doublePrecision('sort_order').notNull().default(0),
    version: integer('version').notNull().default(0),
    createdByMemberId: uuid('created_by_member_id'),
    createdByAgentId: uuid('created_by_agent_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tasks_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.departmentId, t.projectId], foreignColumns: [projects.orgId, projects.departmentId, projects.id], name: 'tasks_project_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.parentId], foreignColumns: [t.orgId, t.id], name: 'tasks_parent_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.requestId], foreignColumns: [requests.orgId, requests.id], name: 'tasks_request_fk' }).onDelete('set null'),
    foreignKey({ columns: [t.orgId, t.assigneeMemberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'tasks_assignee_member_fk' }),
    foreignKey({ columns: [t.orgId, t.assigneeAgentId], foreignColumns: [agents.orgId, agents.id], name: 'tasks_assignee_agent_fk' }),
    check('tasks_single_assignee', sql`${t.assigneeMemberId} IS NULL OR ${t.assigneeAgentId} IS NULL`),
    check('tasks_progress_range', sql`${t.progress} BETWEEN 0 AND 100`),
    index('tasks_dept_status_idx').on(t.orgId, t.departmentId, t.status),
    index('tasks_project_idx').on(t.orgId, t.projectId, t.sortOrder),
    index('tasks_assignee_member_idx').on(t.orgId, t.assigneeMemberId),
    index('tasks_assignee_agent_idx').on(t.orgId, t.assigneeAgentId),
    index('tasks_parent_idx').on(t.parentId),
    index('tasks_request_idx').on(t.requestId),
    index('tasks_due_idx').on(t.orgId, t.dueDate),
    index('tasks_title_trgm_idx').using('gin', sql`to_tsvector('simple', ${t.title})`),
  ],
);

export const taskCollaborators = pgTable(
  'task_collaborators',
  {
    orgId: orgId(),
    taskId: uuid('task_id').notNull(),
    memberId: uuid('member_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.memberId] }),
    foreignKey({ columns: [t.orgId, t.taskId], foreignColumns: [tasks.orgId, tasks.id], name: 'tc_task_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.memberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'tc_member_fk' }).onDelete('cascade'),
  ],
);

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    orgId: orgId(),
    taskId: uuid('task_id').notNull(),
    dependsOnId: uuid('depends_on_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    foreignKey({ columns: [t.orgId, t.taskId], foreignColumns: [tasks.orgId, tasks.id], name: 'td_task_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.dependsOnId], foreignColumns: [tasks.orgId, tasks.id], name: 'td_dep_fk' }).onDelete('cascade'),
    check('td_not_self', sql`${t.taskId} <> ${t.dependsOnId}`),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: id(),
    orgId: orgId(),
    taskId: uuid('task_id'),
    requestId: uuid('request_id'),
    authorMemberId: uuid('author_member_id'),
    authorAgentId: uuid('author_agent_id'),
    agentRunId: uuid('agent_run_id'),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.taskId], foreignColumns: [tasks.orgId, tasks.id], name: 'comments_task_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.requestId], foreignColumns: [requests.orgId, requests.id], name: 'comments_request_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.authorMemberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'comments_member_fk' }),
    foreignKey({ columns: [t.orgId, t.authorAgentId], foreignColumns: [agents.orgId, agents.id], name: 'comments_agent_fk' }),
    check('comments_one_target', sql`(${t.taskId} IS NULL) <> (${t.requestId} IS NULL)`),
    check('comments_one_author', sql`(${t.authorMemberId} IS NULL) <> (${t.authorAgentId} IS NULL)`),
    index('comments_task_idx').on(t.taskId, t.createdAt),
    index('comments_request_idx').on(t.requestId, t.createdAt),
  ],
);

/** User-facing activity feed for tasks/projects/requests (distinct from the security audit log). */
export const activities = pgTable(
  'activities',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    departmentId: uuid('department_id'),
    actorMemberId: uuid('actor_member_id'),
    actorAgentId: uuid('actor_agent_id'),
    verb: text('verb').notNull(),
    data: jsonb('data').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activities_entity_idx').on(t.orgId, t.entityType, t.entityId, t.createdAt), index('activities_org_time_idx').on(t.orgId, t.createdAt)],
);

/* ------------------------------------------------------------------ calendar */
export const events = pgTable(
  'events',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id'),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('events_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.departmentId], foreignColumns: [departments.orgId, departments.id], name: 'events_dept_fk' }).onDelete('cascade'),
    check('events_time_order', sql`${t.endsAt} > ${t.startsAt}`),
    index('events_time_idx').on(t.orgId, t.startsAt),
  ],
);

export const eventAttendees = pgTable(
  'event_attendees',
  {
    orgId: orgId(),
    eventId: uuid('event_id').notNull(),
    memberId: uuid('member_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.memberId] }),
    foreignKey({ columns: [t.orgId, t.eventId], foreignColumns: [events.orgId, events.id], name: 'ea_event_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.memberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'ea_member_fk' }).onDelete('cascade'),
    index('ea_member_idx').on(t.memberId),
  ],
);

/* ------------------------------------------------------------------ messaging */
export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    /** Sorted pair of member ids for direct messages — guarantees one DM thread per pair. */
    dmKey: text('dm_key').notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique('conversations_org_id_uq').on(t.orgId, t.id), unique('conversations_dm_uq').on(t.orgId, t.dmKey)],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    orgId: orgId(),
    conversationId: uuid('conversation_id').notNull(),
    memberId: uuid('member_id').notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.memberId] }),
    foreignKey({ columns: [t.orgId, t.conversationId], foreignColumns: [conversations.orgId, conversations.id], name: 'cm_conv_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.memberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'cm_member_fk' }).onDelete('cascade'),
    index('cm_member_idx').on(t.memberId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    orgId: orgId(),
    conversationId: uuid('conversation_id').notNull(),
    senderMemberId: uuid('sender_member_id').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.conversationId], foreignColumns: [conversations.orgId, conversations.id], name: 'messages_conv_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.senderMemberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'messages_sender_fk' }),
    index('messages_conv_time_idx').on(t.conversationId, t.createdAt),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    recipientMemberId: uuid('recipient_member_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.recipientMemberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'notifications_member_fk' }).onDelete('cascade'),
    index('notifications_recipient_idx').on(t.recipientMemberId, t.readAt, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ files & knowledge */
export const files = pgTable(
  'files',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    /** null = company-wide file (visible to all members) */
    departmentId: uuid('department_id'),
    ownerMemberId: uuid('owner_member_id'),
    ownerAgentId: uuid('owner_agent_id'),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    taskId: uuid('task_id'),
    requestId: uuid('request_id'),
    isKnowledge: boolean('is_knowledge').notNull().default(false),
    /** Extracted plain text (text-like files only, capped) — used by authorised agents. */
    textContent: text('text_content'),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('files_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.departmentId], foreignColumns: [departments.orgId, departments.id], name: 'files_dept_fk' }),
    foreignKey({ columns: [t.orgId, t.taskId], foreignColumns: [tasks.orgId, tasks.id], name: 'files_task_fk' }).onDelete('set null'),
    foreignKey({ columns: [t.orgId, t.requestId], foreignColumns: [requests.orgId, requests.id], name: 'files_request_fk' }).onDelete('set null'),
    foreignKey({ columns: [t.orgId, t.ownerMemberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'files_owner_fk' }),
    index('files_dept_idx').on(t.orgId, t.departmentId),
    index('files_task_idx').on(t.taskId),
    index('files_request_idx').on(t.requestId),
  ],
);

/* ------------------------------------------------------------------ agent execution */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull(),
    departmentId: uuid('department_id').notNull(),
    requestedByMemberId: uuid('requested_by_member_id').notNull(),
    instruction: text('instruction').notNull(),
    taskId: uuid('task_id'),
    requestId: uuid('request_id'),
    fileIds: uuid('file_ids').array().notNull().default(sql`'{}'::uuid[]`),
    status: agentRunStatus('status').notNull().default('queued'),
    idempotencyKey: text('idempotency_key'),
    provider: text('provider'),
    model: text('model'),
    steps: integer('steps').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    /** Conversation state persisted between steps so runs can pause for approval and resume. */
    transcript: jsonb('transcript').notNull().default([]),
    result: text('result'),
    error: text('error'),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    attempts: integer('attempts').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('agent_runs_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.agentId], foreignColumns: [agents.orgId, agents.id], name: 'runs_agent_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.departmentId], foreignColumns: [departments.orgId, departments.id], name: 'runs_dept_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.orgId, t.requestedByMemberId], foreignColumns: [orgMembers.orgId, orgMembers.id], name: 'runs_requester_fk' }),
    foreignKey({ columns: [t.orgId, t.taskId], foreignColumns: [tasks.orgId, tasks.id], name: 'runs_task_fk' }).onDelete('set null'),
    uniqueIndex('agent_runs_idem_uq').on(t.orgId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
    index('agent_runs_agent_idx').on(t.orgId, t.agentId, t.createdAt),
    index('agent_runs_status_idx').on(t.orgId, t.status),
  ],
);

export const agentRunSteps = pgTable(
  'agent_run_steps',
  {
    id: id(),
    orgId: orgId(),
    runId: uuid('run_id').notNull(),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(), // model | tool_call | tool_result | approval | log | error
    toolName: text('tool_name'),
    content: jsonb('content').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.runId], foreignColumns: [agentRuns.orgId, agentRuns.id], name: 'steps_run_fk' }).onDelete('cascade'),
    unique('steps_run_seq_uq').on(t.runId, t.seq),
  ],
);

export const agentApprovals = pgTable(
  'agent_approvals',
  {
    id: id(),
    orgId: orgId(),
    runId: uuid('run_id').notNull(),
    toolName: text('tool_name').notNull(),
    toolUseId: text('tool_use_id').notNull(),
    input: jsonb('input').notNull(),
    status: approvalStatus('status').notNull().default('pending'),
    decidedByMemberId: uuid('decided_by_member_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.runId], foreignColumns: [agentRuns.orgId, agentRuns.id], name: 'approvals_run_fk' }).onDelete('cascade'),
    index('approvals_status_idx').on(t.orgId, t.status),
  ],
);

export const integrations = pgTable(
  'integrations',
  {
    id: id(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    config: jsonb('config').$type<{ allowedRepos?: string[] }>().notNull().default({}),
    /** AES-256-GCM encrypted secret (iv:tag:ciphertext, base64). Never returned by the API. */
    secretEncrypted: text('secret_encrypted'),
    updatedAt: updatedAt(),
  },
  (t) => [unique('integrations_org_kind_uq').on(t.orgId, t.kind)],
);

/* ------------------------------------------------------------------ audit */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    orgId: uuid('org_id'),
    actorUserId: uuid('actor_user_id'),
    actorMemberId: uuid('actor_member_id'),
    actorAgentId: uuid('actor_agent_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    data: jsonb('data').notNull().default({}),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_org_time_idx').on(t.orgId, t.createdAt)],
);
