import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeApp, deptId, login, orgIds } from './helpers';

let J: string;
let mkt: string;
let dev: string;
afterAll(closeApp);
beforeAll(async () => {
  const munira = await login('munira@juniper.demo');
  J = (await orgIds(munira)).juniper!;
  mkt = await deptId(munira, J, 'Marketing');
  dev = await deptId(munira, J, 'Development');
});

describe('cross-department request workflow', () => {
  let id: string;
  let version: number;

  it('only admins of the requesting department can send a request', async () => {
    const sara = await login('sara@juniper.demo'); // Development member, not Marketing admin
    await sara.post(`/orgs/${J}/requests`, { fromDepartmentId: mkt, toDepartmentId: dev, title: 'Landing page', description: 'Please build it' }).expect(403);
  });

  it('a Marketing admin sends a request to Development', async () => {
    const lina = await login('lina@juniper.demo');
    const r = await lina.post(`/orgs/${J}/requests`, { fromDepartmentId: mkt, toDepartmentId: dev, title: 'Analytics dashboard for the launch', description: 'Track sign-ups by channel', priority: 'high' });
    expect(r.status).toBe(201);
    id = r.body.id;
    const g = await lina.get(`/orgs/${J}/requests/${id}`).expect(200);
    expect(g.body.state).toBe('submitted');
    version = g.body.version;
  });

  it('the requester cannot accept their own request', async () => {
    const lina = await login('lina@juniper.demo');
    const r = await lina.post(`/orgs/${J}/requests/${id}/transitions`, { action: 'accept', version });
    expect(r.status).toBe(403);
  });

  it('rejects an invalid transition with a clear error', async () => {
    const faisal = await login('faisal@juniper.demo');
    const r = await faisal.post(`/orgs/${J}/requests/${id}/transitions`, { action: 'deliver', version });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects a stale version (optimistic concurrency)', async () => {
    const faisal = await login('faisal@juniper.demo');
    const r = await faisal.post(`/orgs/${J}/requests/${id}/transitions`, { action: 'accept', version: version + 5 });
    expect(r.status).toBe(409);
  });

  it('receiver accepts → starts → delivers; requester completes', async () => {
    const faisal = await login('faisal@juniper.demo');
    const lina = await login('lina@juniper.demo');
    const step = async (c: Awaited<ReturnType<typeof login>>, action: string, expected: string) => {
      const cur = await c.get(`/orgs/${J}/requests/${id}`).expect(200);
      const r = await c.post(`/orgs/${J}/requests/${id}/transitions`, { action, version: cur.body.version, note: action === 'deliver' ? 'Dashboard is live' : undefined });
      expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
      const after = await c.get(`/orgs/${J}/requests/${id}`).expect(200);
      expect(after.body.state).toBe(expected);
    };
    await step(faisal, 'accept', 'accepted');
    await step(faisal, 'start', 'in_progress');
    await step(faisal, 'deliver', 'delivered');
    await step(lina, 'approve', 'completed');
  });

  it('employees outside both departments cannot see the request', async () => {
    const sultan = await login('sultan@juniper.demo'); // Finance viewer
    await sultan.get(`/orgs/${J}/requests/${id}`).expect(404);
  });
});
