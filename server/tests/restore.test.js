import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, fakeClock, fakeElevenLabs, makeEnv, startApp, tempDist } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp, RESTORE_RETRY_DELAYS_MS } = appModule;

const TODAY_START_SECS = Date.UTC(2026, 9, 5) / 1000;

const conversation = (id, durationSecs, status = 'done') => ({
  agent_id: SECRETS.ELEVENLABS_AGENT_ID,
  conversation_id: id,
  start_time_unix_secs: TODAY_START_SECS + 3600,
  call_duration_secs: durationSecs,
  message_count: 4,
  status,
  call_successful: 'success',
});

describe("M3: on startup, today's global usage is rebuilt from ElevenLabs", () => {
  it("asks ElevenLabs for today's conversations for our agent, with the server-held key", async () => {
    const { upstream } = await startApp({ createApp });
    const [first] = upstream.historyRequests();
    const url = new URL(first.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://api.elevenlabs.io/v1/convai/conversations');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      agent_id: SECRETS.ELEVENLABS_AGENT_ID,
      call_start_after_unix: String(TODAY_START_SECS),
      page_size: '100',
      summary_mode: 'exclude',
    });
    expect(first.init.headers['xi-api-key']).toBe(SECRETS.ELEVENLABS_API_KEY);
  });

  it('follows every page and restores the global total', async () => {
    const { app, upstream } = await startApp({
      createApp,
      elevenLabs: {
        pages: [
          [conversation('a', 120), conversation('b', 300)],
          [conversation('c', 60, 'in-progress')],
        ],
      },
    });
    expect(upstream.historyRequests()).toHaveLength(2);
    expect(new URL(upstream.historyRequests()[1].url).searchParams.get('cursor')).toBe('1');
    expect(app.locals.voice.ledger.globalRemaining()).toBe(18000 - 120 - 300 - 480);
  });

  it('reports voice unavailable for the day if the restored total already spends the budget', async () => {
    const { app } = await startApp({
      createApp,
      env: { VOICE_GLOBAL_DAILY_MAX_SECONDS: '480' },
      elevenLabs: { pages: [[conversation('a', 480)]] },
    });
    const status = await request(app).get('/api/voice/status').set('Host', HOST);
    expect(status.body).toMatchObject({ available: false, reason: 'global_budget' });
  });

  it('makes no history request when voice is not configured', async () => {
    const upstream = fakeElevenLabs();
    const app = createApp({ env: { NODE_ENV: 'production' }, distDir: tempDist(), fetchImpl: upstream.fetchImpl, now: fakeClock().now });
    await app.locals.voice.ready;
    expect(upstream.requests).toHaveLength(0);
  });
});

describe('M3: if the rebuild fails, voice waits and retries', () => {
  function startFailing(listFailures) {
    const timers = [];
    const upstream = fakeElevenLabs({ listFailures, pages: [[conversation('a', 100)]] });
    const app = createApp({
      env: makeEnv(),
      distDir: tempDist(),
      fetchImpl: upstream.fetchImpl,
      now: fakeClock().now,
      setTimeoutImpl: (fn, ms) => timers.push({ fn, ms }),
    });
    return { app, timers, upstream };
  }

  it('reports voice unavailable with a clear reason while the game keeps serving', async () => {
    const { app } = startFailing(1);
    await app.locals.voice.lastAttempt;
    expect((await request(app).get('/api/voice/status').set('Host', HOST)).body).toEqual({
      available: false,
      reason: 'restoring',
    });
    const token = await request(app).post('/api/voice/token').set('Host', HOST).send({ guide: 'rollo' });
    expect(token.status).toBe(503);
    expect(token.body).toEqual({ available: false, reason: 'restoring' });
    expect((await request(app).get('/').set('Host', HOST)).status).toBe(200);
  });

  it('retries with growing delays until the rebuild succeeds, then offers voice', async () => {
    const { app, timers, upstream } = startFailing(2);
    await app.locals.voice.lastAttempt;
    expect(timers.map(({ ms }) => ms)).toEqual([RESTORE_RETRY_DELAYS_MS[0]]);

    timers[0].fn();
    await app.locals.voice.lastAttempt;
    expect(timers.map(({ ms }) => ms)).toEqual(RESTORE_RETRY_DELAYS_MS.slice(0, 2));

    timers[1].fn();
    await app.locals.voice.lastAttempt;
    await app.locals.voice.ready;
    expect(upstream.historyRequests()).toHaveLength(3);
    expect(app.locals.voice.ledger.globalRemaining()).toBe(18000 - 100);
    expect((await request(app).get('/api/voice/status').set('Host', HOST)).body).toMatchObject({ available: true });
  });

  it('keeps growing delays sensible: start within seconds, cap within minutes', () => {
    expect(RESTORE_RETRY_DELAYS_MS[0]).toBeLessThanOrEqual(10_000);
    expect(Math.max(...RESTORE_RETRY_DELAYS_MS)).toBeLessThanOrEqual(5 * 60_000);
    expect([...RESTORE_RETRY_DELAYS_MS].sort((a, b) => a - b)).toEqual(RESTORE_RETRY_DELAYS_MS);
  });
});
