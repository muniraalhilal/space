import Redis from 'ioredis';
import { config } from '../config';

/**
 * Realtime events carry only identifiers — never record contents. Clients re-fetch through the
 * authorised REST API, so a misrouted event can never leak data between departments or tenants.
 */
export type RealtimeEvent =
  | { type: 'task.changed'; orgId: string; deptId: string; taskId: string; projectId: string }
  | { type: 'project.changed'; orgId: string; deptId: string; projectId: string }
  | { type: 'request.changed'; orgId: string; deptIds: string[]; requestId: string }
  | { type: 'notification.created'; orgId: string; memberId: string }
  | { type: 'message.created'; orgId: string; memberIds: string[]; conversationId: string }
  | { type: 'agent_run.changed'; orgId: string; deptId: string; runId: string; agentId: string; status: string }
  | { type: 'presence.changed'; orgId: string; memberId: string }
  | { type: 'org.changed'; orgId: string; scope: 'departments' | 'members' | 'office' | 'agents' | 'branding' };

export const EVENTS_CHANNEL = 'space:events';

export function roomsFor(e: RealtimeEvent): string[] {
  switch (e.type) {
    case 'task.changed':
    case 'project.changed':
      return [`d:${e.deptId}`, `oa:${e.orgId}`];
    case 'agent_run.changed':
      return [`d:${e.deptId}`, `oa:${e.orgId}`, `o:${e.orgId}:agents`];
    case 'request.changed':
      return [...e.deptIds.map((d) => `d:${d}`), `oa:${e.orgId}`];
    case 'notification.created':
      return [`m:${e.memberId}`];
    case 'message.created':
      return e.memberIds.map((m) => `m:${m}`);
    case 'presence.changed':
    case 'org.changed':
      return [`o:${e.orgId}`];
  }
}

let pub: Redis | null = null;
function publisher() {
  if (!pub) pub = new Redis(config().REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  return pub;
}

/** Fire-and-forget publish. Realtime is best-effort: persisted state is the source of truth. */
export function publish(e: RealtimeEvent) {
  publisher()
    .publish(EVENTS_CHANNEL, JSON.stringify(e))
    .catch(() => undefined);
}

export async function closeBus() {
  if (pub) await pub.quit().catch(() => undefined);
  pub = null;
}
