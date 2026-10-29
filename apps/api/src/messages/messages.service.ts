import { Body, Controller, Get, HttpCode, Injectable, Param, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeAvatar, openConversationSchema, sendMessageSchema } from '@space/shared';
import { getDb, schema } from '../db/client';
import { Org, OrgContext } from '../common/context';
import { Errors } from '../common/errors';
import { UuidPipe, zp } from '../common/zod';
import { NotificationsService } from '../notifications/notifications.service';
import { publish } from '../realtime/bus';

const S = schema;

@Injectable()
export class MessagesService {
  constructor(private readonly notifications: NotificationsService) {}

  async conversations(ctx: OrgContext) {
    const db = getDb();
    const mine = await db
      .select({ c: S.conversations, lastReadAt: S.conversationMembers.lastReadAt })
      .from(S.conversationMembers)
      .innerJoin(S.conversations, eq(S.conversations.id, S.conversationMembers.conversationId))
      .where(and(eq(S.conversationMembers.orgId, ctx.orgId), eq(S.conversationMembers.memberId, ctx.memberId)))
      .orderBy(desc(S.conversations.lastMessageAt));
    const out = [];
    for (const row of mine) {
      const [other] = await db
        .select({ id: S.orgMembers.id, name: S.users.name, title: S.orgMembers.title, avatar: S.orgMembers.avatar, presence: S.orgMembers.presence })
        .from(S.conversationMembers)
        .innerJoin(S.orgMembers, eq(S.orgMembers.id, S.conversationMembers.memberId))
        .innerJoin(S.users, eq(S.users.id, S.orgMembers.userId))
        .where(and(eq(S.conversationMembers.conversationId, row.c.id), ne(S.conversationMembers.memberId, ctx.memberId)));
      const [last] = await db.select().from(S.messages).where(eq(S.messages.conversationId, row.c.id)).orderBy(desc(S.messages.createdAt)).limit(1);
      const [{ unread }] = await db
        .select({ unread: sql<number>`count(*)::int` })
        .from(S.messages)
        .where(
          and(
            eq(S.messages.conversationId, row.c.id),
            ne(S.messages.senderMemberId, ctx.memberId),
            row.lastReadAt ? sql`${S.messages.createdAt} > ${row.lastReadAt.toISOString()}` : undefined,
          ),
        );
      out.push({ id: row.c.id, other: other ? { ...other, avatar: normalizeAvatar(other.avatar) } : null, lastMessage: last ?? null, unread });
    }
    return out;
  }

  async open(ctx: OrgContext, otherId: string) {
    if (otherId === ctx.memberId) throw Errors.badRequest('You cannot message yourself');
    const db = getDb();
    const [other] = await db.select().from(S.orgMembers).where(and(eq(S.orgMembers.orgId, ctx.orgId), eq(S.orgMembers.id, otherId), isNull(S.orgMembers.deactivatedAt)));
    if (!other) throw Errors.notFound('Member');
    const dmKey = [ctx.memberId, otherId].sort().join(':');
    return db.transaction(async (tx) => {
      const [c] = await tx.insert(S.conversations).values({ orgId: ctx.orgId, dmKey }).onConflictDoNothing().returning();
      if (c) {
        await tx.insert(S.conversationMembers).values([
          { orgId: ctx.orgId, conversationId: c.id, memberId: ctx.memberId },
          { orgId: ctx.orgId, conversationId: c.id, memberId: otherId },
        ]);
        return { id: c.id };
      }
      const [existing] = await tx.select().from(S.conversations).where(and(eq(S.conversations.orgId, ctx.orgId), eq(S.conversations.dmKey, dmKey)));
      return { id: existing.id };
    });
  }

  private async assertMember(ctx: OrgContext, conversationId: string) {
    const [m] = await getDb()
      .select()
      .from(S.conversationMembers)
      .where(and(eq(S.conversationMembers.orgId, ctx.orgId), eq(S.conversationMembers.conversationId, conversationId), eq(S.conversationMembers.memberId, ctx.memberId)));
    if (!m) throw Errors.notFound('Conversation');
  }

  async messages(ctx: OrgContext, conversationId: string, before?: string) {
    await this.assertMember(ctx, conversationId);
    const rows = await getDb()
      .select()
      .from(S.messages)
      .where(and(eq(S.messages.orgId, ctx.orgId), eq(S.messages.conversationId, conversationId), before ? lt(S.messages.createdAt, new Date(before)) : undefined))
      .orderBy(desc(S.messages.createdAt))
      .limit(100);
    return rows.reverse();
  }

  async send(ctx: OrgContext, conversationId: string, body: string) {
    await this.assertMember(ctx, conversationId);
    const db = getDb();
    const res = await db.transaction(async (tx) => {
      const [msg] = await tx.insert(S.messages).values({ orgId: ctx.orgId, conversationId, senderMemberId: ctx.memberId, body }).returning();
      await tx.update(S.conversations).set({ lastMessageAt: msg.createdAt }).where(eq(S.conversations.id, conversationId));
      await tx.update(S.conversationMembers).set({ lastReadAt: msg.createdAt }).where(and(eq(S.conversationMembers.conversationId, conversationId), eq(S.conversationMembers.memberId, ctx.memberId)));
      const members = await tx.select({ m: S.conversationMembers.memberId }).from(S.conversationMembers).where(eq(S.conversationMembers.conversationId, conversationId));
      return { msg, memberIds: members.map((m) => m.m) };
    });
    publish({ type: 'message.created', orgId: ctx.orgId, memberIds: res.memberIds, conversationId });
    return res.msg;
  }

  async markRead(ctx: OrgContext, conversationId: string) {
    await this.assertMember(ctx, conversationId);
    await getDb()
      .update(S.conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(S.conversationMembers.conversationId, conversationId), eq(S.conversationMembers.memberId, ctx.memberId)));
    return { ok: true };
  }
}

@Controller('orgs/:orgId/conversations')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get()
  list(@Org() ctx: OrgContext) {
    return this.svc.conversations(ctx);
  }
  @Post()
  open(@Org() ctx: OrgContext, @Body(zp(openConversationSchema)) b: z.infer<typeof openConversationSchema>) {
    return this.svc.open(ctx, b.memberId);
  }
  @Get(':id/messages')
  messages(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Query('before') before?: string) {
    return this.svc.messages(ctx, id, before && !isNaN(Date.parse(before)) ? before : undefined);
  }
  @Post(':id/messages')
  send(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(sendMessageSchema)) b: z.infer<typeof sendMessageSchema>) {
    return this.svc.send(ctx, id, b.body);
  }
  @Post(':id/read')
  @HttpCode(200)
  read(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.markRead(ctx, id);
  }
}
