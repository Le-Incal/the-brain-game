/**
 * Shared fixtures for the M3 server tests. Every secret here is a fake; no
 * test reads a real one. ElevenLabs is replaced by a fake fetch.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SECRETS = {
  ELEVENLABS_API_KEY: 'sk_test_api_key_never_leaks_123',
  ELEVENLABS_AGENT_ID: 'agent_test_never_leaks_456',
  VOICE_SESSION_SECRET: 'a'.repeat(64),
  ELEVENLABS_WEBHOOK_SECRET: 'whsec_test_never_leaks_789',
};

export function makeEnv(overrides = {}) {
  return {
    ...SECRETS,
    VOICE_ID_ROLLO: 'voice_rollo_test',
    VOICE_ID_SYLVI: 'voice_sylvi_test',
    VOICE_HOSTS: 'www.brain-game.io,brain-game.io',
    VOICE_SESSION_MAX_SECONDS: '480',
    VOICE_DAILY_MAX_SECONDS: '900',
    VOICE_GLOBAL_DAILY_MAX_SECONDS: '18000',
    VOICE_MAX_OPEN_RESERVATIONS: '10',
    NODE_ENV: 'production',
    ...overrides,
  };
}

export const HOST = 'www.brain-game.io';

export function fakeClock(start = Date.UTC(2026, 9, 5, 12, 0, 0)) {
  let now = start;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
    },
    set(ms) {
      now = ms;
    },
  };
}

/**
 * Fake ElevenLabs. Routes the two endpoints the server calls:
 *   GET /v1/convai/conversation/token  -> { token }
 *   GET /v1/convai/conversations       -> paged { conversations, has_more, next_cursor }
 * `pages` is a list of conversation arrays, one per page; `listFailures`
 * makes the first N history requests fail.
 */
export function fakeElevenLabs({ ok = true, token = 'conv_token_abc', pages: initialPages = [[]], listFailures = 0, details = {}, tokenConversationIds = true, ttsOk = true, rejectModels = [], signedUrl = 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_test_never_leaks_456&conversation_signature=sig_never_leaks' } = {}) {
  let pages = initialPages;
  const requests = [];
  // `details` maps conversation id -> { status, call_duration_secs }; ids not
  // listed answer 404 (the token was never used).
  const state = { listFailures, minted: 0, details, ttsOk, rejectModels };
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    requests.push({ url: href, init });
    // Text to speech with timestamps: three letters, 100 ms each, and a few bytes of "audio".
    if (href.includes('/v1/text-to-speech/')) {
      if (!state.ttsOk) return reply(500, { detail: 'tts failure' });
      const ttsBody = JSON.parse(init.body ?? '{}');
      // A model this account cannot use is refused, as ElevenLabs does.
      if (state.rejectModels.includes(ttsBody.model_id)) return reply(422, { detail: 'model not available' });
      const text = ttsBody.text ?? '';
      const characters = [...text];
      return reply(200, {
        audio_base64: Buffer.from(`mp3:${text.length}`).toString('base64'),
        alignment: {
          characters,
          character_start_times_seconds: characters.map((_, i) => i * 0.1),
          character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.1),
        },
      });
    }
    // The signed WebSocket address for the relay (Kyle, 2026-10-21).
    if (href.includes('/v1/convai/conversation/get-signed-url')) {
      if (!ok) return reply(500, { detail: 'upstream failure' });
      return reply(200, { signed_url: signedUrl });
    }
    if (href.includes('/v1/convai/conversation/token')) {
      if (!ok) return reply(500, { detail: 'upstream failure' });
      state.minted += 1;
      return reply(200, tokenConversationIds ? { token, conversation_id: `conv_minted_${state.minted}` } : { token });
    }
    const detail = href.match(/\/v1\/convai\/conversations\/([^/?]+)/);
    if (detail) {
      const record = state.details[decodeURIComponent(detail[1])];
      if (!record) return reply(404, { detail: 'conversation not found' });
      return reply(200, {
        agent_id: SECRETS.ELEVENLABS_AGENT_ID,
        conversation_id: decodeURIComponent(detail[1]),
        status: record.status,
        metadata: { start_time_unix_secs: 1791199000, call_duration_secs: record.call_duration_secs },
        conversation_initiation_client_data: { dynamic_variables: record.dynamic_variables ?? {} },
      });
    }
    if (href.includes('/v1/convai/conversations')) {
      if (state.listFailures > 0) {
        state.listFailures -= 1;
        return reply(503, { detail: 'history unavailable' });
      }
      const cursor = new URL(href).searchParams.get('cursor');
      const index = cursor ? Number(cursor) : 0;
      const hasMore = index < pages.length - 1;
      return reply(200, {
        conversations: pages[index] ?? [],
        has_more: hasMore,
        next_cursor: hasMore ? String(index + 1) : null,
      });
    }
    return reply(404, { detail: 'not found' });
  };
  return {
    fetchImpl,
    requests,
    state,
    setPages: (next) => {
      pages = next;
    },
    tokenRequests: () => requests.filter(({ url }) => url.includes('/conversation/token')),
    signedUrlRequests: () => requests.filter(({ url }) => url.includes('/conversation/get-signed-url')),
    ttsRequests: () => requests.filter(({ url }) => url.includes('/v1/text-to-speech/')),
    historyRequests: () => requests.filter(({ url }) => /\/convai\/conversations(\?|$)/.test(url)),
    detailRequests: () => requests.filter(({ url }) => /\/convai\/conversations\/[^/?]+/.test(url)),
  };
}

