'use client';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

type Ev =
  | { type: 'task.changed'; taskId: string; projectId: string; deptId: string }
  | { type: 'project.changed'; projectId: string }
  | { type: 'request.changed'; requestId: string }
  | { type: 'notification.created' }
  | { type: 'message.created'; conversationId: string }
  | { type: 'agent_run.changed'; runId: string; agentId: string; status: string }
  | { type: 'presence.changed' }
  | { type: 'org.changed'; scope: string };

/**
 * Subscribes to server events for an organisation and invalidates the matching queries.
 * Events never carry record contents; all data is re-fetched through the authorised REST API.
 */
export function useRealtime(orgId: string) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_REALTIME_URL;
    const socket: Socket = io(url ?? undefined, { path: '/realtime', withCredentials: true, transports: url ? ['websocket', 'polling'] : ['polling'] });
    const join = () => socket.emit('join', { orgId }, (r: { ok: boolean }) => setConnected(!!r?.ok));
    socket.on('connect', join);
    socket.on('disconnect', () => setConnected(false));
    socket.on('event', (e: Ev) => {
      const inv = (k: unknown[]) => qc.invalidateQueries({ queryKey: k });
      switch (e.type) {
        case 'task.changed':
          inv(['tasks', orgId]);
          inv(['task', orgId, e.taskId]);
          inv(['projects', orgId]);
          inv(['reports', orgId]);
          inv(['calendar', orgId]);
          inv(['dept', orgId]);
          inv(['members', orgId]);
          inv(['activity', orgId]);
          break;
        case 'project.changed':
          inv(['projects', orgId]);
          inv(['project', orgId, e.projectId]);
          break;
        case 'request.changed':
          inv(['requests', orgId]);
          inv(['request', orgId, e.requestId]);
          inv(['activity', orgId]);
          inv(['dept', orgId]);
          break;
        case 'notification.created':
          inv(['notifications', orgId]);
          break;
        case 'message.created':
          inv(['conversations', orgId]);
          inv(['messages', orgId, e.conversationId]);
          break;
        case 'agent_run.changed':
          inv(['agents', orgId]);
          inv(['agent', orgId, e.agentId]);
          inv(['runs', orgId]);
          inv(['run', orgId, e.runId]);
          inv(['approvals', orgId]);
          inv(['files', orgId]);
          break;
        case 'presence.changed':
          inv(['members', orgId]);
          inv(['dept', orgId]);
          inv(['org', orgId]);
          break;
        case 'org.changed':
          inv(['org', orgId]);
          inv(['members', orgId]);
          inv(['office', orgId]);
          inv(['agents', orgId]);
          inv(['dept', orgId]);
          break;
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [orgId, qc]);
  return connected;
}
