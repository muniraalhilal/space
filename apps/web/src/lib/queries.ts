'use client';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Me,
  OrgOverview,
  Member,
  Agent,
  Project,
  Task,
  TaskDetail,
  WorkRequest,
  WorkRequestDetail,
  Notification,
  Conversation,
  Message,
  CalendarEvent,
  FileItem,
  AgentRun,
  AgentRunDetail,
  Approval,
} from './types';
import { useOrgId } from './org-context';

export const qk = {
  me: ['me'] as const,
  org: (o: string) => ['org', o] as const,
  members: (o: string) => ['members', o] as const,
  agents: (o: string) => ['agents', o] as const,
  agent: (o: string, id: string) => ['agent', o, id] as const,
  agentMeta: (o: string) => ['agentMeta', o] as const,
  projects: (o: string, d?: string) => ['projects', o, d ?? 'all'] as const,
  project: (o: string, id: string) => ['project', o, id] as const,
  tasks: (o: string, params: Record<string, string | undefined>) => ['tasks', o, params] as const,
  task: (o: string, id: string) => ['task', o, id] as const,
  requests: (o: string, box: string, state?: string) => ['requests', o, box, state ?? 'any'] as const,
  request: (o: string, id: string) => ['request', o, id] as const,
  notifications: (o: string) => ['notifications', o] as const,
  conversations: (o: string) => ['conversations', o] as const,
  messages: (o: string, c: string) => ['messages', o, c] as const,
  calendar: (o: string, from: string, to: string) => ['calendar', o, from, to] as const,
  files: (o: string, d?: string, k?: boolean) => ['files', o, d ?? 'all', !!k] as const,
  reports: (o: string, days: number) => ['reports', o, days] as const,
  office: (o: string) => ['office', o] as const,
  dept: (o: string, id: string) => ['dept', o, id] as const,
  runs: (o: string, agentId?: string, deptId?: string) => ['runs', o, agentId ?? 'all', deptId ?? 'all'] as const,
  run: (o: string, id: string) => ['run', o, id] as const,
  approvals: (o: string) => ['approvals', o] as const,
  audit: (o: string) => ['audit', o] as const,
  github: (o: string) => ['github', o] as const,
  nextEvent: (o: string, m: string) => ['nextEvent', o, m] as const,
};

const qs = (p: Record<string, string | undefined>) => {
  const e = Object.entries(p).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return e.length ? `?${new URLSearchParams(e).toString()}` : '';
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api.get<Me>('/auth/me'), retry: false, staleTime: 60_000 });

