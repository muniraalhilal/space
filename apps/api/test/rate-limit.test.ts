import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeApp, getApp } from './helpers';

afterAll(closeApp);

describe('rate limiting', () => {
  it('throttles repeated sign-in attempts', async () => {
    const app = await getApp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request(app.getHttpServer()).post('/api/auth/login').set('x-space-csrf', '1').send({ email: 'nobody@example.com', password: 'wrong-password-123' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toContain(429);
  });
});
