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

export function fakeElevenLabs({ ok = true, token = 'conv_token_abc' } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => (ok ? { token } : { detail: 'upstream failure' }),
      text: async () => (ok ? JSON.stringify({ token }) : 'upstream failure'),
    };
  };
  return { fetchImpl, requests };
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
