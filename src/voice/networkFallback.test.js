import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Kyle, 2026-10-20: "after pressing study, nothing happened." On his network
// (UDP blocked) the WebRTC audio link never opened: ElevenLabs gave up after
// 15 s ("could not establish pc connection") and the page waited on "Waking
// Sylvi…" forever. Writing failed the same way. 2026-10-21: "Yes go ahead",
// relayed through our server so the agent id never reaches the browser.

const sessionModule = await import('./voiceSession.js').catch(() => ({}));
const { createVoiceSession, CONNECT_TIMEOUT_MS, TRANSPORT_KEY, WEBSOCKET_MEMORY_MS, noRouteMessage } = sessionModule;

const WEBRTC = {
  conversationToken: 'conv_token_abc',
  guideName: 'Sylvi',
  voiceId: 'voice_sylvi',
  maxSeconds: 480,
  dynamicVariables: { guide_name: 'Sylvi', reservation: 'r1.s1' },
};
const RELAY = {
  relayPath: '/api/voice/relay?ticket=t1',
  guideName: 'Sylvi',
  voiceId: 'voice_sylvi',
  maxSeconds: 480,
  dynamicVariables: { guide_name: 'Sylvi', reservation: 'r2.s2' },
};

function fakeServer({ holdRelay = false } = {}) {
  const requests = [];
  let releaseRelay = () => {};
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url, body });
    if (url === '/api/voice/release' || url === '/api/voice/ended') return { ok: true, status: 200, json: async () => ({}) };
    if (url === '/api/voice/token') {
      if (body.transport === 'websocket') {
        if (holdRelay) await new Promise((resolve) => (releaseRelay = resolve));
        return { ok: true, status: 200, json: async () => RELAY };
      }
      return { ok: true, status: 200, json: async () => WEBRTC };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, requests, tokens: () => requests.filter((r) => r.url === '/api/voice/token'), release: () => releaseRelay() };
}

function memoryStorage() {
  const data = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), removeItem: (k) => delete data[k] };
}

