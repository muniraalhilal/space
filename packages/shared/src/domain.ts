/**
 * Core domain enumerations shared by the API, worker and web app.
 * These mirror Postgres enum types defined in apps/api/src/db/schema.ts.
 */

export const ORG_ROLES = ['company_admin', 'employee', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const DEPT_ROLES = ['admin', 'member'] as const;
export type DeptRole = (typeof DEPT_ROLES)[number];

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
};

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRESENCE_STATUSES = ['available', 'working', 'in_meeting', 'focus', 'remote', 'away', 'on_break', 'offline'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  available: 'Available',
  working: 'Working',
  in_meeting: 'In meeting',
  focus: 'Focus',
  remote: 'Working remotely',
  away: 'Away',
  on_break: 'On break',
  offline: 'Offline',
};

/**
 * Where a person is, in the four buckets the office shows: in the office (at or around their desk),
 * working remotely, away (stepped out / on a break), or offline.
 */
export type PresenceGroup = 'in_office' | 'remote' | 'away' | 'offline';
export const PRESENCE_GROUP_LABEL: Record<PresenceGroup, string> = { in_office: 'In office', remote: 'Remote', away: 'Away', offline: 'Offline' };
export function presenceGroup(p: PresenceStatus): PresenceGroup {
  if (p === 'remote') return 'remote';
  if (p === 'away' || p === 'on_break') return 'away';
  if (p === 'offline') return 'offline';
  return 'in_office';
}

export const AGENT_RUN_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export const AGENT_RUN_ACTIVE: AgentRunStatus[] = ['queued', 'running', 'awaiting_approval'];

export const AGENT_ROLES = ['coding', 'research', 'design', 'data', 'documentation', 'project'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_ROLE_LABEL: Record<AgentRole, string> = {
  coding: 'Coding Agent',
  research: 'Research Agent',
  design: 'Design Agent',
  data: 'Data Agent',
  documentation: 'Documentation Agent',
  project: 'Project Assistant',
};

/** Department visual themes used by the 3D office. Companies may create any department and pick a theme. */
export const DEPT_THEMES = ['development', 'design', 'marketing', 'hr', 'finance', 'operations', 'product', 'general'] as const;
export type DeptTheme = (typeof DEPT_THEMES)[number];

export const DEPT_THEME_DEFAULT_COLOR: Record<DeptTheme, string> = {
  development: '#8fb3e8',
  design: '#e8a7c0',
  marketing: '#f0b48a',
  hr: '#e4a9a9',
  finance: '#9cc4a8',
  operations: '#b0a3d9',
  product: '#8cc9bd',
  general: '#c9bfae',
};

export const NOTIFICATION_KINDS = [
  'task_assigned',
  'task_updated',
  'task_comment',
  'request_received',
  'request_updated',
  'request_comment',
  'message',
  'agent_run_finished',
  'approval_required',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'org.create',
  'org.update',
  'member.invite',
  'member.update',
  'member.remove',
  'department.create',
  'department.update',
  'department.delete',
  'department.member.set',
  'project.create',
  'project.update',
  'project.delete',
  'task.create',
  'task.update',
  'task.delete',
  'request.create',
  'request.transition',
  'file.upload',
  'file.delete',
  'agent.create',
  'agent.update',
  'agent.run.create',
  'agent.run.cancel',
  'agent.approval.decide',
  'integration.update',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AGENT_WORKFLOWS = ['llm', 'department_report', 'extract_action_items', 'github_digest'] as const;
export type AgentWorkflow = (typeof AGENT_WORKFLOWS)[number];
export const AGENT_WORKFLOW_LABEL: Record<AgentWorkflow, string> = {
  llm: 'AI instruction (language model)',
  department_report: 'Department status report (built-in, no LLM)',
  extract_action_items: 'Extract action items from files (built-in, no LLM)',
  github_digest: 'GitHub activity digest (built-in, no LLM)',
};
