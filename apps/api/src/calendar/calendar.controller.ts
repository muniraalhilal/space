import { Body, Controller, Delete, Get, Injectable, Param, Post, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db/client';
import { Org, OrgContext } from '../common/context';
import { Errors } from '../common/errors';
import { UuidPipe, zp } from '../common/zod';
import { publish } from '../realtime/bus';

const S = schema;

const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(4000).optional(),
    location: z.string().max(120).optional(),
    departmentId: z.string().uuid().nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    attendeeIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: 'End must be after start', path: ['endsAt'] });

const rangeSchema = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) });

@Injectable()
export class CalendarService {
  async range(ctx: OrgContext, from: string, to: string) {
    const db = getDb();
    const readable = ctx.readableDeptIds();
    // Events: department events I can read, company-wide events, or events I attend.
    const evs = await db
      .select()
      .from(S.events)
      .where(
        and(
          eq(S.events.orgId, ctx.orgId),
          lt(S.events.startsAt, new Date(to)),
          gte(S.events.endsAt, new Date(from)),
          readable
            ? or(
                isNull(S.events.departmentId),
                readable.length ? inArray(S.events.departmentId, readable) : sql`false`,
                sql`exists (select 1 from event_attendees ea where ea.event_id = ${S.events.id} and ea.member_id = ${ctx.memberId})`,
              )
            : undefined,
        ),
      )
      .orderBy(asc(S.events.startsAt));
    const att = evs.length
      ? await db.select().from(S.eventAttendees).where(inArray(S.eventAttendees.eventId, evs.map((e) => e.id)))
      : [];
    const tasks = await db
      .select({ id: S.tasks.id, title: S.tasks.title, dueDate: S.tasks.dueDate, status: S.tasks.status, priority: S.tasks.priority, departmentId: S.tasks.departmentId, assigneeMemberId: S.tasks.assigneeMemberId })
      .from(S.tasks)
      .where(
        and(
          eq(S.tasks.orgId, ctx.orgId),
          gte(S.tasks.dueDate, from.slice(0, 10)),
          lt(S.tasks.dueDate, to.slice(0, 10)),
          readable ? (readable.length ? inArray(S.tasks.departmentId, readable) : sql`false`) : undefined,
        ),
      );
    return {
      events: evs.map((e) => ({ ...e, attendeeIds: att.filter((a) => a.eventId === e.id).map((a) => a.memberId) })),
      tasks,
    };
  }

  async nextForMember(ctx: OrgContext, memberId: string) {
    const [e] = await getDb()
      .select({ e: S.events })
      .from(S.eventAttendees)
      .innerJoin(S.events, eq(S.events.id, S.eventAttendees.eventId))
      .where(and(eq(S.eventAttendees.orgId, ctx.orgId), eq(S.eventAttendees.memberId, memberId), gte(S.events.endsAt, new Date())))
      .orderBy(asc(S.events.startsAt))
      .limit(1);
    return e?.e ?? null;
  }

  async create(ctx: OrgContext, input: z.infer<typeof createEventSchema>) {
    ctx.assertNotViewer();
    if (input.departmentId) ctx.assertWriteDept(input.departmentId);
    const db = getDb();
    const ev = await db.transaction(async (tx) => {
      const [ev] = await tx
        .insert(S.events)
        .values({ orgId: ctx.orgId, departmentId: input.departmentId ?? null, title: input.title, description: input.description, location: input.location, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), createdByMemberId: ctx.memberId })
        .returning();
      const ids = [...new Set([ctx.memberId, ...input.attendeeIds])];
      await tx.insert(S.eventAttendees).values(ids.map((memberId) => ({ orgId: ctx.orgId, eventId: ev.id, memberId })));
      return ev;
    });
    publish({ type: 'org.changed', orgId: ctx.orgId, scope: 'members' });
    return ev;
  }

  async remove(ctx: OrgContext, id: string) {
    const db = getDb();
    const [ev] = await db.select().from(S.events).where(and(eq(S.events.orgId, ctx.orgId), eq(S.events.id, id)));
    if (!ev) throw Errors.notFound('Event');
    if (ev.createdByMemberId !== ctx.memberId && !(ev.departmentId ? ctx.canAdminDept(ev.departmentId) : ctx.isCompanyAdmin)) throw Errors.forbidden();
    await db.delete(S.events).where(eq(S.events.id, id));
    return { ok: true };
  }
}

@Controller('orgs/:orgId/calendar')
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}
  @Get()
  range(@Org() ctx: OrgContext, @Query(zp(rangeSchema)) q: z.infer<typeof rangeSchema>) {
    return this.svc.range(ctx, q.from, q.to);
  }
  @Get('next/:memberId')
  next(@Org() ctx: OrgContext, @Param('memberId', UuidPipe) memberId: string) {
    return this.svc.nextForMember(ctx, memberId);
  }
  @Post()
  create(@Org() ctx: OrgContext, @Body(zp(createEventSchema)) b: z.infer<typeof createEventSchema>) {
    return this.svc.create(ctx, b);
  }
  @Delete(':id')
  remove(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.remove(ctx, id);
  }
}
