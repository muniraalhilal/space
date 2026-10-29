import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql, count } from 'drizzle-orm';
import type { NotificationKind } from '@space/shared';
import { DbOrTx, getDb, schema } from '../db/client';
import { publish } from '../realtime/bus';
import type { OrgContext } from '../common/context';

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  /**
   * Insert notifications inside the caller's transaction. Returns a function that publishes the
   * realtime pings — call it only after the transaction commits.
   */
  async create(tx: DbOrTx, orgId: string, recipientIds: Iterable<string>, n: NotificationInput, exceptMemberId?: string) {
    const ids = [...new Set(recipientIds)].filter((id) => id && id !== exceptMemberId);
    if (ids.length) {
      await tx.insert(schema.notifications).values(
        ids.map((recipientMemberId) => ({ orgId, recipientMemberId, kind: n.kind, title: n.title, body: n.body, entityType: n.entityType, entityId: n.entityId })),
      );
    }
    return () => ids.forEach((memberId) => publish({ type: 'notification.created', orgId, memberId }));
  }

  async list(ctx: OrgContext, unreadOnly: boolean) {
    const db = getDb();
    const where = and(
      eq(schema.notifications.orgId, ctx.orgId),
      eq(schema.notifications.recipientMemberId, ctx.memberId),
      unreadOnly ? isNull(schema.notifications.readAt) : undefined,
    );
    const items = await db.select().from(schema.notifications).where(where).orderBy(desc(schema.notifications.createdAt)).limit(100);
    const [{ unread }] = await db
      .select({ unread: count() })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.orgId, ctx.orgId), eq(schema.notifications.recipientMemberId, ctx.memberId), isNull(schema.notifications.readAt)));
    return { items, unread };
  }

  async markRead(ctx: OrgContext, id: string | 'all') {
    await getDb()
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.orgId, ctx.orgId),
          eq(schema.notifications.recipientMemberId, ctx.memberId),
          isNull(schema.notifications.readAt),
          id === 'all' ? sql`true` : eq(schema.notifications.id, id),
        ),
      );
    return { ok: true };
  }
}