function setup({ server = fakeServer(), storage = memoryStorage(), clock = { now: 1_000_000 }, start } = {}) {
  const calls = [];
  const timers = [];
  const conversation = {
    startSession: start ?? ((config) => calls.push(['startSession', config])),
    endSession: () => calls.push(['endSession']),
    sendContextualUpdate: () => {},
    getOutputVolume: () => 0,
  };
  const clientTools = { face_region: () => '{}' };
  const session = createVoiceSession({
    fetchImpl: server.fetchImpl,
    requestMicrophone: async () => 'granted',
    reportMicEvent: () => {},
    conversation,
    storage,
    clientTools,
    socketOrigin: 'wss://www.brain-game.io',
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeoutImpl: (id) => {
      if (timers[id]) timers[id].cleared = true;
    },
    now: () => clock.now,
    sendBeacon: () => true,
  });
  return { session, calls, timers, server, storage, clock, clientTools };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const starts = (calls) => calls.filter(([name]) => name === 'startSession').map(([, config]) => config);

describe('Sylvi on a network that blocks WebRTC', () => {
  it('tries WebRTC first, asking for it by name', async () => {
    const { session, server, calls } = setup();
    await session.start({ guide: 'sylvi', mode: 'voice' });
    expect(server.tokens()[0].body).toEqual({ guide: 'sylvi', transport: 'webrtc' });
    expect(starts(calls)[0]).toMatchObject({ conversationToken: 'conv_token_abc', connectionType: 'webrtc' });
  });

  it.each([
    ['the SDK reports an error', (session) => session.handleError('could not establish pc connection')],
    ['the SDK disconnects before connecting', (session) => session.handleDisconnect({ reason: 'error', message: 'Could not establish connection' })],
    ['15 s pass without a connection', (session, timers) => timers.find(({ ms }) => ms === CONNECT_TIMEOUT_MS).fn()],
  ])('falls back to our relay when %s, releasing the first reservation', async (_, fail) => {
    const { session, server, calls, timers, clientTools } = setup();
    await session.start({ guide: 'sylvi', mode: 'voice' });
    await fail(session, timers);
    await settle();
    const urls = server.requests.map(({ url }) => url);
    expect(urls).toEqual(['/api/voice/token', '/api/voice/release', '/api/voice/token']);
    expect(server.requests[1].body).toEqual({ reservation: 'r1.s1' });
    expect(server.tokens()[1].body).toEqual({ guide: 'sylvi', transport: 'websocket' });
    expect(calls.some(([name]) => name === 'endSession')).toBe(true);
    expect(starts(calls)[1]).toEqual({
      signedUrl: 'wss://www.brain-game.io/api/voice/relay?ticket=t1',
      connectionType: 'websocket',
      dynamicVariables: { guide_name: 'Sylvi', reservation: 'r2.s2' },
      overrides: { tts: { voiceId: 'voice_sylvi' } },
      clientTools,
    });
    // Still waking: the visitor sees no error while the second route is tried.
    expect(session.getState()).toMatchObject({ phase: 'connecting', message: null });
  });

  it('falls back when starting the session rejects', async () => {
    let first = true;
    const { session, server } = setup({
      start: () => {
        if (!first) return undefined;
        first = false;
        return Promise.reject(new Error('could not establish pc connection'));
      },
    });
    await session.start({ guide: 'sylvi', mode: 'voice' });
    await settle();
    expect(server.tokens().map(({ body }) => body.transport)).toEqual(['webrtc', 'websocket']);
  });

  it('says so plainly when the relay cannot connect either', async () => {
    const { session, timers } = setup();
    await session.start({ guide: 'sylvi', mode: 'voice' });
    session.handleError('could not establish pc connection');
    await settle();
    timers.filter(({ ms }) => ms === CONNECT_TIMEOUT_MS).at(-1).fn();
    await settle();
    expect(noRouteMessage('Sylvi')).toBe("Sylvi can't connect on this network right now. The game works as usual.");
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message: noRouteMessage('Sylvi') });
  });

  it('ignores the failed attempt\'s late goodbye while the relay is being arranged', async () => {
    const server = fakeServer({ holdRelay: true });
    const { session } = setup({ server });
    await session.start({ guide: 'sylvi', mode: 'voice' });
    session.handleError('could not establish pc connection');
    await settle();
    expect(session.getState().phase).toBe('requesting');
    session.handleDisconnect({ reason: 'error' });
    session.handleError('websocket error');
    expect(session.getState().phase).toBe('requesting');
    server.release();
    await settle();
    expect(session.getState().phase).toBe('connecting');
  });

  it('stops waiting once connected: no fallback, and the timer is cleared', async () => {
    const { session, server, timers } = setup();
    await session.start({ guide: 'sylvi', mode: 'voice' });
    await session.handleConnect({ conversationId: 'c1' });
    expect(timers.find(({ ms }) => ms === CONNECT_TIMEOUT_MS).cleared).toBe(true);
    session.handleError('a hiccup');
    await settle();
    expect(server.tokens()).toHaveLength(1);
    expect(session.getState().phase).toBe('connected');
  });

  it('remembers the relay in this browser for six hours, then tries WebRTC again', async () => {
    const storage = memoryStorage();
    const clock = { now: 1_000_000 };
    const first = setup({ storage, clock });
    await first.session.start({ guide: 'sylvi', mode: 'voice' });
    first.session.handleError('could not establish pc connection');
    await settle();
    expect(JSON.parse(storage.getItem(TRANSPORT_KEY))).toEqual({ transport: 'websocket', until: 1_000_000 + WEBSOCKET_MEMORY_MS });

    const later = setup({ storage, clock });
    await later.session.start({ guide: 'sylvi', mode: 'voice' });
    expect(later.server.tokens().map(({ body }) => body.transport)).toEqual(['websocket']);

    clock.now += WEBSOCKET_MEMORY_MS + 1;
    const nextDay = setup({ storage, clock });
    await nextDay.session.start({ guide: 'sylvi', mode: 'voice' });
    expect(nextDay.server.tokens().map(({ body }) => body.transport)).toEqual(['webrtc']);
  });

  it('works the same for writing (text only)', async () => {
    const { session, server, calls } = setup();
    await session.start({ guide: 'sylvi', mode: 'text' });
    session.handleError('could not establish pc connection');
    await settle();
    expect(server.tokens().map(({ body }) => body.transport)).toEqual(['webrtc', 'websocket']);
    expect(starts(calls)[1]).toMatchObject({ connectionType: 'websocket', overrides: { conversation: { textOnly: true } } });
  });

  it('is wired: the SDK\'s errors reach the session', () => {
    const panel = readFileSync(fileURLToPath(new URL('./VoicePanel.jsx', import.meta.url)), 'utf8');
    expect(panel).toMatch(/onError: \(message\) => \{\s*console\.warn\('\[voice\]', message\);\s*sessionRef\.current\?\.handleError\(message\);/);
  });
});
