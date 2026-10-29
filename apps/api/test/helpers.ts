import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';

export const PASSWORD = 'space-demo-2026';

let app: INestApplication | null = null;
export async function getApp() {
  if (!app) {
    app = await createApp();
    await app.init();
  }
  return app;
}
export async function closeApp() {
  if (app) await app.close();
  app = null;
  const { closeDb } = await import('../src/db/client');
  const { closeBus } = await import('../src/realtime/bus');
  const { closeQueue } = await import('../src/agents/queue');
  await closeQueue().catch(() => undefined);
  await closeBus().catch(() => undefined);
  await closeDb().catch(() => undefined);
}

/** A signed-in client: carries the session cookie and the CSRF header on mutations. */
export class Client {
  constructor(
    private readonly server: any,
    private readonly cookie: string,
  ) {}
  get(path: string) {
    return request(this.server).get('/api' + path).set('Cookie', this.cookie);
  }
  post(path: string, body?: object) {
    return request(this.server).post('/api' + path).set('Cookie', this.cookie).set('x-space-csrf', '1').send(body ?? {});
  }
  patch(path: string, body?: object) {
    return request(this.server).patch('/api' + path).set('Cookie', this.cookie).set('x-space-csrf', '1').send(body ?? {});
  }
  put(path: string, body?: object) {
    return request(this.server).put('/api' + path).set('Cookie', this.cookie).set('x-space-csrf', '1').send(body ?? {});
  }
  del(path: string) {
    return request(this.server).delete('/api' + path).set('Cookie', this.cookie).set('x-space-csrf', '1');
  }
  /** Same request without the CSRF header, to prove the check. */
  postNoCsrf(path: string, body?: object) {
    return request(this.server).post('/api' + path).set('Cookie', this.cookie).send(body ?? {});
  }
}

const cache = new Map<string, Client>();
export async function login(email: string): Promise<Client> {
  const hit = cache.get(email);
  if (hit) return hit;
  const a = await getApp();
  const server = a.getHttpServer();
  const r = await request(server).post('/api/auth/login').set('x-space-csrf', '1').send({ email, password: PASSWORD });
  if (r.status !== 200 && r.status !== 201) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  const c = new Client(server, cookie);
  cache.set(email, c);
  return c;
}

export async function orgIds(c: Client) {
  const me = await c.get('/auth/me').expect(200);
  const by = (slug: string) => me.body.organizations.find((o: any) => o.slug === slug)?.id as string | undefined;
  return { juniper: by('juniper'), qamar: by('qamar') };
}

export async function deptId(c: Client, orgId: string, name: string) {
  const o = await c.get(`/orgs/${orgId}`).expect(200);
  const d = o.body.departments.find((x: any) => x.name === name);
  if (!d) throw new Error(`no department ${name}`);
  return d.id as string;
}
