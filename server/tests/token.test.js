import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, expectNoSecrets, postCallBody, signWebhook, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

const setup = (options = {}) => startApp({ ...options, createApp });

const mint = (app, guide = 'rollo', cookie) => {
  const req = request(app).post('/api/voice/token').set('Host', HOST);
  if (cookie) req.set('Cookie', cookie);
  return req.send({ guide });
};

describe('M3: token response', () => {
  it('returns the conversation token, guide and voice, and a signed reservation', async () => {
    const { app } = await setup();
    const response = await mint(app, 'sylvi');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      conversationToken: 'conv_token_abc',
      guideName: 'Sylvi',
      voiceId: 'voice_sylvi_test',
      maxSeconds: 480,
      dynamicVariables: { guide_name: 'Sylvi', reservation: expect.stringMatching(/^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/) },
    });
  });

  it("uses Rollo's voice for Rollo", async () => {
    const { app } = await setup();
    expect((await mint(app, 'rollo')).body).toMatchObject({ guideName: 'Rollo', voiceId: 'voice_rollo_test' });
  });

  it('asks ElevenLabs for a token with the server-held key and agent', async () => {
    const { app, upstream } = await setup();
    await mint(app);
    expect(upstream.tokenRequests()).toHaveLength(1);
    const [{ url, init }] = upstream.tokenRequests();
    expect(url).toBe(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${SECRETS.ELEVENLABS_AGENT_ID}`);
    expect(init.headers['xi-api-key']).toBe(SECRETS.ELEVENLABS_API_KEY);
  });

  it.each(['', 'specimen', 'ROLO', null])('rejects guide %j without reserving anything', async (guide) => {
    const { app, upstream } = await setup();
    const response = await mint(app, guide);
    expect(response.status).toBe(400);
    expect(upstream.tokenRequests()).toHaveLength(0);
    const status = await request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookieFrom(response));
    expect(status.body.remainingSeconds).toBe(900);
  });

  it('releases the reservation when ElevenLabs cannot mint a token', async () => {
    const { app } = await setup({ elevenLabs: { ok: false } });
    const response = await mint(app);
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ available: false, reason: 'upstream' });
    const status = await request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookieFrom(response));
    expect(status.body.remainingSeconds).toBe(900);
  });
});

describe('M3: secrets never reach the browser', () => {
  it('keeps the agent id, API key, session secret and webhook secret out of every response', async () => {
    const { app } = await setup();
    const responses = [
      await mint(app, 'rollo'),
      await mint(app, 'nobody'),
      await request(app).get('/api/voice/status').set('Host', HOST),
      await request(app).get('/').set('Host', HOST),
      await request(app).get('/api/nothing-here').set('Host', HOST),
    ];
    const failing = await setup({ elevenLabs: { ok: false } });
    responses.push(await mint(failing.app));
    for (const response of responses) expectNoSecrets(response, expect);
  });
});

describe('M3: per-device and global caps', () => {
  it('reserves against the device: a second conversation gets what is left, then none', async () => {
    const { app, clock } = await setup();
    // One open reservation per device, so each conversation is reported
    // (here, used in full) before the next is minted.
    const useInFull = (minted, conversationId) => {
      const body = postCallBody({ reservation: minted.body.dynamicVariables.reservation, conversationId, durationSecs: 480 });
      return request(app)
        .post('/api/voice/webhook/elevenlabs')
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('elevenlabs-signature', signWebhook(body, SECRETS.ELEVENLABS_WEBHOOK_SECRET, Math.floor(clock.now() / 1000)))
        .send(body);
    };
    const first = await mint(app);
    const cookie = cookieFrom(first);
    await useInFull(first, 'conv_a');
    const second = await mint(app, 'rollo', cookie);
    expect(second.body.maxSeconds).toBe(420);
    await useInFull(second, 'conv_b');
    const third = await mint(app, 'rollo', cookie);
    expect(third.status).toBe(429);
    // 12:00 UTC in the fake clock: the caps reset in 12 hours.
    expect(third.body).toEqual({ available: false, reason: 'device_daily_cap', resetsInSeconds: 12 * 3600 });
  });

  it('reports voice unavailable for everyone once the global budget is spent, until the next UTC day', async () => {
    const { app, clock } = await setup({ env: { VOICE_GLOBAL_DAILY_MAX_SECONDS: '480' } });
    expect((await mint(app)).status).toBe(200);
    const refused = await request(app)
      .post('/api/voice/token')
      .set('Host', HOST)
      .set('X-Forwarded-For', '198.51.100.20')
      .send({ guide: 'sylvi' });
    expect(refused.status).toBe(503);
    expect(refused.body).toEqual({ available: false, reason: 'global_budget', resetsInSeconds: 12 * 3600 });
    expect((await request(app).get('/api/voice/status').set('Host', HOST)).body).toMatchObject({
      available: false,
      reason: 'global_budget',
      resetsInSeconds: 12 * 3600,
    });
    expect((await request(app).get('/').set('Host', HOST)).status).toBe(200);

    clock.set(Date.UTC(2026, 9, 6, 0, 0, 5));
    expect((await request(app).get('/api/voice/status').set('Host', HOST)).body).toMatchObject({ available: true });
  });
});
