import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, postCallBody, signWebhook, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp, RELEASE_LIMIT_PER_DEVICE, RELEASE_LIMIT_PER_ADDRESS } = appModule;

// A conversation that fails to start (a blocked mic, a dropped connection)
// would otherwise hold its reservation until the 30-minute sweep, and the
// one-per-device cap would tell the player "the guide is busy". The client
// asks for an early release; the server refunds only after ElevenLabs
// confirms the conversation never started, and charges late if it turns up.
describe('M4: releasing a conversation that failed to start', () => {
  async function setup(details = {}) {
    const started = await startApp({ createApp, elevenLabs: { details } });
    const { app, clock } = started;
    const minted = await request(app).post('/api/voice/token').set('Host', HOST).send({ guide: 'rollo' });
    const cookie = cookieFrom(minted);
    const reservation = minted.body.dynamicVariables.reservation;
    const release = (body, withCookie = cookie) => {
      const req = request(app).post('/api/voice/release').set('Host', HOST);
      if (withCookie) req.set('Cookie', withCookie);
      return req.send(body);
    };
    const remaining = async () =>
      (await request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookie)).body.remainingSeconds;
    const mintAgain = () => request(app).post('/api/voice/token').set('Host', HOST).set('Cookie', cookie).send({ guide: 'rollo' });
    const deliver = (rawBody) =>
      request(app)
        .post('/api/voice/webhook/elevenlabs')
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('elevenlabs-signature', signWebhook(rawBody, SECRETS.ELEVENLABS_WEBHOOK_SECRET, Math.floor(clock.now() / 1000)))
        .send(rawBody);
    return { ...started, cookie, reservation, release, remaining, mintAgain, deliver };
  }

  it('refunds at once when ElevenLabs has no such conversation, so the player can try again', async () => {
    const { reservation, release, remaining, mintAgain, upstream } = await setup();
    const response = await release({ reservation });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'released' });
    expect(upstream.detailRequests()[0].url).toBe('https://api.elevenlabs.io/v1/convai/conversations/conv_minted_1');
    expect(await remaining()).toBe(900);
    expect((await mintAgain()).status).toBe(200);
  });

  it('refunds when the conversation never got past initiated', async () => {
    const { reservation, release, remaining } = await setup({ conv_minted_1: { status: 'initiated', call_duration_secs: 0 } });
    expect((await release({ reservation })).body).toEqual({ status: 'released' });
    expect(await remaining()).toBe(900);
  });

  it.each(['in-progress', 'processing', 'done'])('refuses when the conversation is %s, and keeps it charged', async (status) => {
    const { reservation, release, remaining } = await setup({ conv_minted_1: { status, call_duration_secs: 40 } });
    const response = await release({ reservation });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ status: 'started' });
    expect(await remaining()).toBe(420);
  });

  it('keeps it charged when ElevenLabs cannot be reached', async () => {
    const { reservation, release, remaining, upstream } = await setup();
    upstream.state.details = new Proxy({}, { get: () => { throw new Error('network down'); } });
    expect((await release({ reservation })).status).toBe(503);
    expect(await remaining()).toBe(420);
  });

  it('still charges the conversation if it turns up after the release', async () => {
    const { app, reservation, release, deliver } = await setup();
    await release({ reservation });
    const before = app.locals.voice.ledger.globalRemaining();
    const late = await deliver(postCallBody({ reservation, conversationId: 'conv_minted_1', durationSecs: 90 }));
    expect(late.body).toMatchObject({ status: 'settled' });
    expect(app.locals.voice.ledger.globalRemaining()).toBe(before - 90);
  });

  it('rejects a forged reservation', async () => {
    const { reservation, release } = await setup();
    expect((await release({ reservation: `${reservation.split('.')[0]}.AAAAAAAAAAAAAAAAAAAA` })).status).toBe(400);
  });

  it("refuses to release another device's reservation", async () => {
    const { reservation, release, remaining } = await setup();
    expect((await release({ reservation }, null)).status).toBe(403);
    expect(await remaining()).toBe(420);
  });

  it('treats a second release as already done', async () => {
    const { reservation, release, upstream } = await setup();
    await release({ reservation });
    const again = await release({ reservation });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ status: 'already_closed' });
    expect(upstream.detailRequests()).toHaveLength(1);
  });
});

