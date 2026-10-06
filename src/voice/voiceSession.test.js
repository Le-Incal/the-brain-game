import { describe, expect, it } from 'vitest';

const sessionModule = await import('./voiceSession.js').catch(() => ({}));
const {
  createVoiceSession,
  createMicEventReporter,
  CONSENT_TEXT,
  CONSENT_STORAGE_KEY,
  MIC_BLOCKED_MESSAGE,
  MIC_UNAVAILABLE_MESSAGE,
  requestMicrophoneAccess,
} = sessionModule;

const TOKEN_RESPONSE = {
  conversationToken: 'conv_token_abc',
  guideName: 'Rollo',
  voiceId: 'voice_rollo',
  maxSeconds: 480,
  dynamicVariables: { guide_name: 'Rollo', reservation: 'resid.sig' },
};

function fakeServer({ token = TOKEN_RESPONSE, tokenStatus = 200, refusal, busyTimes = 0 } = {}) {
  const requests = [];
  let busyLeft = busyTimes;
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url === '/api/voice/event') return { ok: true, status: 204, json: async () => ({}) };
    if (url === '/api/voice/release') return { ok: true, status: 200, json: async () => ({ status: 'released' }) };
    if (url === '/api/voice/token') {
      if (refusal) return { ok: false, status: refusal.status, json: async () => refusal.body };
      if (busyLeft > 0) {
        busyLeft -= 1;
        return { ok: false, status: 429, json: async () => ({ available: false, reason: 'busy' }) };
      }
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

function setup({ server = fakeServer(), storage = memoryStorage(), consented = true, mic = 'granted', micReporter, clock } = {}) {
  const ended = [];
  const conversation = fakeConversation();
  const timers = [];
  const order = [];
  const trackedServer = {
    ...server,
    fetchImpl: (url, init) => {
      order.push(url);
      return server.fetchImpl(url, init);
    },
  };
  if (consented) storage.setItem(CONSENT_STORAGE_KEY, '1');
  const clientTools = { face_region: () => '{}' };
  const session = createVoiceSession({
    fetchImpl: trackedServer.fetchImpl,
    requestMicrophone: async () => {
      order.push('microphone');
      return mic;
    },
    // One reporter per page load; a fresh one per test unless shared on purpose.
    reportMicEvent: micReporter ?? createMicEventReporter?.(trackedServer.fetchImpl),
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
    now: clock ? () => clock.now : undefined,
    onConversationEnd: () => ended.push(true),
  });
  return { session, conversation, server, storage, timers, clientTools, order, ended };
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

describe('M4: a blocked microphone', () => {
  // The SDK cannot start a voice session without the mic: WebRTC setup waits
  // for the microphone and disconnects if it is refused (checked in
  // @elevenlabs/client 1.26.0). So the app asks for the mic before the token,
  // and no minutes are reserved for a conversation that cannot happen.
  it('asks for the microphone after consent and before the token', async () => {
    const { session, order } = setup();
    await session.start({ guide: 'rollo' });
    expect(order).toEqual(['microphone', '/api/voice/token']);
  });

  it('explains a blocked microphone plainly and reserves nothing', async () => {
    const { session, server, conversation } = setup({ mic: 'denied' });
    await session.start({ guide: 'rollo' });
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message: MIC_BLOCKED_MESSAGE });
    expect(server.requests.map(({ url }) => url)).not.toContain('/api/voice/token');
    expect(MIC_BLOCKED_MESSAGE).toBe(
      "Your microphone is blocked, so we can't talk aloud. Allow the microphone for this site in your browser settings, then try again. On a school Chromebook, ask your teacher."
    );
    expect(conversation.calls).toEqual([]);
  });

  it('explains when there is no microphone to use', async () => {
    const { session, server } = setup({ mic: 'unavailable' });
    await session.start({ guide: 'rollo' });
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message: MIC_UNAVAILABLE_MESSAGE });
    expect(MIC_UNAVAILABLE_MESSAGE).toBe("This browser can't use a microphone here, so we can't talk aloud.");
    expect(server.requests.map(({ url }) => url)).not.toContain('/api/voice/token');
  });
});

