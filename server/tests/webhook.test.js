import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, fakeClock, postCallBody, signWebhook, startApp } from './helpers.js';

const webhookModule = await import('../webhook.js').catch(() => ({}));
const { verifyElevenLabsSignature } = webhookModule;
const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

const nowSecs = (clock) => Math.floor(clock.now() / 1000);

describe('M3: ElevenLabs webhook signature (t=<secs>,v0=<hex HMAC-SHA256 of "t.body">)', () => {
  const clock = fakeClock();
  const body = postCallBody({ reservation: 'r' });

  it('accepts a correctly signed, fresh webhook', () => {
    const header = signWebhook(body, SECRETS.ELEVENLABS_WEBHOOK_SECRET, nowSecs(clock));
    expect(verifyElevenLabsSignature({ rawBody: body, header, secret: SECRETS.ELEVENLABS_WEBHOOK_SECRET, now: clock.now })).toEqual({ ok: true });
  });

  it.each([
    ['a missing header', () => undefined],
    ['the wrong secret', () => signWebhook(body, 'not-the-secret', nowSecs(clock))],
    ['a tampered body', () => signWebhook(body.replace('120', '1'), SECRETS.ELEVENLABS_WEBHOOK_SECRET, nowSecs(clock))],
    ['a timestamp over 30 minutes old', () => signWebhook(body, SECRETS.ELEVENLABS_WEBHOOK_SECRET, nowSecs(clock) - 31 * 60)],
    ['a timestamp from the future', () => signWebhook(body, SECRETS.ELEVENLABS_WEBHOOK_SECRET, nowSecs(clock) + 10 * 60)],
    ['a malformed header', () => 'v0=deadbeef'],
  ])('rejects %s', (_label, header) => {
    const result = verifyElevenLabsSignature({ rawBody: body, header: header(), secret: SECRETS.ELEVENLABS_WEBHOOK_SECRET, now: clock.now });
    expect(result.ok).toBe(false);
  });
});

describe('M3: post-call webhook refunds the unused reservation', () => {
  async function setup(envOverrides = {}) {
    const { app, clock } = await startApp({ env: envOverrides, createApp });
    const minted = await request(app).post('/api/voice/token').set('Host', HOST).send({ guide: 'rollo' });
    const cookie = cookieFrom(minted);
    const remaining = async () =>
      (await request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookie)).body.remainingSeconds;
    const deliver = (rawBody, header = signWebhook(rawBody, SECRETS.ELEVENLABS_WEBHOOK_SECRET, nowSecs(clock))) =>
      request(app)
        .post('/api/voice/webhook/elevenlabs')
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('elevenlabs-signature', header)
        .send(rawBody);
    return { app, clock, minted, cookie, remaining, deliver };
  }

  it('refunds the difference once the real duration is reported', async () => {
    const { minted, remaining, deliver } = await setup();
    expect(await remaining()).toBe(420);
    const response = await deliver(postCallBody({ reservation: minted.body.dynamicVariables.reservation, durationSecs: 120 }));
    expect(response.status).toBe(200);
    expect(await remaining()).toBe(780);
  });

  it('rejects a forged webhook and refunds nothing', async () => {
    const { minted, remaining, deliver } = await setup();
    const body = postCallBody({ reservation: minted.body.dynamicVariables.reservation, durationSecs: 0 });
    const response = await deliver(body, signWebhook(body, 'forged-secret', Math.floor(Date.UTC(2026, 9, 5, 12) / 1000)));
    expect(response.status).toBe(401);
    expect(await remaining()).toBe(420);
  });

  it('ignores a replayed webhook without refunding twice', async () => {
    const { minted, remaining, deliver } = await setup();
    const body = postCallBody({ reservation: minted.body.dynamicVariables.reservation, durationSecs: 120 });
    await deliver(body);
    const replay = await deliver(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    expect(await remaining()).toBe(780);
  });

  it('ignores a validly signed webhook naming a forged reservation', async () => {
    const { minted, remaining, deliver } = await setup();
    const forged = `${minted.body.dynamicVariables.reservation.split('.')[0]}.0000`;
    const response = await deliver(postCallBody({ reservation: forged, durationSecs: 0 }));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ignored' });
    expect(await remaining()).toBe(420);
  });

  it.each([
    ['another agent', { agentId: 'agent_someone_else' }],
    ['a non-transcription event', { type: 'post_call_audio' }],
    ['no reservation at all', { reservation: undefined }],
  ])('acknowledges but ignores %s', async (_label, overrides) => {
    const { minted, remaining, deliver } = await setup();
    const body = postCallBody({ reservation: minted.body.dynamicVariables.reservation, durationSecs: 0, ...overrides });
    const response = await deliver(body);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ignored' });
    expect(await remaining()).toBe(420);
  });

  it('outside production, refuses webhooks when no webhook secret is configured, so nothing is refunded', async () => {
    const { minted, remaining, deliver } = await setup({ ELEVENLABS_WEBHOOK_SECRET: undefined, NODE_ENV: 'development' });
    const response = await deliver(postCallBody({ reservation: minted.body.dynamicVariables.reservation, durationSecs: 0 }));
    expect(response.status).toBe(503);
    expect(await remaining()).toBe(420);
  });

  it('charges a valid reservation the server no longer remembers (minted before a restart) to the global budget', async () => {
    const first = await setup({ VOICE_GLOBAL_DAILY_MAX_SECONDS: '18000' });
    const reservation = first.minted.body.dynamicVariables.reservation;
    const restarted = await startApp({ env: { VOICE_GLOBAL_DAILY_MAX_SECONDS: '18000' }, createApp, clock: first.clock });
    const body = postCallBody({ reservation, conversationId: 'conv_after_restart', durationSecs: 200 });
    const deliver = () =>
      request(restarted.app)
        .post('/api/voice/webhook/elevenlabs')
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('elevenlabs-signature', signWebhook(body, SECRETS.ELEVENLABS_WEBHOOK_SECRET, nowSecs(first.clock)))
        .send(body);
    expect((await deliver()).body).toMatchObject({ status: 'charged' });
    expect((await deliver()).body).toMatchObject({ status: 'duplicate' });
    expect(restarted.app.locals.voice.ledger.globalRemaining()).toBe(18000 - 200);
  });
});
