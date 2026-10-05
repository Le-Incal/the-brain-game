import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, cookieFrom, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

async function makeApp(env = {}) {
  return (await startApp({ env, createApp })).app;
}

const status = (app, { host = HOST, cookie } = {}) => {
  const req = request(app).get('/api/voice/status').set('Host', host);
  if (cookie) req.set('Cookie', cookie);
  return req;
};

describe('M3: anonymous signed device cookie', () => {
  it('issues an httpOnly, secure, host-only cookie on first contact', async () => {
    const response = await status(await makeApp());
    const header = [].concat(response.headers['set-cookie']).find((c) => c.startsWith('bg_device='));
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/Max-Age=\d+/);
    expect(header).not.toMatch(/Domain=/i);
  });

  it('carries nothing identifying: no IP and no user agent', async () => {
    const response = await status(await makeApp()).set('User-Agent', 'UniqueAgent/1.0').set('X-Forwarded-For', '203.0.113.99');
    const value = decodeURIComponent(cookieFrom(response).split('=')[1]);
    const payload = Buffer.from(value.split('.')[0], 'base64url').toString('utf8');
    expect(payload).not.toContain('203.0.113.99');
    expect(payload).not.toContain('UniqueAgent');
  });

  it('keeps the same device across requests', async () => {
    const app = await makeApp();
    const first = await status(app);
    const cookie = cookieFrom(first);
    await request(app).post('/api/voice/token').set('Host', HOST).set('Cookie', cookie).send({ guide: 'rollo' });
    const again = await status(app, { cookie });
    expect(again.body.remainingSeconds).toBe(420);
    expect(cookieFrom(again)).toBeNull();
  });

  it('replaces a tampered cookie with a new device', async () => {
    const app = await makeApp();
    const cookie = cookieFrom(await status(app));
    await request(app).post('/api/voice/token').set('Host', HOST).set('Cookie', cookie).send({ guide: 'rollo' });
    const tampered = `${cookie.slice(0, -2)}xx`;
    const response = await status(app, { cookie: tampered });
    expect(cookieFrom(response)).not.toBeNull();
    expect(cookieFrom(response)).not.toBe(cookie);
  });

  it('rejects a cookie minted for another host', async () => {
    const app = await makeApp();
    const cookie = cookieFrom(await status(app, { host: 'brain-game.io' }));
    const response = await status(app, { host: HOST, cookie });
    expect(cookieFrom(response)).not.toBeNull();
  });

  it('serves no voice to hosts outside VOICE_HOSTS', async () => {
    const response = await status(await makeApp(), { host: 'evil.example' });
    expect(response.body).toMatchObject({ available: false, reason: 'host' });
    const token = await request(await makeApp()).post('/api/voice/token').set('Host', 'evil.example').send({ guide: 'rollo' });
    expect(token.status).toBe(403);
  });

  it('allows localhost outside production, without the Secure flag', async () => {
    const response = await status(await makeApp({ NODE_ENV: 'development' }), { host: 'localhost:3000' });
    expect(response.body).toMatchObject({ available: true });
    const header = [].concat(response.headers['set-cookie']).find((c) => c.startsWith('bg_device='));
    expect(header).not.toMatch(/Secure/i);
  });
});
