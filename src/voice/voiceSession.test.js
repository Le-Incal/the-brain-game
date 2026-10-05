import { describe, expect, it } from 'vitest';

const sessionModule = await import('./voiceSession.js').catch(() => ({}));
const { createVoiceSession, CONSENT_TEXT, CONSENT_STORAGE_KEY } = sessionModule;

const TOKEN_RESPONSE = {
  conversationToken: 'conv_token_abc',
  guideName: 'Rollo',
  voiceId: 'voice_rollo',
  maxSeconds: 480,
  dynamicVariables: { guide_name: 'Rollo', reservation: 'resid.sig' },
};

function fakeServer({ token = TOKEN_RESPONSE, tokenStatus = 200, refusal } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url === '/api/voice/token') {
      if (refusal) return { ok: false, status: refusal.status, json: async () => refusal.body };
      const guide = JSON.parse(init.body).guide;
      const body = guide === 'sylvi'
        ? { ...token, guideName: 'Sylvi', voiceId: 'voice_sylvi', dynamicVariables: { guide_name: 'Sylvi', reservation: 'r2.s2' } }
        : token;
      return { ok: tokenStatus === 200, status: tokenStatus, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, requests };
}

function fakeConversation() {
  const calls = [];
  return {
    calls,
    startSession: (config) => calls.push(['startSession', config]),
    endSession: () => calls.push(['endSession']),
    sendContextualUpdate: (text) => calls.push(['sendContextualUpdate', text]),
    getOutputVolume: () => 0.42,
  };
}

function memoryStorage() {
  const data = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)) };
}

function setup({ server = fakeServer(), storage = memoryStorage(), consented = true } = {}) {
  const conversation = fakeConversation();
  const timers = [];
  if (consented) storage.setItem(CONSENT_STORAGE_KEY, '1');
  const clientTools = { face_region: () => '{}' };
  const session = createVoiceSession({
    fetchImpl: server.fetchImpl,
    conversation,
    storage,
    clientTools,
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeoutImpl: (id) => {
      if (timers[id]) timers[id].cleared = true;
    },
  });
  return { session, conversation, server, storage, timers, clientTools };
}

describe('M4: consent before the mic first opens', () => {
  it('shows the agreed notice, word for word', () => {
    expect(CONSENT_TEXT).toBe(
      "Talking with your guide sends your voice to ElevenLabs, our voice provider. Audio isn't stored; transcripts are kept for 30 days to improve the guide. Please don't share personal details."
    );
  });

  it('asks for consent first, and only then requests a token', async () => {
    const { session, server, storage } = setup({ consented: false });
    await session.start({ guide: 'rollo' });
    expect(session.getState().phase).toBe('needs-consent');
    expect(server.requests).toHaveLength(0);

    await session.acceptConsent();
    expect(storage.data[CONSENT_STORAGE_KEY]).toBe('1');
    expect(server.requests.map(({ url }) => url)).toEqual(['/api/voice/token']);
    expect(session.getState().phase).toBe('connecting');
  });

  it('does not ask again once consent is saved', async () => {
    const { session } = setup();
    await session.start({ guide: 'rollo' });
    expect(session.getState().phase).toBe('connecting');
  });

  it('asks every time when storage is blocked', async () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const { session } = setup({ storage: blocked, consented: false });
    await session.start({ guide: 'rollo' });
    expect(session.getState().phase).toBe('needs-consent');
  });

  it('declining leaves voice off', async () => {
    const { session, server } = setup({ consented: false });
    await session.start({ guide: 'rollo' });
    session.declineConsent();
    expect(session.getState().phase).toBe('idle');
    expect(server.requests).toHaveLength(0);
  });
});