/**
 * Builds the app and waits for today's usage to be restored from ElevenLabs,
 * as the real server does before it offers voice.
 */
export async function startApp({ env = {}, elevenLabs = {}, clock = fakeClock(), distDir = tempDist(), createApp, setIntervalImpl, logger, warmWelcomes } = {}) {
  const upstream = fakeElevenLabs(elevenLabs);
  const app = createApp({
    env: makeEnv(env),
    distDir,
    fetchImpl: upstream.fetchImpl,
    now: clock.now,
    setIntervalImpl: setIntervalImpl ?? (() => null),
    logger: logger ?? { info: () => {}, warn: () => {} },
    ...(warmWelcomes === undefined ? {} : { warmWelcomes }),
  });
  await app.locals.voice.ready;
  return { app, clock, upstream };
}

export function signWebhook(rawBody, secret = SECRETS.ELEVENLABS_WEBHOOK_SECRET, timestampSecs) {
  const t = String(timestampSecs);
  const v0 = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v0=${v0}`;
}

export function postCallBody({ reservation, conversationId = 'conv_1', durationSecs = 120, agentId = SECRETS.ELEVENLABS_AGENT_ID, type = 'post_call_transcription' }) {
  return JSON.stringify({
    type,
    event_timestamp: 1791200000,
    data: {
      agent_id: agentId,
      conversation_id: conversationId,
      metadata: { start_time_unix_secs: 1791199000, call_duration_secs: durationSecs },
      conversation_initiation_client_data: {
        dynamic_variables: reservation === undefined ? { guide_name: 'Rollo' } : { guide_name: 'Rollo', reservation },
      },
    },
  });
}

export function tempDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-game-dist-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Brain Game</title><div id="root"></div>');
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log("brain game")');
  // The front door (Kyle, 2026-10-17): the landing, built to landing/index.html.
  fs.mkdirSync(path.join(dir, 'landing'));
  fs.writeFileSync(path.join(dir, 'landing', 'index.html'), '<!doctype html><title>Brain Game · A Study in Cognition</title><main class="landing"></main>');
  // The slim model and a map (Kyle, 2026-10-20): stand-ins of a realistic kind.
  fs.mkdirSync(path.join(dir, 'web', 'maps'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'web', 'brain.glb'), Buffer.alloc(64 * 1024, 7));
  fs.writeFileSync(path.join(dir, 'web', 'maps', 'brain_ao.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64 * 1024, 3)]));
  return dir;
}

/** Every secret value, to assert none ever appears in a response. */
export function expectNoSecrets(response, expect) {
  const text = JSON.stringify({ headers: response.headers, body: response.body, text: response.text });
  for (const [name, value] of Object.entries(SECRETS)) {
    expect(text.includes(value), `${name} leaked`).toBe(false);
  }
}

export function cookieFrom(response) {
  const header = [].concat(response.headers['set-cookie'] ?? []).find((c) => c.startsWith('bg_device='));
  return header ? header.split(';')[0] : null;
}
