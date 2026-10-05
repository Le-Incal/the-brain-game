import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

// Before this fix one address could mint 37 tokens in under 20 minutes
// without ever connecting and spend the whole day's budget.
describe('M3 fix: minting without connecting cannot drain the budget', () => {
  const ON_RAILWAY = { RAILWAY_ENVIRONMENT_ID: 'env_test' };
  const mint = (app, ip, cookie) => {
    const req = request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', ip);
    if (cookie) req.set('Cookie', cookie);
    return req.send({ guide: 'rollo' });
  };

  it('a burst from one address never holds more than 2 reservations', async () => {
    const { app } = await startApp({ env: ON_RAILWAY, createApp });
    const statuses = [];
    for (let i = 0; i < 20; i += 1) statuses.push((await mint(app, '203.0.113.7')).status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(2);
    expect(app.locals.voice.ledger.globalRemaining()).toBe(18000 - 2 * 480);
  });

  it('refuses beyond a cap with reason busy', async () => {
    const { app } = await startApp({ env: ON_RAILWAY, createApp });
    await mint(app, '203.0.113.7');
    await mint(app, '203.0.113.7');
    const refused = await mint(app, '203.0.113.7');
    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({ available: false, reason: 'busy' });
  });

  it('holds the site-wide cap of open reservations', async () => {
    const { app } = await startApp({ env: { ...ON_RAILWAY, VOICE_MAX_OPEN_RESERVATIONS: '3' }, createApp });
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await mint(app, `198.51.100.${i}`)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });
});
