import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, postCallBody, signWebhook, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

// ElevenLabs returns the conversation id with the token (checked against the
// SDK's TokenResponseModel), so the server records it at mint. A webhook then
// matches its reservation even if the reservation variable is not echoed,
// without trusting anything the client reports.
describe('M4: matching a webhook through the conversation id recorded at mint', () => {
  async function setup() {
    const { app, clock } = await startApp({ createApp });
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
    return { app, minted, remaining, deliver };
  }

  it('never sends the conversation id to the browser', async () => {
    const { minted } = await setup();
    expect(JSON.stringify(minted.body)).not.toContain('conv_minted_1');
  });

  it('settles a webhook without the reservation variable through the recorded conversation id', async () => {
    const { remaining, deliver } = await setup();
    const response = await deliver(postCallBody({ reservation: undefined, conversationId: 'conv_minted_1', durationSecs: 120 }));
    expect(response.body).toMatchObject({ status: 'settled' });
    expect(await remaining()).toBe(780);
  });

  it('still ignores a webhook with neither a valid reservation nor a known conversation', async () => {
    const { remaining, deliver } = await setup();
    const response = await deliver(postCallBody({ reservation: undefined, conversationId: 'conv_stranger', durationSecs: 0 }));
    expect(response.body).toMatchObject({ status: 'ignored' });
    expect(await remaining()).toBe(420);
  });
});
