import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, postCallBody, signWebhook, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

// Fallback for matching: if ElevenLabs does not echo the reservation dynamic
// variable, the client reports its conversation id against its reservation.
describe('M4: conversation id fallback for matching a webhook to its reservation', () => {
  async function setup() {
    const { app, clock } = await startApp({ createApp });
    const minted = await request(app).post('/api/voice/token').set('Host', HOST).send({ guide: 'rollo' });
    const cookie = cookieFrom(minted);
    const reservation = minted.body.dynamicVariables.reservation;
    const bind = (body) => request(app).post('/api/voice/conversation').set('Host', HOST).set('Cookie', cookie).send(body);
    const remaining = async () =>
      (await request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookie)).body.remainingSeconds;
    const deliver = (rawBody) =>
      request(app)
        .post('/api/voice/webhook/elevenlabs')
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('elevenlabs-signature', signWebhook(rawBody, SECRETS.ELEVENLABS_WEBHOOK_SECRET, Math.floor(clock.now() / 1000)))
        .send(rawBody);
    return { app, reservation, bind, remaining, deliver };
  }

  it('settles a webhook without the reservation variable through the reported conversation id', async () => {
    const { reservation, bind, remaining, deliver } = await setup();
    expect((await bind({ reservation, conversationId: 'conv_77' })).status).toBe(204);
    const response = await deliver(postCallBody({ reservation: undefined, conversationId: 'conv_77', durationSecs: 120 }));
    expect(response.body).toMatchObject({ status: 'settled' });
    expect(await remaining()).toBe(780);
  });

  it('rejects a forged reservation', async () => {
    const { reservation, bind } = await setup();
    const forged = `${reservation.split('.')[0]}.AAAAAAAAAAAAAAAAAAAA`;
    expect((await bind({ reservation: forged, conversationId: 'conv_78' })).status).toBe(400);
  });

  it('binds a reservation once; a later different conversation id is refused', async () => {
    const { reservation, bind } = await setup();
    expect((await bind({ reservation, conversationId: 'conv_79' })).status).toBe(204);
    expect((await bind({ reservation, conversationId: 'conv_79' })).status).toBe(204);
    expect((await bind({ reservation, conversationId: 'conv_80' })).status).toBe(409);
  });

  it('rejects a missing or oversized conversation id', async () => {
    const { reservation, bind } = await setup();
    expect((await bind({ reservation })).status).toBe(400);
    expect((await bind({ reservation, conversationId: 'x'.repeat(300) })).status).toBe(400);
  });
});