// Kyle's review of f4fa77b: the token stays valid after a release, so a
// script could mint, release at once (ElevenLabs says "not found") and then
// connect anyway. The webhook charges it late, but that conversation skipped
// the open-reservation caps and the budget check. Releases are therefore
// limited, and refused when the server cannot verify the conversation.
describe('M4: limits on releasing', () => {
  const HOUR = 60 * 60 * 1000;
  const ON_RAILWAY = { RAILWAY_ENVIRONMENT_ID: 'env_test', VOICE_DAILY_MAX_SECONDS: '100000', VOICE_GLOBAL_DAILY_MAX_SECONDS: '1000000' };

  it('refuses to release a reservation with no conversation id, leaving it to the sweep', async () => {
    const { app } = await startApp({ createApp, elevenLabs: { tokenConversationIds: false } });
    const minted = await request(app).post('/api/voice/token').set('Host', HOST).send({ guide: 'rollo' });
    const cookie = cookieFrom(minted);
    const response = await request(app)
      .post('/api/voice/release')
      .set('Host', HOST)
      .set('Cookie', cookie)
      .send({ reservation: minted.body.dynamicVariables.reservation });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ status: 'unverifiable' });
    expect(app.locals.voice.ledger.openReservationsOlderThan(-1)).toHaveLength(1);
  });

  it('allows 3 releases per device per hour and 10 per address per hour', () => {
    expect(RELEASE_LIMIT_PER_DEVICE).toEqual({ max: 3, windowMs: HOUR });
    expect(RELEASE_LIMIT_PER_ADDRESS).toEqual({ max: 10, windowMs: HOUR });
  });

  it('refuses a fourth release from one device within the hour, keeping the reservation charged', async () => {
    const { app } = await startApp({ createApp, env: ON_RAILWAY });
    let cookie;
    const cycle = async () => {
      const req = request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', '203.0.113.7');
      if (cookie) req.set('Cookie', cookie);
      const minted = await req.send({ guide: 'rollo' });
      cookie = cookie ?? cookieFrom(minted);
      const released = await request(app)
        .post('/api/voice/release')
        .set('Host', HOST)
        .set('X-Real-IP', '203.0.113.7')
        .set('Cookie', cookie)
        .send({ reservation: minted.body.dynamicVariables.reservation });
      return released;
    };
    for (let i = 0; i < 3; i += 1) expect((await cycle()).status, `release ${i + 1}`).toBe(200);
    const refused = await cycle();
    expect(refused.status).toBe(429);
    expect(app.locals.voice.ledger.openReservationsOlderThan(-1)).toHaveLength(1);
  });

  it('refuses an eleventh release from one address within the hour, whatever the device', async () => {
    const { app } = await startApp({ createApp, env: ON_RAILWAY });
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const minted = await request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', '198.51.100.4').send({ guide: 'sylvi' });
      const released = await request(app)
        .post('/api/voice/release')
        .set('Host', HOST)
        .set('X-Real-IP', '198.51.100.4')
        .set('Cookie', cookieFrom(minted))
        .send({ reservation: minted.body.dynamicVariables.reservation });
      statuses.push(released.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('lets a device release again once the hour has passed', async () => {
    const { app, clock } = await startApp({ createApp, env: ON_RAILWAY });
    let cookie;
    let lastReservation;
    const release = (reservation) =>
      request(app)
        .post('/api/voice/release')
        .set('Host', HOST)
        .set('X-Real-IP', '203.0.113.8')
        .set('Cookie', cookie)
        .send({ reservation });
    const cycle = async () => {
      const req = request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', '203.0.113.8');
      if (cookie) req.set('Cookie', cookie);
      const minted = await req.send({ guide: 'rollo' });
      cookie = cookie ?? cookieFrom(minted);
      lastReservation = minted.body.dynamicVariables.reservation;
      return release(lastReservation);
    };
    for (let i = 0; i < 3; i += 1) await cycle();
    expect((await cycle()).status).toBe(429);
    clock.advance(HOUR + 1000);
    const again = await release(lastReservation);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ status: 'released' });
  });
});