describe('M4: starting a conversation', () => {
  it('requests a token for the chosen guide', async () => {
    const { session, server } = setup();
    await session.start({ guide: 'sylvi' });
    expect(server.requests[0]).toMatchObject({ url: '/api/voice/token', body: { guide: 'sylvi' } });
    expect(server.requests[0].init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
  });

  it('starts the session over WebRTC with the voice override always sent and the dynamic variables as returned', async () => {
    const { session, conversation, clientTools } = setup();
    await session.start({ guide: 'rollo' });
    expect(conversation.calls).toEqual([
      [
        'startSession',
        {
          conversationToken: 'conv_token_abc',
          connectionType: 'webrtc',
          dynamicVariables: { guide_name: 'Rollo', reservation: 'resid.sig' },
          overrides: { tts: { voiceId: 'voice_rollo' } },
          clientTools,
        },
      ],
    ]);
  });

  it('on connect, records the conversation and reports nothing back (the server matched it at mint)', async () => {
    const { session, server } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'conv_123' });
    expect(session.getState()).toMatchObject({ phase: 'connected', guide: 'rollo', conversationId: 'conv_123' });
    expect(server.requests.map(({ url }) => url)).toEqual(['/api/voice/token']);
  });

  it('ends the conversation itself at the reserved time', async () => {
    const { session, conversation, timers } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'conv_123' });
    const cutoff = timers.find(({ ms }) => ms === 480_000);
    expect(cutoff).toBeDefined();
    cutoff.fn();
    expect(conversation.calls.at(-1)).toEqual(['endSession']);
  });

  it.each([
    [{ status: 429, body: { available: false, reason: 'device_daily_cap', resetsInSeconds: 3 * 3600 } }, "You've used today's voice time. Voice returns in about 3 hours."],
    [{ status: 503, body: { available: false, reason: 'global_budget', resetsInSeconds: 3 * 3600 } }, "Voice has reached today's limit for everyone. It returns in about 3 hours."],
    [{ status: 503, body: { available: false, reason: 'restoring' } }, 'Voice is starting up. Try again in a moment.'],
    [{ status: 429, body: { available: false, reason: 'busy' } }, 'The guide is busy, try again shortly.'],
  ])('explains a refusal in plain words (%j)', async (refusal, message) => {
    const { session, conversation } = setup({ server: fakeServer({ refusal }) });
    await session.start({ guide: 'rollo' });
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message });
    expect(conversation.calls).toEqual([]);
  });

  it('survives a network failure with a plain message', async () => {
    const server = { fetchImpl: async () => { throw new Error('offline'); } };
    const { session } = setup({ server });
    await session.start({ guide: 'rollo' });
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message: 'Voice is unavailable right now. The game works as usual.' });
  });
});

describe('M4: during and after a conversation', () => {
  it('reads the guide speaking level only while connected', async () => {
    const { session } = setup();
    expect(session.outputLevel()).toBe(0);
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    expect(session.outputLevel()).toBe(0.42);
  });

  it('sends contextual updates only while connected', async () => {
    const { session, conversation } = setup();
    session.sendContext('[player] idle 25s');
    expect(conversation.calls).toEqual([]);
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    session.sendContext('[player] idle 25s');
    expect(conversation.calls.at(-1)).toEqual(['sendContextualUpdate', '[player] idle 25s']);
  });

  it('ending clears the cutoff and returns to idle; a disconnect from the agent does too', async () => {
    const { session, conversation, timers } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    session.end();
    expect(conversation.calls.at(-1)).toEqual(['endSession']);
    expect(timers.every(({ cleared }) => cleared)).toBe(true);
    expect(session.getState().phase).toBe('idle');

    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'd' });
    session.handleDisconnect({ reason: 'agent' });
    expect(session.getState().phase).toBe('idle');
  });

  it('a guide change while talking applies to the next conversation', async () => {
    const { session, conversation, server } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    expect(session.changeGuide('sylvi')).toEqual({ applies: 'next-conversation' });
    expect(conversation.calls.filter(([name]) => name === 'endSession')).toHaveLength(0);
    session.end();
    await session.start({});
    expect(server.requests.filter(({ url }) => url === '/api/voice/token').at(-1).body).toEqual({ guide: 'sylvi' });
  });

  it('"Switch now" ends this conversation and starts one with the new guide', async () => {
    const { session, conversation } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    await session.switchGuideNow('sylvi');
    const names = conversation.calls.map(([name]) => name);
    expect(names).toEqual(['startSession', 'endSession', 'startSession']);
    expect(conversation.calls.at(-1)[1].overrides).toEqual({ tts: { voiceId: 'voice_sylvi' } });
  });
});
