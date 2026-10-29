import type {
  AvatarConfig,
  RobotConfig,
  TaskStatus,
  Priority,
  PresenceStatus,
  RequestState,
  RequestAction,
  RequestSide,
  AgentRole,
  DeptTheme,
  OrgRole,
  DeptRole,
  AgentRunStatus,
} from '@space/shared';

export interface Me {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean; preferences: { focusMode?: boolean; reducedMotion?: boolean; office3d?: boolean; lastOrgId?: string } };
  organizations: Array<{ id: string; slug: string; name: string; brandColor: string; isDemo: boolean; role: OrgRole; memberId: string }>;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  theme: DeptTheme;
  color: string;
  floor: number;
  memberCount: number;
  agentCount: number;
  myRole: DeptRole | null;
  canRead: boolean;
  canAdmin: boolean;
}

export interface OrgOverview {
  organization: {
    id: string;
    slug: string;
    name: string;
    displayName: string;
    brandColor: string;
    accentColor: string;
    logoFileId: string | null;
    officeTheme: 'light' | 'warm' | 'cool';
    isDemo: boolean;
    settings?: { allowAgentExternalIntegrations?: boolean; requireApprovalForAgentWrites?: boolean; defaultAgentMonthlyBudgetUsd?: number };
  };
  me: { memberId: string; role: OrgRole; name: string; email: string; title: string | null; presence: PresenceStatus; avatar: AvatarConfig; departments: Record<string, DeptRole> };
  departments: Department[];
  floors: number[];
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  email?: string;
  role: OrgRole;
  title: string | null;
  presence: PresenceStatus;
  avatar: AvatarConfig;
  joinedAt: string;
  departments: Array<{ departmentId: string; role: DeptRole }>;
  /** The person's latest in-progress task, when the viewer may see it. */
  currentTask?: { id: string; title: string } | null;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  description: string | null;
  departmentId: string | null;
  tools: string[];
  autonomy: 'supervised' | 'autonomous';
  enabled: boolean;
  robot: RobotConfig;
  monthlyBudgetUsd: number;
  maxStepsPerRun: number;
  model: string | null;
  status: 'idle' | 'queued' | 'running' | 'awaiting_approval' | 'disabled';
  currentRun: { id: string; instruction: string; status: AgentRunStatus } | null;
  openAssignedTasks: number;
  last30d: { finished: number; succeeded: number; successRate: number | null };
  canManage: boolean;
  systemPrompt?: string | null;
  spentThisMonthUsd?: number;
}

export interface Project {
  id: string;
  orgId: string;
  departmentId: string;
  name: string;
  description: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'archived';
  color: string | null;
  dueDate: string | null;
  taskCount?: number;
  doneCount?: number;
  canAdmin?: boolean;
  canWrite?: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  departmentId: string;
  parentId: string | null;
  requestId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeMemberId: string | null;
  assigneeAgentId: string | null;
  dueDate: string | null;
  startDate: string | null;
  progress: number;
  labels: string[];
  sortOrder: number;
  version: number;
  createdByMemberId: string | null;
  createdByAgentId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  projectName?: string;
  projectColor?: string | null;
  subtaskCount?: number;
  subtaskDone?: number;
  commentCount?: number;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorMemberId: string | null;
  authorAgentId?: string | null;
  agentRunId?: string | null;
  authorName: string;
}

export interface Activity {
  id: string;
  verb: string;
  actorMemberId: string | null;
  actorAgentId: string | null;
  data: any;
  createdAt: string;
}

export interface FileItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  departmentId?: string | null;
  taskId?: string | null;
  requestId?: string | null;
  isKnowledge?: boolean;
  ownerMemberId?: string | null;
  ownerAgentId?: string | null;
  ownerName?: string | null;
  retentionUntil?: string | null;
}

export interface TaskDetail extends Task {
  project: { id: string; name: string; color: string | null };
  parent: { id: string; title: string } | null;
  subtasks: Task[];
  dependencies: Array<{ id: string; title: string; status: TaskStatus }>;
  blocking: Array<{ id: string; title: string; status: TaskStatus }>;
  collaboratorIds: string[];
  comments: Comment[];
  activity: Activity[];
  files: FileItem[];
  request: { id: string; number: number; title: string; state: RequestState } | null;
  canWrite: boolean;
  canAdmin: boolean;
}

export interface DeptRef {
  id: string;
  name: string;
  theme: DeptTheme;
  color: string;
}

export interface WorkRequest {
  id: string;
  number: number;
  fromDepartmentId: string;
  toDepartmentId: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  labels: string[];
  state: RequestState;
  version: number;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  from: DeptRef;
  to: DeptRef;
  creatorName: string;
  progress: { total: number; done: number };
  actions: RequestAction[];
}

export interface WorkRequestDetail extends WorkRequest {
  events: Array<{ id: string; action: string; fromState: RequestState | null; toState: RequestState; note: string | null; createdAt: string; actorName: string | null }>;
  comments: Comment[];
  tasks: Array<Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'progress' | 'dueDate' | 'assigneeMemberId' | 'assigneeAgentId'>>;
  files: FileItem[];
  sides: RequestSide[];
  canComment: boolean;
  canPlan: boolean;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  other: { id: string; name: string; title: string | null; avatar: AvatarConfig; presence: PresenceStatus } | null;
  lastMessage: { id: string; body: string; createdAt: string; senderMemberId: string } | null;
  unread: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderMemberId: string;
  body: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  departmentId: string | null;
  startsAt: string;
  endsAt: string;
  createdByMemberId: string;
  attendeeIds: string[];
}

export interface AgentRun {
  id: string;
  agentId: string;
  agentName?: string;
  departmentId: string;
  requestedByMemberId: string;
  requestedBy?: string;
  instruction: string;
  taskId: string | null;
  requestId: string | null;
  status: AgentRunStatus;
  provider: string | null;
  model: string | null;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  result: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AgentRunDetail extends AgentRun {
  agent: { name: string; role: AgentRole; robot: RobotConfig };
  stepLog: Array<{ id: string; seq: number; kind: string; toolName: string | null; content: any; createdAt: string }>;
  approvals: Array<{ id: string; toolName: string; input: any; status: string; note: string | null; decidedAt: string | null; createdAt: string }>;
  canCancel: boolean;
  canDecide: boolean;
}

export interface Approval {
  id: string;
  runId: string;
  toolName: string;
  toolLabel: string;
  risk: string;
  input: any;
  agentName: string;
  runInstruction: string;
  departmentId: string;
  canDecide: boolean;
  createdAt: string;
}

export type { AvatarConfig, RobotConfig, TaskStatus, Priority, PresenceStatus, RequestState, RequestAction };
