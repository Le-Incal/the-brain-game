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
    const { lines, app, clock } = await setup();
    const body = postCallBody({ reservation: 'x.y', durationSecs: 1 });
    await request(app)
      .post('/api/voice/webhook/elevenlabs')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .set('elevenlabs-signature', signWebhook(body, 'not-the-secret', Math.floor(clock.now() / 1000)))
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

// Live run: a session died at 55 s with nothing in our logs to say why or what
// the guide had called. The browser sends one summary per conversation; the
// server checks its shape strictly and writes it as one line.
describe('Session summary: POST /api/voice/event', () => {
  const SUMMARY = {
    type: 'session_summary',
    session: 'AbCd-_12',
    reason: 'agent',
    durationSecs: 55,
    tools: [
      { name: 'start_tour', ok: true, msSinceStart: 1200 },
      { name: 'next_tour_stop', ok: true, msSinceStart: 3450 },
      { name: 'next_tour_stop', ok: false, msSinceStart: 5000 },
    ],
  };
  const post = (app, body, type = 'application/json') =>
    request(app)
      .post('/api/voice/event')
      .set('Host', HOST)
      .set('X-Real-IP', ADDRESS)
      .set('Content-Type', type)
      .send(typeof body === 'string' ? body : JSON.stringify(body));

  it('accepts a summary with 204 and writes exactly one line with the reason, duration and every call', async () => {
    const { lines, app } = await setup();
    const before = lines.length;
    const response = await post(app, SUMMARY);
    expect(response.status).toBe(204);
    expect(lines.slice(before)).toEqual([
      '[voice] session AbCd-_12 ended (agent) after 55 s; 3 tool calls: start_tour ok 1.2s, next_tour_stop ok 3.5s, next_tour_stop failed 5.0s',
    ]);
    expectNothingSensitive(lines);
  });

  it('writes a session with no tool calls', async () => {
    const { lines, app } = await setup();
    await post(app, { ...SUMMARY, reason: 'page_closed', durationSecs: 7.6, tools: [] });
    expect(lines.at(-1)).toBe('[voice] session AbCd-_12 ended (page_closed) after 8 s; 0 tool calls');
  });

  it('accepts the plain-text body a tab-close beacon sends', async () => {
    const { lines, app } = await setup();
    const response = await post(app, JSON.stringify(SUMMARY), 'text/plain;charset=UTF-8');
    expect(response.status).toBe(204);
    expect(lines.at(-1)).toMatch(/^\[voice\] session AbCd-_12 ended \(agent\)/);
  });

  it.each(['agent', 'error', 'user', 'time_limit', 'page_closed', 'unknown'])('accepts the reason %s', async (reason) => {
    const { app } = await setup();
    expect((await post(app, { ...SUMMARY, reason })).status).toBe(204);
  });

  it('accepts 200 tool calls, which is more than the 1 kb the mic events need', async () => {
    const { lines, app } = await setup();
    const tools = Array.from({ length: 200 }, (_, i) => ({ name: 'next_tour_stop', ok: i % 2 === 0, msSinceStart: 479_000 + i }));
    expect((await post(app, { ...SUMMARY, tools })).status).toBe(204);
    expect(lines.at(-1)).toMatch(/; 200 tool calls: /);
  });

  it.each([
    ['201 tool calls', { tools: Array.from({ length: 201 }, () => ({ name: 'face_region', ok: true, msSinceStart: 1 })) }],
    ['an unknown reason', { reason: 'guardrail' }],
    ['an extra field', { conversationId: 'conv_123' }],
    ['a missing session', { session: undefined }],
    ['a session longer than 8 characters', { session: 'AbCdEfGhI' }],
    ['a session with other characters', { session: 'ab cd.ef' }],
    ['a negative duration', { durationSecs: -1 }],
    ['a duration over an hour', { durationSecs: 3601 }],
    ['a duration as text', { durationSecs: '55' }],
    ['tools that are not a list', { tools: 'start_tour' }],
    ['a tool name with other characters', { tools: [{ name: '<script>', ok: true, msSinceStart: 1 }] }],
    ['a tool name in capitals', { tools: [{ name: 'Face_Region', ok: true, msSinceStart: 1 }] }],
    ['a tool with ok as text', { tools: [{ name: 'face_region', ok: 'true', msSinceStart: 1 }] }],
    ['a tool with a fractional time', { tools: [{ name: 'face_region', ok: true, msSinceStart: 1.5 }] }],
    ['a tool with a negative time', { tools: [{ name: 'face_region', ok: true, msSinceStart: -1 }] }],
    ['a tool with an extra field', { tools: [{ name: 'face_region', ok: true, msSinceStart: 1, region: 6 }] }],
  ])('rejects %s with 400 and writes nothing', async (_label, patch) => {
    const { lines, app } = await setup();
    const before = lines.length;
    const body = JSON.parse(JSON.stringify({ ...SUMMARY, ...patch }));
    expect((await post(app, body)).status).toBe(400);
    expect(lines.length).toBe(before);
  });

  it('writes a gate refusal as refused, with the speech it measured', async () => {
    const { lines, app } = await setup();
    const tools = [
      { name: 'next_tour_stop', ok: true, msSinceStart: 3450 },
      { name: 'next_tour_stop', ok: false, msSinceStart: 14_200, refused: true, spokenMs: 3100 },
      { name: 'next_tour_stop', ok: false, msSinceStart: 15_000 },
    ];
    expect((await post(app, { ...SUMMARY, tools })).status).toBe(204);
    expect(lines.at(-1)).toBe(
      '[voice] session AbCd-_12 ended (agent) after 55 s; 3 tool calls: next_tour_stop ok 3.5s, next_tour_stop refused 14.2s (spoke 3.1s), next_tour_stop failed 15.0s'
    );
  });

  it.each([
    ['refused on a call that succeeded', { name: 'next_tour_stop', ok: true, msSinceStart: 1, refused: true, spokenMs: 0 }],
    ['refused set to false', { name: 'next_tour_stop', ok: false, msSinceStart: 1, refused: false, spokenMs: 0 }],
    ['refused without the measured speech', { name: 'next_tour_stop', ok: false, msSinceStart: 1, refused: true }],
    ['measured speech without refused', { name: 'next_tour_stop', ok: false, msSinceStart: 1, spokenMs: 0 }],
    ['fractional measured speech', { name: 'next_tour_stop', ok: false, msSinceStart: 1, refused: true, spokenMs: 1.5 }],
    ['negative measured speech', { name: 'next_tour_stop', ok: false, msSinceStart: 1, refused: true, spokenMs: -1 }],
    ['measured speech as text', { name: 'next_tour_stop', ok: false, msSinceStart: 1, refused: true, spokenMs: '3100' }],
  ])('rejects a tool call with %s', async (_label, call) => {
    const { lines, app } = await setup();
    const before = lines.length;
    expect((await post(app, { ...SUMMARY, tools: [call] })).status).toBe(400);
    expect(lines.length).toBe(before);
  });

  it('rejects plain text that is not JSON', async () => {
    const { lines, app } = await setup();
    const before = lines.length;
    expect((await post(app, 'not json', 'text/plain')).status).toBe(400);
    expect(lines.length).toBe(before);
  });

  it('still rejects a mic event with extra fields', async () => {
    const { app } = await setup();
    expect((await post(app, { type: 'mic_blocked', tools: [] })).status).toBe(400);
  });

  it('shares the per-address rate limit with the mic events', async () => {
    const { app } = await setup();
    for (let i = 0; i < EVENT_RATE_LIMIT.max; i += 1) await post(app, { type: 'mic_blocked' });
    expect((await post(app, SUMMARY)).status).toBe(429);
  });
});
