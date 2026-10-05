import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, fakeClock, startApp } from './helpers.js';

const rateModule = await import('../rateLimit.js').catch(() => ({}));
const { createRateLimiter, TOKEN_RATE_LIMIT } = rateModule;
const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

describe('M3: rate limiter', () => {
  it('allows a burst up to the limit per key, then asks to retry later', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: clock.now });
    expect([1, 2, 3].map(() => limiter.take('1.1.1.1').allowed)).toEqual([true, true, true]);
    const refused = limiter.take('1.1.1.1');
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(limiter.take('2.2.2.2').allowed).toBe(true);
    clock.advance(60_001);
    expect(limiter.take('1.1.1.1').allowed).toBe(true);
  });
});

describe('M3: POST /api/voice/token is rate-limited per IP', () => {
  it('allows 20 tokens per 10 minutes per address, enough for a class behind one school network', () => {
    expect(TOKEN_RATE_LIMIT).toEqual({ max: 20, windowMs: 10 * 60 * 1000 });
  });

  // Railway's edge always overwrites X-Real-IP with the client's address
  // (Railway staff, May 2026); X-Forwarded-For keeps whatever the client sent.
  const ON_RAILWAY = { RAILWAY_ENVIRONMENT_ID: 'env_test', VOICE_DAILY_MAX_SECONDS: '100000', VOICE_GLOBAL_DAILY_MAX_SECONDS: '1000000' };

  it('returns 429 with Retry-After past the limit, per address, not per device', async () => {
    const { app } = await startApp({ env: ON_RAILWAY, createApp });
    const mint = (ip) =>
      request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', ip).send({ guide: 'sylvi' });

    // A fresh device cookie on every request: clearing cookies must not lift the limit.
    for (let i = 0; i < TOKEN_RATE_LIMIT.max; i += 1) {
      expect((await mint('203.0.113.7')).status, `request ${i + 1}`).toBe(200);
    }
    const refused = await mint('203.0.113.7');
    expect(refused.status).toBe(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(refused.body).toMatchObject({ available: false, reason: 'rate_limited' });

    expect((await mint('198.51.100.9')).status).toBe(200);
  });

  it('ignores a client-supplied X-Forwarded-For on Railway', async () => {
    const { app } = await startApp({ env: ON_RAILWAY, createApp });
    for (let i = 0; i < TOKEN_RATE_LIMIT.max; i += 1) {
      await request(app)
        .post('/api/voice/token')
        .set('Host', HOST)
        .set('X-Real-IP', '203.0.113.7')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ guide: 'nobody' });
    }
    const refused = await request(app)
      .post('/api/voice/token')
      .set('Host', HOST)
      .set('X-Real-IP', '203.0.113.7')
      .set('X-Forwarded-For', '10.9.9.9')
      .send({ guide: 'rollo' });
    expect(refused.status).toBe(429);
  });

  it('ignores X-Real-IP off Railway, where nothing overwrites it', async () => {
    const { app } = await startApp({ env: { VOICE_DAILY_MAX_SECONDS: '100000' }, createApp });
    for (let i = 0; i < TOKEN_RATE_LIMIT.max; i += 1) {
      await request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', `192.0.2.${i}`).send({ guide: 'nobody' });
    }
    const refused = await request(app)
      .post('/api/voice/token')
      .set('Host', HOST)
      .set('X-Real-IP', '192.0.2.250')
      .send({ guide: 'rollo' });
    expect(refused.status).toBe(429);
  });
});
