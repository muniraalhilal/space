import { DbOrTx, schema } from '../db/client';

/** Append a user-facing activity entry (task/project/request history). */
export async function recordActivity(
  tx: DbOrTx,
  a: {
    orgId: string;
    entityType: 'task' | 'project' | 'request' | 'agent_run' | 'file';
    entityId: string;
    departmentId?: string | null;
    actorMemberId?: string | null;
    actorAgentId?: string | null;
    verb: string;
    data?: Record<string, unknown>;
  },
) {
  await tx.insert(schema.activities).values({
    orgId: a.orgId,
    entityType: a.entityType,
    entityId: a.entityId,
    departmentId: a.departmentId ?? null,
    actorMemberId: a.actorMemberId ?? null,
    actorAgentId: a.actorAgentId ?? null,
    verb: a.verb,
    data: a.data ?? {},
  });
}
