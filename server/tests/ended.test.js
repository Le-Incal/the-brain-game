import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, postCallBody, signWebhook, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;
const ledgerModule = await import('../ledger.js').catch(() => ({}));
const { CLOSING_SLACK_SECONDS, MAX_CLOSING_PER_DEVICE } = ledgerModule;

// Kyle, 2026-10-11: one conversation on screen, many underneath. The live
// session rests after 30 s of quiet and wakes when the visitor speaks or
// writes. ElevenLabs reports a finished conversation about 20 s late, so the
// page says when it ended: the device's slot frees at once, while the minutes
// stay held until ElevenLabs settles them.
describe('A conversation the page reports ended', () => {
  async function setup() {
    const started = await startApp({ createApp });
    const { app, clock } = started;
    const mint = (cookie) => {
      const req = request(app).post('/api/voice/token').set('Host', HOST);
      if (cookie) req.set('Cookie', cookie);
      return req.send({ guide: 'sylvi' });
    };
    const ended = (reservation, cookie) => {
      const req = request(app).post('/api/voice/ended').set('Host', HOST);
      if (cookie) req.set('Cookie', cookie);
      return req.send({ reservation });
    };
    const status = (cookie) => request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookie);
    const deliver = (rawBody) =>
      request(app)
        .post('/api/voice/webhook/elevenlabs')
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('elevenlabs-signature', signWebhook(rawBody, SECRETS.ELEVENLABS_WEBHOOK_SECRET, Math.floor(clock.now() / 1000)))
        .send(rawBody);
    return { ...started, mint, ended, status, deliver };
  }

  it('frees the device to start the next conversation at once', async () => {
    const { mint, ended } = await setup();
    const first = await mint();
    const cookie = cookieFrom(first);
    expect((await mint(cookie)).status).toBe(429);
    const response = await ended(first.body.dynamicVariables.reservation, cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'closing' });
    expect((await mint(cookie)).status).toBe(200);
  });

  it('holds only the time since the token was minted, until ElevenLabs settles it', async () => {
    const { mint, ended, status, deliver, clock } = await setup();
    const first = await mint();
    const cookie = cookieFrom(first);
    const reservation = first.body.dynamicVariables.reservation;
    expect((await status(cookie)).body.remainingSeconds).toBe(900 - 480);
    // A conversation cannot have run longer than since its token was minted.
    clock.advance(60_000);
    await ended(reservation, cookie);
    expect((await status(cookie)).body.remainingSeconds).toBe(900 - (60 + CLOSING_SLACK_SECONDS));
    await deliver(postCallBody({ reservation, conversationId: 'conv_minted_1', durationSecs: 40 }));
    expect((await status(cookie)).body.remainingSeconds).toBe(900 - 40);
  });

  it('still charges the real length if a conversation ran on after the page said it ended', async () => {
    const { mint, ended, status, deliver } = await setup();
    const first = await mint();
    const cookie = cookieFrom(first);
    const reservation = first.body.dynamicVariables.reservation;
    await ended(reservation, cookie);
    await deliver(postCallBody({ reservation, conversationId: 'conv_minted_1', durationSecs: 300 }));
    expect((await status(cookie)).body.remainingSeconds).toBe(900 - 300);
  });

  it("accepts only the device's own, genuine reservation", async () => {
    const { mint, ended } = await setup();
    const first = await mint();
    const other = cookieFrom(await mint());
    expect((await ended(first.body.dynamicVariables.reservation, other)).status).toBe(403);
    expect((await ended('forged.signature', cookieFrom(first))).status).toBe(400);
  });

  // Kyle, 2026-10-23, production log: a rest, then the Study handover, and the
  // next conversation was refused 13 times ("mint refused: busy (device)")
  // while ElevenLabs' reports had not arrived. A device may now hold three.
  it('lets a device start again after a few quick endings ElevenLabs has not settled yet', async () => {
    expect(MAX_CLOSING_PER_DEVICE).toBe(3);
    const { mint, ended } = await setup();
    let cookie;
    for (let i = 0; i < MAX_CLOSING_PER_DEVICE; i += 1) {
      const minted = await mint(cookie);
      expect(minted.status, `conversation ${i + 1}`).toBe(200);
      cookie ??= cookieFrom(minted);
      await ended(minted.body.dynamicVariables.reservation, cookie);
    }
    expect((await mint(cookie)).status).toBe(200);
  });

  it('never lets a device pile up more conversations than that', async () => {
    const { mint, ended } = await setup();
    let cookie;
    for (let i = 0; i <= MAX_CLOSING_PER_DEVICE; i += 1) {
      const minted = await mint(cookie);
      cookie ??= cookieFrom(minted);
      await ended(minted.body.dynamicVariables.reservation, cookie);
    }
    const next = await mint(cookie);
    expect(next.status).toBe(429);
    expect(next.body).toMatchObject({ reason: 'busy' });
  });

  it('says so plainly when the conversation has already been settled', async () => {
    const { mint, ended, deliver } = await setup();
    const first = await mint();
    const cookie = cookieFrom(first);
    const reservation = first.body.dynamicVariables.reservation;
    await deliver(postCallBody({ reservation, conversationId: 'conv_minted_1', durationSecs: 40 }));
    expect((await ended(reservation, cookie)).body).toEqual({ status: 'already_closed' });
  });
});
