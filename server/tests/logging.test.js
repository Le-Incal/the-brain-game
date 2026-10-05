import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, cookieFrom, postCallBody, signWebhook, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp, EVENT_RATE_LIMIT } = appModule;

// What the staging logs must show during a live run, and what they must
// never show. Railway logs are private, but secrets, tokens, cookies,
// device ids and addresses still stay out of them.
function captureLogs() {
  const lines = [];
  return { lines, logger: { info: (line) => lines.push(String(line)), warn: (line) => lines.push(String(line)) } };
}

const ADDRESS = '203.0.113.42';
const ON_RAILWAY = { RAILWAY_ENVIRONMENT_ID: 'env_test' };

async function setup({ env = ON_RAILWAY, elevenLabs = {} } = {}) {
  const { lines, logger } = captureLogs();
  const started = await startApp({ createApp, env, elevenLabs, logger });
  const { app, clock } = started;
  const mint = (cookie, guide = 'rollo') => {
    const req = request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', ADDRESS);
    if (cookie) req.set('Cookie', cookie);
    return req.send({ guide });
  };
  const deliver = (rawBody) =>
    request(app)
      .post('/api/voice/webhook/elevenlabs')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .set('elevenlabs-signature', signWebhook(rawBody, SECRETS.ELEVENLABS_WEBHOOK_SECRET, Math.floor(clock.now() / 1000)))
      .send(rawBody);
  return { ...started, lines, mint, deliver };
}

function expectNothingSensitive(lines, extra = []) {
  const text = lines.join('\n');
  for (const [name, value] of Object.entries(SECRETS)) expect(text.includes(value), `${name} in logs`).toBe(false);
  for (const value of ['conv_token_abc', ADDRESS, '127.0.0.1', ...extra]) {
    expect(text.includes(value), `${value} in logs`).toBe(false);
  }
}

describe('Lifecycle logging', () => {
  it("logs the startup rebuild with today's total", async () => {
    const today = Math.floor(Date.UTC(2026, 9, 5) / 1000);
    const { lines } = await setup({
      elevenLabs: {
        pages: [[{ agent_id: SECRETS.ELEVENLABS_AGENT_ID, conversation_id: 'c1', start_time_unix_secs: today + 60, call_duration_secs: 75, status: 'done' }]],
      },
    });
    expect(lines).toContain('[voice] restored today: 1 conversations, 75 s used');
  });

  it('logs a mint with the full conversation id and a short reservation id', async () => {
    const { lines, mint } = await setup();
    const minted = await mint();
    const reservationId = minted.body.dynamicVariables.reservation.split('.')[0];
    const line = lines.find((l) => l.includes('minted'));
    expect(line).toBe(`[voice] minted ${reservationId.slice(0, 8)} for conversation conv_minted_1: reserved 480 s (rollo)`);
    expect(line).not.toContain(reservationId);
  });

  it('logs a settle with the conversation id and the seconds charged', async () => {
    const { lines, mint, deliver } = await setup();
    const minted = await mint();
    const reservationId = minted.body.dynamicVariables.reservation.split('.')[0];
    await deliver(postCallBody({ reservation: minted.body.dynamicVariables.reservation, conversationId: 'conv_minted_1', durationSecs: 120 }));
    expect(lines).toContain(`[voice] settled ${reservationId.slice(0, 8)} for conversation conv_minted_1: charged 120 s of 480 s reserved`);
  });

  it.each([
    ['busy (address)', async ({ mint }) => {
      await mint();
      await mint();
      await mint();
    }],
    ['global_budget', async ({ mint }) => {
      await mint();
      await mint();
    }, { ...ON_RAILWAY, VOICE_GLOBAL_DAILY_MAX_SECONDS: '480' }],
    ['rate_limited', async ({ app }) => {
      for (let i = 0; i < 21; i += 1) {
        await request(app).post('/api/voice/token').set('Host', HOST).set('X-Real-IP', ADDRESS).send({ guide: 'nobody' });
      }
    }],
  ])('logs a refused mint with its reason only: %s', async (reason, act, env = ON_RAILWAY) => {
    const context = await setup({ env });
    await act(context);
    expect(context.lines).toContain(`[voice] mint refused: ${reason}`);
    expectNothingSensitive(context.lines);
  });

  it('logs a device cap refusal as busy (device)', async () => {
    const { lines, mint } = await setup();
    const first = await mint();
    await mint(cookieFrom(first));
    expect(lines).toContain('[voice] mint refused: busy (device)');
  });

  it('logs releases and refused releases with their reasons', async () => {
    const { lines, mint, app } = await setup({ elevenLabs: { details: { conv_minted_2: { status: 'in-progress', call_duration_secs: 5 } } } });
    const first = await mint();
    const cookie = cookieFrom(first);
    const release = (reservation) =>
      request(app).post('/api/voice/release').set('Host', HOST).set('X-Real-IP', ADDRESS).set('Cookie', cookie).send({ reservation });
    await release(first.body.dynamicVariables.reservation);
    const second = await mint(cookie);
    await release(second.body.dynamicVariables.reservation);
    const firstId = first.body.dynamicVariables.reservation.split('.')[0].slice(0, 8);
    expect(lines).toContain(`[voice] released ${firstId} for conversation conv_minted_1`);
    expect(lines).toContain('[voice] release refused: started');
  });

  it('logs a rejected webhook without echoing anything it carried', async () => {
    const { lines, app } = await setup();
    const body = postCallBody({ reservation: 'x.y', durationSecs: 1 });
    await request(app)
      .post('/api/voice/webhook/elevenlabs')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .set('elevenlabs-signature', 't=1,v0=deadbeef')
      .send(body);
    expect(lines).toContain('[voice] webhook rejected: bad signature');
  });

  it('never logs a secret, token, cookie value, device id or address across a whole session', async () => {
    const { lines, mint, deliver, app } = await setup();
    const minted = await mint();
    const cookie = cookieFrom(minted);
    const cookieValue = decodeURIComponent(cookie.split('=')[1]);
    const deviceId = JSON.parse(Buffer.from(cookieValue.split('.')[0], 'base64url').toString('utf8')).id;
    await request(app).get('/api/voice/status').set('Host', HOST).set('Cookie', cookie);
    await deliver(postCallBody({ reservation: minted.body.dynamicVariables.reservation, conversationId: 'conv_minted_1', durationSecs: 30 }));
    await request(app).post('/api/voice/event').set('Host', HOST).set('X-Real-IP', ADDRESS).send({ type: 'mic_blocked' });
    expect(lines.length).toBeGreaterThan(2);
    expectNothingSensitive(lines, [cookieValue, deviceId, minted.body.dynamicVariables.reservation]);
  });
});

