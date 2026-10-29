/**
 * Seeds the fictional demo company "Juniper" (displayed as "Juniper Space") plus a small second
 * company ("Qamar Studio") used to demonstrate company switching and tenant isolation.
 *
 * Idempotent: existing demo organisations are deleted and recreated. Demo users keep their ids.
 * No agent runs are seeded — AI activity in the demo only exists if someone actually runs an agent.
 */
import bcrypt from 'bcryptjs';
import { eq, inArray, sql } from 'drizzle-orm';
import { DEPT_THEME_DEFAULT_COLOR, DEFAULT_AVATAR, REQUEST_TRANSITIONS, type RequestAction, type RequestState } from '@space/shared';
import { getDb, closeDb, schema as S } from '../client';
import { runMigrations } from '../migrate';
import { placeRooms } from '../../office/layout';
import { DEPARTMENTS, PEOPLE, AGENTS, PROJECTS, REQUESTS } from './data';
import { closeBus } from '../../realtime/bus';

export const DEMO_PASSWORD = 'space-demo-2026';

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

export async function seed() {
  const db = getDb();
  await db.delete(S.organizations).where(inArray(S.organizations.slug, ['juniper', 'qamar']));
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Users (upsert by email)
  const userIds: Record<string, string> = {};
  for (const p of PEOPLE) {
    const [existing] = await db.select().from(S.users).where(sql`lower(${S.users.email}) = ${p.email}`);
    if (existing) {
      await db.update(S.users).set({ name: p.name, passwordHash: hash }).where(eq(S.users.id, existing.id));
      userIds[p.key] = existing.id;
    } else {
      const [u] = await db.insert(S.users).values({ email: p.email, name: p.name, passwordHash: hash }).returning();
      userIds[p.key] = u.id;
    }
  }

  /* ------------------------------------------------------------ Juniper */
  const [org] = await db
    .insert(S.organizations)
    .values({
      slug: 'juniper',
      name: 'Juniper',
      brandColor: '#7c83e8',
      accentColor: '#f2b8c6',
      isDemo: true,
      settings: { requireApprovalForAgentWrites: true, allowAgentExternalIntegrations: false, defaultAgentMonthlyBudgetUsd: 25 },
    })
    .returning();
  const orgId = org.id;

  const deptIds: Record<string, string> = {};
  let i = 0;
  for (const d of DEPARTMENTS) {
    const [row] = await db
      .insert(S.departments)
      .values({ orgId, name: d.name, theme: d.theme as any, color: DEPT_THEME_DEFAULT_COLOR[d.theme as keyof typeof DEPT_THEME_DEFAULT_COLOR], floor: d.floor, description: d.description, sortOrder: i++ })
      .returning();
    deptIds[d.key] = row.id;
  }
  for (const floor of [1, 2]) {
    const ids = DEPARTMENTS.filter((d) => d.floor === floor).map((d) => deptIds[d.key]);
    await db.insert(S.officeLayouts).values({ orgId, floor, rooms: placeRooms([], ids) });
  }

  const memberIds: Record<string, string> = {};
  for (const p of PEOPLE) {
    const [m] = await db
      .insert(S.orgMembers)
      .values({ orgId, userId: userIds[p.key], role: p.role, title: p.title, presence: p.presence, avatar: { ...DEFAULT_AVATAR, ...p.avatar } })
      .returning();
    memberIds[p.key] = m.id;
    for (const [dk, role] of p.depts) {
      await db.insert(S.departmentMembers).values({ orgId, departmentId: deptIds[dk], memberId: m.id, role });
    }
  }

  const agentIds: Record<string, string> = {};
  for (const a of AGENTS) {
    const [row] = await db
      .insert(S.agents)
      .values({ orgId, departmentId: a.dept ? deptIds[a.dept] : null, name: a.name, role: a.role, description: a.description, tools: a.tools, robot: a.robot, autonomy: a.autonomy ?? 'supervised', monthlyBudgetUsd: '25' })
      .returning();
    agentIds[a.key] = row.id;
  }

  const assign = (k?: string) =>
    !k ? {} : k.startsWith('agent:') ? { assigneeAgentId: agentIds[k.slice(6)] } : { assigneeMemberId: memberIds[k] };

  const projectIds: Record<string, { id: string; dept: string }> = {};
  const taskKeys: Record<string, string> = {};
  const pendingDeps: Array<[string, string[]]> = [];

  async function insertTask(projectId: string, deptKey: string, t: any, sort: number, requestId?: string) {
    const deptId = deptIds[deptKey];
    const createdAt = hoursAgo(24 * 6 + sort * 5);
    const [row] = await db
      .insert(S.tasks)
      .values({
        orgId,
        projectId,
        departmentId: deptId,
        requestId: requestId ?? null,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: day(t.due),
        progress: t.status === 'done' ? 100 : t.progress ?? 0,
        labels: t.labels ?? [],
        sortOrder: sort,
        createdByMemberId: memberIds[PEOPLE.find((p) => p.depts.some(([d, r]) => d === deptKey && r === 'admin'))!.key],
        completedAt: t.status === 'done' ? hoursAgo(10 + sort * 7) : null,
        createdAt,
        updatedAt: createdAt,
        ...assign(t.assignee),
      })
      .returning();
    await db.insert(S.activities).values({ orgId, entityType: 'task', entityId: row.id, departmentId: deptId, actorMemberId: row.createdByMemberId, verb: 'created', data: { title: row.title }, createdAt });
    if (t.status === 'done') {
      await db.insert(S.activities).values({ orgId, entityType: 'task', entityId: row.id, departmentId: deptId, actorMemberId: row.assigneeMemberId ?? row.createdByMemberId, verb: 'status_changed', data: { from: 'in_progress', to: 'done' }, createdAt: row.completedAt! });
    }
    if (t.key) taskKeys[t.key] = row.id;
    if (t.dependsOn?.length) pendingDeps.push([row.id, t.dependsOn]);
    let s = 0;
    for (const st of t.subtasks ?? []) {
      await db.insert(S.tasks).values({
        orgId,
        projectId,
        departmentId: deptId,
        parentId: row.id,
        title: st.title,
        status: st.status,
        priority: 'medium',
        sortOrder: s++,
        createdByMemberId: row.createdByMemberId,
        completedAt: st.status === 'done' ? hoursAgo(20) : null,
        progress: st.status === 'done' ? 100 : 0,
        ...assign(st.assignee),
      });
    }
    let c = 0;
    for (const [who, body] of t.comments ?? []) {
      await db.insert(S.comments).values({ orgId, taskId: row.id, authorMemberId: memberIds[who], body, createdAt: hoursAgo(30 - c++ * 4) });
    }
    return row;
  }

  for (const p of PROJECTS) {
    const [row] = await db
      .insert(S.projects)
      .values({ orgId, departmentId: deptIds[p.dept], name: p.name, description: p.description, dueDate: day(p.due), color: DEPT_THEME_DEFAULT_COLOR[DEPARTMENTS.find((d) => d.key === p.dept)!.theme as keyof typeof DEPT_THEME_DEFAULT_COLOR], createdByMemberId: memberIds.munira })
      .returning();
    projectIds[p.name] = { id: row.id, dept: p.dept };
    let sort = 1;
    for (const t of p.tasks) await insertTask(row.id, p.dept, t, sort++);
  }
  for (const [taskId, deps] of pendingDeps) {
    for (const k of deps) if (taskKeys[k]) await db.insert(S.taskDependencies).values({ orgId, taskId, dependsOnId: taskKeys[k] });
  }

  // Requests replayed through the real state machine definitions.
  let n = 0;
  for (const r of REQUESTS) {
    n++;
    const created = hoursAgo(Math.max(...r.path.map((p) => p.hoursAgo), 2) + 4);
    let state: RequestState = 'submitted';
    const events: Array<typeof S.requestEvents.$inferInsert> = [];
    const [row] = await db
      .insert(S.requests)
      .values({
        orgId,
        number: n,
        fromDepartmentId: deptIds[r.from],
        toDepartmentId: deptIds[r.to],
        title: r.title,
        description: r.description,
        priority: r.priority,
        dueDate: day(r.due),
        labels: r.labels,
        createdByMemberId: memberIds[r.by],
        createdAt: created,
      })
      .returning();
    events.push({ orgId, requestId: row.id, actorMemberId: memberIds[r.by], action: 'create', toState: 'submitted', createdAt: created });
    let deliveredAt: Date | null = null;
    let completedAt: Date | null = null;
    for (const step of r.path) {
      const def = REQUEST_TRANSITIONS[step.action as RequestAction];
      if (!def.from.includes(state)) throw new Error(`Seed path invalid: ${step.action} from ${state}`);
      events.push({ orgId, requestId: row.id, actorMemberId: memberIds[step.by], action: step.action, fromState: state, toState: def.to, note: step.note ?? null, createdAt: hoursAgo(step.hoursAgo) });
      state = def.to;
      if (state === 'delivered') deliveredAt = hoursAgo(step.hoursAgo);
      if (state === 'completed') completedAt = hoursAgo(step.hoursAgo);
    }
    const last = r.path.length ? hoursAgo(Math.min(...r.path.map((p) => p.hoursAgo))) : created;
    await db.update(S.requests).set({ state, version: r.path.length, deliveredAt, completedAt, updatedAt: last }).where(eq(S.requests.id, row.id));
    await db.insert(S.requestEvents).values(events);
    for (const [who, body] of r.comments ?? []) await db.insert(S.comments).values({ orgId, requestId: row.id, authorMemberId: memberIds[who], body, createdAt: hoursAgo(40) });
    if (r.tasks && r.project) {
      let sort = 50;
      for (const t of r.tasks) await insertTask(projectIds[r.project].id, r.to, t, sort++, row.id);
    }
  }
  await db.update(S.organizations).set({ requestSeq: n }).where(eq(S.organizations.id, orgId));

  // Calendar
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const events = [
    { title: 'Team Sync', dept: 'dev', s: at(0, 16), e: at(0, 16, 30), who: ['faisal', 'sara', 'khalid', 'ghada', 'omar', 'mohammed'] },
    { title: 'Design Review', dept: 'design', s: at(1, 11), e: at(1, 12), who: ['hessa', 'maha', 'asma', 'sara'] },
    { title: 'Marketing → Dev kickoff', dept: null, s: at(1, 13), e: at(1, 14), who: ['lina', 'faisal', 'sara', 'yousef'] },
    { title: 'Sprint Planning', dept: 'dev', s: at(2, 10), e: at(2, 11), who: ['faisal', 'sara', 'khalid', 'ghada', 'omar', 'mohammed', 'munira'] },
    { title: 'Budget check-in', dept: 'fin', s: at(3, 14), e: at(3, 15), who: ['abdullah', 'reem', 'munira'] },
    { title: 'Leadership weekly', dept: null, s: at(0, 10), e: at(0, 11), who: ['munira', 'faisal', 'lina', 'hessa', 'ahmed', 'abdullah', 'noura', 'nora'] },
  ];
  for (const e of events) {
    const [ev] = await db
      .insert(S.events)
      .values({ orgId, departmentId: e.dept ? deptIds[e.dept] : null, title: e.title, startsAt: e.s, endsAt: e.e, createdByMemberId: memberIds[e.who[0]] })
      .returning();
    await db.insert(S.eventAttendees).values(e.who.map((k) => ({ orgId, eventId: ev.id, memberId: memberIds[k] })));
  }

  // Direct messages
  const dms: Array<[string, string, Array<[string, string, number]>]> = [
    ['munira', 'lina', [['lina', 'New request for the analytics dashboard is in — could you nudge Development?', 5], ['munira', 'Will raise it in leadership weekly today.', 4]]],
    ['munira', 'faisal', [['faisal', 'Updated technical requirements for the payment integration are attached to the request.', 20], ['munira', 'Thanks Faisal, looks good.', 19]]],
    ['munira', 'hessa', [['hessa', 'Campaign visuals were delivered to Marketing.', 3]]],
    ['munira', 'ahmed', [['ahmed', 'Meeting with the network vendor moved to 4 PM.', 26]]],
  ];
  for (const [a, b, msgs] of dms) {
    const [c] = await db
      .insert(S.conversations)
      .values({ orgId, dmKey: [memberIds[a], memberIds[b]].sort().join(':'), lastMessageAt: hoursAgo(Math.min(...msgs.map((m) => m[2]))) })
      .returning();
    await db.insert(S.conversationMembers).values([
      { orgId, conversationId: c.id, memberId: memberIds[a], lastReadAt: hoursAgo(Math.max(...msgs.map((m) => m[2])) + 1) },
      { orgId, conversationId: c.id, memberId: memberIds[b], lastReadAt: new Date() },
    ]);
    for (const [who, body, h] of msgs) await db.insert(S.messages).values({ orgId, conversationId: c.id, senderMemberId: memberIds[who], body, createdAt: hoursAgo(h) });
  }

  // A few notifications for the company admin
  const reqRows = await db.select().from(S.requests).where(eq(S.requests.orgId, orgId));
  const byTitle = (t: string) => reqRows.find((r) => r.title === t)!;
  await db.insert(S.notifications).values([
    { orgId, recipientMemberId: memberIds.munira, kind: 'request_updated', title: '#3 Campaign key visuals: Delivered', body: 'Design delivered the final visuals to Marketing.', entityType: 'request', entityId: byTitle('Campaign key visuals').id, createdAt: hoursAgo(3) },
    { orgId, recipientMemberId: memberIds.munira, kind: 'request_received', title: 'Marketing sent a request: Social media analytics dashboard', entityType: 'request', entityId: byTitle('Social media analytics dashboard').id, createdAt: hoursAgo(5) },
    { orgId, recipientMemberId: memberIds.munira, kind: 'request_updated', title: '#5 Q2 operating cost report: Clarification needed', entityType: 'request', entityId: byTitle('Q2 operating cost report').id, createdAt: hoursAgo(6) },
  ]);
  // Department admins get a notification for the incoming request
  await db.insert(S.notifications).values({ orgId, recipientMemberId: memberIds.faisal, kind: 'request_received', title: 'Marketing sent a request: Social media analytics dashboard', entityType: 'request', entityId: byTitle('Social media analytics dashboard').id, createdAt: hoursAgo(5) });

  /* ------------------------------------------------------------ Qamar Studio (second tenant) */
  const [org2] = await db.insert(S.organizations).values({ slug: 'qamar', name: 'Qamar Studio', brandColor: '#5fa79a', accentColor: '#f3c48b', isDemo: true, settings: {} }).returning();
  const d2: string[] = [];
  for (const [name, theme] of [
    ['Studio', 'design'],
    ['Engineering', 'development'],
    ['Partnerships', 'marketing'],
  ] as const) {
    const [d] = await db.insert(S.departments).values({ orgId: org2.id, name, theme, color: DEPT_THEME_DEFAULT_COLOR[theme] }).returning();
    d2.push(d.id);
  }
  await db.insert(S.officeLayouts).values({ orgId: org2.id, floor: 1, rooms: placeRooms([], d2) });
  const q = async (key: string, role: 'company_admin' | 'employee', dept: number, drole: 'admin' | 'member', title: string) => {
    const p = PEOPLE.find((x) => x.key === key)!;
    const [m] = await db.insert(S.orgMembers).values({ orgId: org2.id, userId: userIds[key], role, title, avatar: { ...DEFAULT_AVATAR, ...p.avatar } }).returning();
    await db.insert(S.departmentMembers).values({ orgId: org2.id, departmentId: d2[dept], memberId: m.id, role: drole });
    return m.id;
  };
  const qa = await q('munira', 'company_admin', 0, 'admin', 'Advisor');
  await q('maha', 'employee', 0, 'member', 'Illustrator');
  await q('omar', 'employee', 1, 'admin', 'Tech Lead');
  const [qp] = await db.insert(S.projects).values({ orgId: org2.id, departmentId: d2[0], name: 'Lantern Festival Identity', createdByMemberId: qa }).returning();
  await db.insert(S.tasks).values({ orgId: org2.id, projectId: qp.id, departmentId: d2[0], title: 'Moodboard for festival identity', status: 'in_progress', priority: 'medium', createdByMemberId: qa, dueDate: day(4) });

  return { orgId, org2Id: org2.id, memberIds, deptIds, agentIds };
}

if (require.main === module) {
  (async () => {
    await runMigrations();
    const r = await seed();
    console.log(`Seeded Juniper Space (${r.orgId}). Demo password: ${DEMO_PASSWORD}`);
    console.log('Sign in as munira@juniper.demo (company admin), faisal@juniper.demo (Development admin), lina@juniper.demo (Marketing admin), sara@juniper.demo (employee), sultan@juniper.demo (viewer).');
    await closeBus();
    await closeDb();
  })().catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
}
