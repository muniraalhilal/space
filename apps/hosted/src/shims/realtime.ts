/**
 * Replacement for apps/web/src/lib/realtime.ts. Live updates come from the artifact database's
 * subscriptions: whenever any viewer changes data, the affected queries refresh.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { store, type TableName } from '../backend/store';

const AFFECTS: Partial<Record<TableName, string[]>> = {
  users: ['members', 'me', 'org', 'dept', 'conversations'],
  organizations: ['org', 'me'],
  orgMembers: ['members', 'org', 'dept', 'me', 'conversations'],
  departments: ['org', 'dept', 'office', 'reports'],
  departmentMembers: ['org', 'dept', 'members', 'me'],
  officeLayouts: ['office'],
  agents: ['agents', 'agent', 'org'],
  projects: ['projects', 'project', 'tasks'],
  requests: ['requests', 'request', 'dept', 'reports', 'task'],
  tasks: ['tasks', 'task', 'projects', 'project', 'reports', 'calendar', 'dept', 'members', 'request', 'agents'],
  comments: ['task', 'request', 'tasks'],
  activities: ['activity', 'reports', 'task'],
  events: ['calendar', 'nextEvent'],
  conversations: ['conversations'],
  messages: ['messages', 'conversations'],
  notifications: ['notifications'],
  files: ['files', 'task', 'request'],
  agentRuns: ['runs', 'run', 'agents', 'agent', 'reports'],
  agentApprovals: ['approvals', 'run', 'agents'],
  auditLogs: ['audit'],
};

export function useRealtime(_orgId?: string) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(store.status === 'ready');
  useEffect(() => {
    setConnected(store.status === 'ready');
    const off = store.onChange((changed) => {
      setConnected(store.status === 'ready');
      const keys = new Set<string>();
      changed.forEach((t) => (AFFECTS[t] ?? []).forEach((k) => keys.add(k)));
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    });
    return () => {
      off();
    };
  }, [qc]);
  return connected;
}