describe('Counting blocked microphones: POST /api/voice/event', () => {
  // The app checks the mic before asking for a token, so the server never
  // hears about a blocked mic. This counts them, to decide "Type instead".
  it.each(['mic_blocked', 'mic_unsupported'])('accepts %s with 204 and writes one line', async (type) => {
    const { lines, app } = await setup();
    const response = await request(app).post('/api/voice/event').set('Host', HOST).set('X-Real-IP', ADDRESS).send({ type });
    expect(response.status).toBe(204);
    expect(lines.filter((line) => line === `[voice] client event: ${type}`)).toHaveLength(1);
  });

  it.each([{ type: 'anything_else' }, {}, { type: 'mic_blocked', note: 'extra fields' }])('rejects %j with 400 and writes nothing', async (body) => {
    const { lines, app } = await setup();
    const before = lines.length;
    const response = await request(app).post('/api/voice/event').set('Host', HOST).set('X-Real-IP', ADDRESS).send(body);
    expect(response.status).toBe(400);
    expect(lines.length).toBe(before);
  });

  it('is rate-limited per address', async () => {
    const { app } = await setup();
    const statuses = [];
    for (let i = 0; i < EVENT_RATE_LIMIT.max + 1; i += 1) {
      statuses.push((await request(app).post('/api/voice/event').set('Host', HOST).set('X-Real-IP', ADDRESS).send({ type: 'mic_blocked' })).status);
    }
    expect(statuses.slice(0, EVENT_RATE_LIMIT.max).every((status) => status === 204)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    expect((await request(app).post('/api/voice/event').set('Host', HOST).set('X-Real-IP', '198.51.100.1').send({ type: 'mic_blocked' })).status).toBe(204);
  });

  it('works even when voice is not configured, and stores nothing', async () => {
    const { lines, logger } = captureLogs();
    const app = createApp({ env: { NODE_ENV: 'production' }, distDir: '/nonexistent', logger, setIntervalImpl: () => null });
    const response = await request(app).post('/api/voice/event').set('Host', HOST).send({ type: 'mic_unsupported' });
    expect(response.status).toBe(204);
    expect(lines).toContain('[voice] client event: mic_unsupported');
  });
});
