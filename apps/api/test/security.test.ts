import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeApp, deptId, getApp, login, orgIds, PASSWORD } from './helpers';

let J: string; // Juniper org id
let Q: string; // Qamar org id (second tenant)

beforeAll(async () => {
  const munira = await login('munira@juniper.demo'); // member of both tenants
  const ids = await orgIds(munira);
  J = ids.juniper!;
  Q = ids.qamar!;
  expect(J).toBeTruthy();
  expect(Q).toBeTruthy();
});
afterAll(closeApp);

describe('authentication', () => {
  it('rejects requests without a session', async () => {
    const app = await getApp();
    await request(app.getHttpServer()).get(`/api/orgs/${J}`).expect(401);
  });

  it('rejects a wrong password without revealing which part was wrong', async () => {
    const app = await getApp();
    const r = await request(app.getHttpServer()).post('/api/auth/login').set('x-space-csrf', '1').send({ email: 'sara@juniper.demo', password: 'wrong-password' });
    expect(r.status).toBe(401);
    // Same generic message for an unknown email, so accounts can't be enumerated.
    const unknown = await request(app.getHttpServer()).post('/api/auth/login').set('x-space-csrf', '1').send({ email: 'nobody-here@juniper.demo', password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(r.body.error.message);
  });

  it('requires the CSRF header on mutations', async () => {
    const sara = await login('sara@juniper.demo');
    await sara.postNoCsrf(`/orgs/${J}/conversations`, {}).expect(403);
  });

  it('sets an httpOnly session cookie', async () => {
    const app = await getApp();
    const r = await request(app.getHttpServer()).post('/api/auth/login').set('x-space-csrf', '1').send({ email: 'lina@juniper.demo', password: PASSWORD });
    const c = ([] as string[]).concat(r.headers['set-cookie'] ?? []).join(';');
    expect(c).toMatch(/space_session=/);
    expect(c.toLowerCase()).toContain('httponly');
  });
});

describe('tenant isolation', () => {
  it('hides another company from non-members (404, not 403)', async () => {
    const sara = await login('sara@juniper.demo'); // Juniper only
    await sara.get(`/orgs/${Q}`).expect(404);
    await sara.get(`/orgs/${Q}/members`).expect(404);
    await sara.get(`/orgs/${Q}/tasks`).expect(404);
  });

  it('never returns a record from another company through your own company’s routes', async () => {
    const munira = await login('munira@juniper.demo');
    // A Qamar task, fetched through the Juniper route, must not resolve.
    const qTasks = await munira.get(`/orgs/${Q}/tasks`).expect(200);
    const qTask = qTasks.body[0];
    expect(qTask).toBeTruthy();
    await munira.get(`/orgs/${J}/tasks/${qTask.id}`).expect(404);
    // And Juniper lists contain nothing from Qamar.
    const jTasks = await munira.get(`/orgs/${J}/tasks`).expect(200);
    expect(jTasks.body.some((t: any) => t.id === qTask.id)).toBe(false);
  });

  it('rejects cross-tenant references in writes', async () => {
    const munira = await login('munira@juniper.demo');
    const qProjects = await munira.get(`/orgs/${Q}/projects`).expect(200);
    const r = await munira.post(`/orgs/${J}/tasks`, { projectId: qProjects.body[0].id, title: 'Sneaky cross-tenant task' });
    expect([404, 422]).toContain(r.status);
  });
});

describe('roles and permissions', () => {
  it('viewers cannot create tasks', async () => {
    const sultan = await login('sultan@juniper.demo');
    const munira = await login('munira@juniper.demo');
    const fin = await deptId(munira, J, 'Finance');
    const projects = await munira.get(`/orgs/${J}/projects?departmentId=${fin}`).expect(200);
    const p = projects.body.find((x: any) => x.departmentId === fin);
    expect(p).toBeTruthy();
    const r = await sultan.post(`/orgs/${J}/tasks`, { projectId: p.id, title: 'Viewer attempt' });
    expect(r.status).toBe(403);
  });

  it('employees only see tasks of their own departments', async () => {
    const sara = await login('sara@juniper.demo'); // Development member
    const munira = await login('munira@juniper.demo');
    const mkt = await deptId(munira, J, 'Marketing');
    const dev = await deptId(munira, J, 'Development');
    const all = await sara.get(`/orgs/${J}/tasks`).expect(200);
    expect(all.body.length).toBeGreaterThan(0);
    expect(all.body.every((t: any) => t.departmentId === dev)).toBe(true);
    const mktTasks = await munira.get(`/orgs/${J}/tasks?departmentId=${mkt}`).expect(200);
    await sara.get(`/orgs/${J}/tasks/${mktTasks.body[0].id}`).expect(404);
  });

  it('only company admins change company settings and roles', async () => {
    const faisal = await login('faisal@juniper.demo'); // department admin, company employee
    await faisal.patch(`/orgs/${J}`, { name: 'Hijacked' }).expect(403);
    const members = await faisal.get(`/orgs/${J}/members`).expect(200);
    const sara = members.body.find((m: any) => m.name === 'Sara Alqahtani');
    await faisal.patch(`/orgs/${J}/members/${sara.id}`, { role: 'company_admin' }).expect(403);
    await faisal.get(`/orgs/${J}/audit`).expect(403);
  });

  it('department admins manage members but cannot appoint other admins', async () => {
    const faisal = await login('faisal@juniper.demo');
    const munira = await login('munira@juniper.demo');
    const dev = await deptId(munira, J, 'Development');
    const members = await munira.get(`/orgs/${J}/members`).expect(200);
    const outsider = members.body.find((m: any) => !m.departments.some((d: any) => d.departmentId === dev) && m.role === 'employee');
    await faisal.put(`/orgs/${J}/departments/${dev}/members`, { memberId: outsider.id, role: 'admin' }).expect(403);
    await faisal.put(`/orgs/${J}/departments/${dev}/members`, { memberId: outsider.id, role: 'member' }).expect(200);
    await faisal.del(`/orgs/${J}/departments/${dev}/members/${outsider.id}`).expect(200);
  });

  it('the last company admin cannot demote themselves', async () => {
    const munira = await login('munira@juniper.demo');
    const qMembers = await munira.get(`/orgs/${Q}/members`).expect(200);
    const me = qMembers.body.find((m: any) => m.name === 'Munira Alhilal');
    const r = await munira.patch(`/orgs/${Q}/members/${me.id}`, { role: 'employee' });
    expect(r.status).toBe(409);
  });

  it('emails are only visible to company admins', async () => {
    const sara = await login('sara@juniper.demo');
    const r = await sara.get(`/orgs/${J}/members`).expect(200);
    const others = r.body.filter((m: any) => m.name !== 'Sara Alqahtani');
    expect(others.every((m: any) => m.email === undefined)).toBe(true);
  });

  it('the office hover card only reveals tasks the viewer may read', async () => {
    const sara = await login('sara@juniper.demo');
    const munira = await login('munira@juniper.demo');
    const dev = await deptId(munira, J, 'Development');
    const r = await sara.get(`/orgs/${J}/members`).expect(200);
    for (const m of r.body) {
      if (!m.currentTask) continue;
      const t = await munira.get(`/orgs/${J}/tasks/${m.currentTask.id}`).expect(200);
      expect(t.body.departmentId).toBe(dev);
    }
  });

  it('records security-relevant changes in the audit log', async () => {
    const munira = await login('munira@juniper.demo');
    await munira.patch(`/orgs/${J}`, { accentColor: '#f3c48b' }).expect(200);
    const a = await munira.get(`/orgs/${J}/audit`).expect(200);
    expect(a.body.some((x: any) => x.action === 'org.update')).toBe(true);
  });
});

describe('company administration', () => {
  it('invites a member who can then sign in with the one-time password', async () => {
    const munira = await login('munira@juniper.demo');
    const dev = await deptId(munira, J, 'Development');
    const r = await munira.post(`/orgs/${J}/members`, { email: 'new.hire@juniper.demo', name: 'New Hire', role: 'employee', departmentId: dev, departmentRole: 'member' }).expect(201);
    expect(r.body.temporaryPassword).toMatch(/.{12,}/);
    const app = await getApp();
    await request(app.getHttpServer()).post('/api/auth/login').set('x-space-csrf', '1').send({ email: 'new.hire@juniper.demo', password: r.body.temporaryPassword }).expect(200);
  });

  it('stores the GitHub token encrypted and never returns it', async () => {
    const munira = await login('munira@juniper.demo');
    const token = 'github_pat_TEST_ONLY_not_a_real_token_123456';
    const put = await munira.put(`/orgs/${J}/integrations/github`, { enabled: true, allowedRepos: ['juniper/platform'], token }).expect(200);
    expect(put.body.hasToken).toBe(true);
    const get = await munira.get(`/orgs/${J}/integrations/github`).expect(200);
    expect(JSON.stringify(get.body)).not.toContain(token);
    const { getDb, schema } = await import('../src/db/client');
    const rows = await getDb().select().from(schema.integrations);
    expect(rows.some((x) => String(x.secretEncrypted).includes(token))).toBe(false);
  });

  it('rejects repositories that are not in owner/name form', async () => {
    const munira = await login('munira@juniper.demo');
    await munira.put(`/orgs/${J}/integrations/github`, { enabled: true, allowedRepos: ['../etc/passwd'] }).expect(422);
  });

  it('lets people mark themselves as working remotely', async () => {
    const sara = await login('sara@juniper.demo');
    await sara.patch(`/orgs/${J}/me`, { presence: 'remote' }).expect(200);
    const m = await sara.get(`/orgs/${J}/members`).expect(200);
    expect(m.body.find((x: any) => x.name === 'Sara Alqahtani').presence).toBe('remote');
  });
});