describe('M4: a conversation that fails to start releases its reservation at once', () => {
  // Otherwise the one-per-device cap tells the player "the guide is busy" for
  // up to 30 minutes. The server confirms with ElevenLabs before refunding.
  it('asks the server to release it when the session errors before connecting', async () => {
    const { session, server } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleDisconnect({ reason: 'error', message: 'Could not establish connection' });
    expect(server.requests.at(-1)).toMatchObject({ url: '/api/voice/release', body: { reservation: 'resid.sig' } });
    expect(server.requests.at(-1).init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message: "We couldn't start the conversation. Please try again." });
  });

  it('releases it when the player ends before it connects', async () => {
    const { session, server } = setup();
    await session.start({ guide: 'rollo' });
    session.end();
    await Promise.resolve();
    expect(server.requests.map(({ url }) => url)).toContain('/api/voice/release');
  });

  it('never asks once the conversation has connected', async () => {
    const { session, server } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    await session.handleDisconnect({ reason: 'error', message: 'dropped' });
    session.end();
    expect(server.requests.map(({ url }) => url)).not.toContain('/api/voice/release');
  });
});

describe('M4: requestMicrophoneAccess', () => {
  it('reports granted and releases the microphone at once', async () => {
    const stopped = [];
    const stream = { getTracks: () => [{ stop: () => stopped.push('track') }] };
    const nav = { mediaDevices: { getUserMedia: async (constraints) => (constraints.audio ? stream : null) } };
    expect(await requestMicrophoneAccess(nav)).toBe('granted');
    expect(stopped).toEqual(['track']);
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'unavailable'],
    ['NotReadableError', 'unavailable'],
  ])('reports %s as %s', async (name, expected) => {
    const nav = { mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error(name), { name }); } } };
    expect(await requestMicrophoneAccess(nav)).toBe(expected);
  });

  it('reports unavailable without media devices (an insecure page or an old browser)', async () => {
    expect(await requestMicrophoneAccess({})).toBe('unavailable');
    expect(await requestMicrophoneAccess(undefined)).toBe('unavailable');
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

describe('M4: warning the guide before the cutoff', () => {
  // The app ends the conversation at its reserved time, which can be under
  // 8 minutes; 30 s before that, the guide is told so it can say goodbye.
  it('sends the warning once, 30 s before the reserved time', async () => {
    const { session, conversation, timers } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    const warning = timers.find(({ ms }) => ms === 450_000);
    expect(warning).toBeDefined();
    warning.fn();
    expect(conversation.calls.filter(([name]) => name === 'sendContextualUpdate')).toEqual([
      ['sendContextualUpdate', '[app] about 30 seconds of our conversation remain'],
    ]);
  });

  it('warns at once when less than 30 s was reserved', async () => {
    const short = fakeServer({ token: { ...TOKEN_RESPONSE, maxSeconds: 20 } });
    const { session, conversation, timers } = setup({ server: short });
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    expect(conversation.calls.at(-1)).toEqual(['sendContextualUpdate', '[app] about 30 seconds of our conversation remain']);
    expect(timers.some(({ ms }) => ms === 20_000)).toBe(true);
  });

  it('drops the warning when the conversation ends first', async () => {
    const { session, timers } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    session.end();
    expect(timers.find(({ ms }) => ms === 450_000).cleared).toBe(true);
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

describe('M4: reporting a blocked microphone, so we can count it', () => {
  it.each([
    ['denied', 'mic_blocked'],
    ['unavailable', 'mic_unsupported'],
  ])('a %s mic sends {type: %s} and nothing else', async (mic, type) => {
    const server = fakeServer();
    const { session } = setup({ server, mic });
    await session.start({ guide: 'rollo' });
    await Promise.resolve();
    expect(server.requests).toEqual([
      expect.objectContaining({ url: '/api/voice/event', body: { type }, init: expect.objectContaining({ method: 'POST' }) }),
    ]);
  });

  it('a granted mic reports nothing', async () => {
    const { session, server } = setup();
    await session.start({ guide: 'rollo' });
    expect(server.requests.map(({ url }) => url)).not.toContain('/api/voice/event');
  });
});

describe('M4: the blocked-mic count means players, not clicks', () => {
  it('sends the event once per page load, however many times Talk is pressed', async () => {
    const server = fakeServer();
    const { session } = setup({ server, mic: 'denied' });
    await session.start({ guide: 'rollo' });
    await session.start({ guide: 'rollo' });
    await session.start({ guide: 'sylvi' });
    await Promise.resolve();
    expect(server.requests.filter(({ url }) => url === '/api/voice/event')).toHaveLength(1);
  });

  it('stays at one across conversations on the same page (leaving and re-entering Study mode)', async () => {
    const server = fakeServer();
    const micReporter = createMicEventReporter(server.fetchImpl);
    const first = setup({ server, mic: 'denied', micReporter });
    await first.session.start({ guide: 'rollo' });
    const second = setup({ server, mic: 'unavailable', micReporter });
    await second.session.start({ guide: 'rollo' });
    await Promise.resolve();
    expect(server.requests.filter(({ url }) => url === '/api/voice/event')).toEqual([
      expect.objectContaining({ body: { type: 'mic_blocked' } }),
    ]);
  });
});

describe('The guide lets go of the brain when the conversation ends', () => {
  it.each([
    ['ends', (session) => session.end()],
    ['disconnects', (session) => session.handleDisconnect({ reason: 'agent' })],
    ['is switched to the other guide', (session) => session.switchGuideNow('sylvi')],
  ])('signals the end when the conversation %s', async (_label, act) => {
    const { session, ended } = setup();
    await session.start({ guide: 'rollo' });
    await session.handleConnect({ conversationId: 'c' });
    await act(session);
    expect(ended.length).toBeGreaterThanOrEqual(1);
  });
});

describe('"The guide is busy" right after this page\'s own conversation', () => {
  // Live run: Sylvi ended about 13:38:35, Talk was pressed at 13:38:38 and
  // refused busy (device), her webhook settled at 13:38:58.
  async function talkAgain({ busyTimes, secondsAfterEnd }) {
    const clock = { now: 1_000_000 };
    const server = fakeServer({ busyTimes });
    const context = setup({ server, clock });
    await context.session.start({ guide: 'rollo' });
    await context.session.handleConnect({ conversationId: 'c1' });
    context.session.end();
    clock.now += secondsAfterEnd * 1000;
    await context.session.start({ guide: 'rollo' });
    return { ...context, clock };
  }

  async function runRetry(timers) {
    const retry = timers.filter((t) => t.ms === 5000 && !t.cleared && !t.ran).at(-1);
    if (!retry) return false;
    retry.ran = true;
    await retry.fn();
    return true;
  }

  it('says the guide is getting ready and retries every 5 s until it can start', async () => {
    const { session, timers, conversation } = await talkAgain({ busyTimes: 2, secondsAfterEnd: 3 });
    expect(session.getState()).toMatchObject({ phase: 'requesting', message: 'One moment, Rollo is getting ready…' });
    expect(await runRetry(timers)).toBe(true);
    expect(session.getState().message).toBe('One moment, Rollo is getting ready…');
    expect(await runRetry(timers)).toBe(true);
    expect(session.getState().phase).toBe('connecting');
    expect(conversation.calls.filter(([name]) => name === 'startSession')).toHaveLength(2);
  });

  it('gives up after 45 s and shows the busy message', async () => {
    const { session, timers } = await talkAgain({ busyTimes: 100, secondsAfterEnd: 3 });
    let retries = 0;
    while (await runRetry(timers)) retries += 1;
    expect(retries).toBe(9);
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message: 'The guide is busy, try again shortly.' });
  });

  it('shows the busy message at once when this page has not just ended a conversation', async () => {
    const { session, timers } = await talkAgain({ busyTimes: 1, secondsAfterEnd: 61 });
    expect(session.getState()).toMatchObject({ phase: 'unavailable', message: 'The guide is busy, try again shortly.' });
    expect(timers.filter((t) => t.ms === 5000)).toHaveLength(0);
  });
});