export function useOrg() {
  const o = useOrgId();
  return useQuery({ queryKey: qk.org(o), queryFn: () => api.get<OrgOverview>(`/orgs/${o}`), staleTime: 30_000 });
}
export function useMembers() {
  const o = useOrgId();
  return useQuery({ queryKey: qk.members(o), queryFn: () => api.get<Member[]>(`/orgs/${o}/members`), staleTime: 30_000 });
}
export function useAgents() {
  const o = useOrgId();
  return useQuery({ queryKey: qk.agents(o), queryFn: () => api.get<Agent[]>(`/orgs/${o}/agents`), staleTime: 15_000 });
}
export function useAgent(id: string | null) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.agent(o, id ?? ''), queryFn: () => api.get<Agent>(`/orgs/${o}/agents/${id}`), enabled: !!id });
}
export function useAgentMeta() {
  const o = useOrgId();
  return useQuery({
    queryKey: qk.agentMeta(o),
    queryFn: () => api.get<{ tools: Array<{ name: string; label: string; description: string; risk: string; integration?: string }>; workflows: Record<string, string>; provider: { name: string; model: string } | null }>(`/orgs/${o}/agents/meta`),
    staleTime: 300_000,
  });
}
export function useOffice() {
  const o = useOrgId();
  return useQuery({ queryKey: qk.office(o), queryFn: () => api.get<Array<{ floor: number; rooms: Array<{ departmentId: string; x: number; z: number; w: number; d: number }> }>>(`/orgs/${o}/office`), staleTime: 60_000 });
}
export function useDepartment(id: string | null) {
  const o = useOrgId();
  return useQuery({
    queryKey: qk.dept(o, id ?? ''),
    queryFn: () =>
      api.get<{
        id: string;
        name: string;
        description: string | null;
        theme: string;
        color: string;
        floor: number;
        canRead: boolean;
        canAdmin: boolean;
        members: Array<{ id: string; name: string; title: string | null; presence: string; avatar: any; role: 'admin' | 'member' }>;
        stats: Record<string, number> | null;
      }>(`/orgs/${o}/departments/${id}`),
    enabled: !!id,
  });
}
export function useProjects(departmentId?: string) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.projects(o, departmentId), queryFn: () => api.get<Project[]>(`/orgs/${o}/projects${qs({ departmentId })}`) });
}
export function useProject(id: string) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.project(o, id), queryFn: () => api.get<Project>(`/orgs/${o}/projects/${id}`) });
}
export function useTasks(params: Record<string, string | undefined>, enabled = true) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.tasks(o, params), queryFn: () => api.get<Task[]>(`/orgs/${o}/tasks${qs(params)}`), enabled, placeholderData: keepPreviousData });
}
export function useTask(id: string | null) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.task(o, id ?? ''), queryFn: () => api.get<TaskDetail>(`/orgs/${o}/tasks/${id}`), enabled: !!id });
}
export function useRequests(box: 'all' | 'incoming' | 'outgoing', state?: string) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.requests(o, box, state), queryFn: () => api.get<WorkRequest[]>(`/orgs/${o}/requests${qs({ box, state })}`) });
}
export function useRequest(id: string | null) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.request(o, id ?? ''), queryFn: () => api.get<WorkRequestDetail>(`/orgs/${o}/requests/${id}`), enabled: !!id });
}
export function useNotifications() {
  const o = useOrgId();
  return useQuery({ queryKey: qk.notifications(o), queryFn: () => api.get<{ items: Notification[]; unread: number }>(`/orgs/${o}/notifications`) });
}
export function useConversations() {
  const o = useOrgId();
  return useQuery({ queryKey: qk.conversations(o), queryFn: () => api.get<Conversation[]>(`/orgs/${o}/conversations`) });
}
export function useMessages(c: string | null) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.messages(o, c ?? ''), queryFn: () => api.get<Message[]>(`/orgs/${o}/conversations/${c}/messages`), enabled: !!c });
}
export function useCalendar(from: string, to: string) {
  const o = useOrgId();
  return useQuery({
    queryKey: qk.calendar(o, from, to),
    queryFn: () => api.get<{ events: CalendarEvent[]; tasks: Array<Pick<Task, 'id' | 'title' | 'dueDate' | 'status' | 'priority' | 'departmentId' | 'assigneeMemberId'>> }>(`/orgs/${o}/calendar${qs({ from, to })}`),
    placeholderData: keepPreviousData,
  });
}
export function useNextEvent(memberId: string | null) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.nextEvent(o, memberId ?? ''), queryFn: () => api.get<CalendarEvent | null>(`/orgs/${o}/calendar/next/${memberId}`), enabled: !!memberId });
}
export function useFiles(departmentId?: string, knowledge?: boolean) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.files(o, departmentId, knowledge), queryFn: () => api.get<FileItem[]>(`/orgs/${o}/files${qs({ departmentId, knowledge: knowledge ? 'true' : undefined })}`) });
}
export function useReports(days: number) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.reports(o, days), queryFn: () => api.get<any>(`/orgs/${o}/reports/summary?days=${days}`) });
}
export interface ActivityItem {
  id: string;
  verb: string;
  entityType: 'task' | 'project' | 'request' | 'agent_run' | 'file';
  entityId: string;
  departmentId: string | null;
  departmentName: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  actor: string | null;
  actorIsAgent: boolean;
  title: string | null;
}
export function useActivity(limit = 8) {
  const o = useOrgId();
  return useQuery({ queryKey: ['activity', o, limit], queryFn: () => api.get<ActivityItem[]>(`/orgs/${o}/reports/activity?limit=${limit}`) });
}
export function useRuns(agentId?: string, departmentId?: string) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.runs(o, agentId, departmentId), queryFn: () => api.get<AgentRun[]>(`/orgs/${o}/agent-runs${qs({ agentId, departmentId })}`) });
}
export function useRun(id: string | null) {
  const o = useOrgId();
  return useQuery({ queryKey: qk.run(o, id ?? ''), queryFn: () => api.get<AgentRunDetail>(`/orgs/${o}/agent-runs/${id}`), enabled: !!id });
}
export function useApprovals() {
  const o = useOrgId();
  return useQuery({ queryKey: qk.approvals(o), queryFn: () => api.get<Approval[]>(`/orgs/${o}/agent-approvals`) });
}

/** Generic mutation that invalidates the given key prefixes on success. */
export function useApiMutation<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, invalidate: (v: TVars, r: TRes) => ReadonlyArray<readonly unknown[]>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      for (const k of invalidate(v, r)) qc.invalidateQueries({ queryKey: k });
    },
  });
}
