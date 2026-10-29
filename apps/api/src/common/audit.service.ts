import { Injectable } from '@nestjs/common';
import type { AuditAction } from '@space/shared';
import { getDb, DbOrTx, schema } from '../db/client';
import type { OrgContext } from './context';

@Injectable()
export class AuditService {
  /** Writes an append-only security audit entry. Pass `tx` to make it atomic with the change. */
  async log(
    ctx: Pick<OrgContext, 'orgId' | 'memberId' | 'userId' | 'ip'> | null,
    action: AuditAction,
    entity?: { type: string; id?: string | null },
    data: Record<string, unknown> = {},
    tx?: DbOrTx,
    extra: { userId?: string; agentId?: string; ip?: string } = {},
  ) {
    await (tx ?? getDb()).insert(schema.auditLogs).values({
      orgId: ctx?.orgId ?? null,
      actorUserId: ctx?.userId ?? extra.userId ?? null,
      actorMemberId: ctx?.memberId ?? null,
      actorAgentId: extra.agentId ?? null,
      action,
      entityType: entity?.type,
      entityId: entity?.id ?? null,
      data,
      ip: ctx?.ip ?? extra.ip ?? null,
    });
  }
}
