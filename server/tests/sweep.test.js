import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, postCallBody, signWebhook, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp, RESERVATION_EXPIRY_MS, SWEEP_INTERVAL_MS, RECONCILE_INTERVAL_MS } = appModule;

const MINUTE = 60 * 1000;

describe('M3 fix: the sweep settles or releases stale reservations', () => {
  async function setup(details = {}) {
    const intervals = [];
    const started = await startApp({
      createApp,
      elevenLabs: { details },
      setIntervalImpl: (fn, ms) => intervals.push({ fn, ms }),
    });
    const { app, clock } = started;
    const minted = await request(app).post('/api/voice/token').set('Host', HOST).send({ guide: 'rollo' });
    const cookie = cookieFrom(minted);
    const remaining = async () =>
      (await request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookie)).body.remainingSeconds;
    const deliver = (rawBody) =>
      request(app)
        .post('/api/voice/webhook/elevenlabs')
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('elevenlabs-signature', signWebhook(rawBody, SECRETS.ELEVENLABS_WEBHOOK_SECRET, Math.floor(clock.now() / 1000)))
        .send(rawBody);
    return { ...started, intervals, minted, remaining, deliver };
  }

  it('waits out the token window plus the session cap before calling a reservation stale', () => {
    expect(RESERVATION_EXPIRY_MS).toBeGreaterThanOrEqual(8 * MINUTE + 10 * MINUTE);
    expect(RESERVATION_EXPIRY_MS).toBeLessThanOrEqual(45 * MINUTE);
    expect(SWEEP_INTERVAL_MS).toBeLessThanOrEqual(5 * MINUTE);
  });

  it('releases after about 30 minutes, sweeping every few minutes and re-reading the total every 10', async () => {
    expect(RESERVATION_EXPIRY_MS).toBe(30 * MINUTE);
    expect(RECONCILE_INTERVAL_MS).toBe(10 * MINUTE);
    const { intervals } = await setup();
    expect(intervals.map(({ ms }) => ms).sort((a, b) => a - b)).toEqual([SWEEP_INTERVAL_MS, RECONCILE_INTERVAL_MS].sort((a, b) => a - b));
  });

  it('leaves a reservation alone before it expires', async () => {
    const { app, clock, remaining, upstream } = await setup();
    clock.advance(RESERVATION_EXPIRY_MS - MINUTE);
    await app.locals.voice.sweep();
    expect(upstream.detailRequests()).toHaveLength(0);
    expect(await remaining()).toBe(420);
  });

  it('releases an expired reservation whose conversation never happened', async () => {
    const { app, clock, remaining, upstream } = await setup();
    clock.advance(RESERVATION_EXPIRY_MS + MINUTE);
    await app.locals.voice.sweep();
    expect(upstream.detailRequests()[0].url).toBe('https://api.elevenlabs.io/v1/convai/conversations/conv_minted_1');
    expect(upstream.detailRequests()[0].init.headers['xi-api-key']).toBe(SECRETS.ELEVENLABS_API_KEY);
    expect(await remaining()).toBe(900);
  });

  it('releases an expired reservation whose conversation never got past initiated', async () => {
    const { app, clock, remaining } = await setup({ conv_minted_1: { status: 'initiated', call_duration_secs: 0 } });
    clock.advance(RESERVATION_EXPIRY_MS + MINUTE);
    await app.locals.voice.sweep();
    expect(await remaining()).toBe(900);
  });

  it('settles an expired reservation that was used, once; the late webhook is a duplicate', async () => {
    const { app, clock, remaining, deliver, minted } = await setup({ conv_minted_1: { status: 'done', call_duration_secs: 150 } });
    clock.advance(RESERVATION_EXPIRY_MS + MINUTE);
    await app.locals.voice.sweep();
    expect(await remaining()).toBe(900 - 150);
    const late = await deliver(
      postCallBody({ reservation: minted.body.dynamicVariables.reservation, conversationId: 'conv_minted_1', durationSecs: 150 })
    );
    expect(late.body).toMatchObject({ status: 'duplicate' });
    expect(await remaining()).toBe(900 - 150);
  });

  it('keeps an expired reservation open while its conversation is still running', async () => {
    const { app, clock, remaining } = await setup({ conv_minted_1: { status: 'in-progress', call_duration_secs: 60 } });
    clock.advance(RESERVATION_EXPIRY_MS + MINUTE);
    await app.locals.voice.sweep();
    expect(await remaining()).toBe(420);
    expect(app.locals.voice.ledger.openReservationsOlderThan(0)).toHaveLength(1);
  });

  it('leaves a reservation open if ElevenLabs cannot be reached, to try again next sweep', async () => {
    const { app, clock, remaining, upstream } = await setup();
    upstream.state.details = new Proxy({}, { get: () => { throw new Error('network down'); } });
    clock.advance(RESERVATION_EXPIRY_MS + MINUTE);
    await app.locals.voice.sweep();
    expect(await remaining()).toBe(420);
  });

  it('re-reads the real total from ElevenLabs, counting only conversations it does not already know', async () => {
    const { app, upstream } = await setup();
    // conv_minted_1 belongs to the open reservation; conv_other is unknown here
    // (say a lost webhook for a token minted before a restart).
    upstream.state.details = {};
    const today = Math.floor(Date.UTC(2026, 9, 5) / 1000);
    const conversation = (id, secs) => ({ agent_id: SECRETS.ELEVENLABS_AGENT_ID, conversation_id: id, start_time_unix_secs: today + 60, call_duration_secs: secs, status: 'done' });
    const before = app.locals.voice.ledger.globalRemaining();
    upstream.setPages([[conversation('conv_minted_1', 100), conversation('conv_other', 200)]]);
    await app.locals.voice.reconcile();
    expect(app.locals.voice.ledger.globalRemaining()).toBe(before - 200);
    await app.locals.voice.reconcile();
    expect(app.locals.voice.ledger.globalRemaining()).toBe(before - 200);
  });
});
