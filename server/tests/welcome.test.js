import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, expectNoSecrets, fakeClock, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;
const welcomeModule = await import('../welcome.js').catch(() => ({}));
const { welcomeText, WELCOME_RETRY_AFTER_MS, DEFAULT_WELCOME_MODEL, WELCOME_FALLBACK_MODEL, WELCOME_KINDS } = welcomeModule;
const { WELCOME_RATE_LIMIT } = appModule;

const setup = (options = {}) => startApp({ ...options, createApp });
const getWelcome = (app, guide = 'sylvi', host = HOST) => request(app).get(`/api/voice/welcome/${guide}`).set('Host', host);

// Kyle, 2026-10-11: the brain welcomes every visitor within seconds. The
// welcome is recorded once per guide on the server and cached, so it plays at
// once, costs nothing per visit and still works when every slot is taken.

describe('The welcome, word for word', () => {
  // Kyle, 2026-10-13: 'In stead of "Welcome" say "Hello!" As if the puppet is
  // turning and suddenly recognizing that a user has arrived.'
  it('says "Hello!", introduces the guide as a human brain and names the three ways in', () => {
    expect(welcomeText('Sylvi')).toBe(
      'Hello! I am Sylvi, a human brain. You can study with me to learn how I work, test your knowledge in the Brain Game, or explore on your own: turn me around and select any of my regions.'
    );
    expect(welcomeText('Rollo')).toContain('I am Rollo, a human brain.');
  });

  // Kyle, 2026-10-13: "Have a custom welcome for each button if the first
  // welcome never plays". A visitor whose first press is a choice hears the
  // welcome for that choice instead. Lines as drafted, approved by Kyle.
  it('has a welcome for each choice: Study the Brain and the Brain Game', () => {
    expect(WELCOME_KINDS).toEqual(['arrival', 'study', 'play']);
    expect(welcomeText('Sylvi', 'arrival')).toBe(welcomeText('Sylvi'));
    expect(welcomeText('Sylvi', 'study')).toBe(
      "Hello! I am Sylvi, a human brain. Let's study together: turn me around and select any of my regions, or ask me anything."
    );
    expect(welcomeText('Sylvi', 'play')).toBe('Hello! I am Sylvi. Turn me so each word lands on the part of me that does it.');
    expect(welcomeText('Rollo', 'study')).toContain('I am Rollo, a human brain.');
    expect(welcomeText('Rollo', 'play')).toContain('I am Rollo.');
  });

  it('has no em dashes', () => {
    for (const kind of WELCOME_KINDS) expect(welcomeText('Sylvi', kind)).not.toMatch(/\u2014/);
  });
});

describe('GET /api/voice/welcome/:guide?kind=', () => {
  it("returns the choice's own welcome, and where to fetch its audio", async () => {
    const { app } = await setup();
    const response = await request(app).get('/api/voice/welcome/sylvi?kind=study').set('Host', HOST);
    expect(response.status).toBe(200);
    const text = welcomeText('Sylvi', 'study');
    expect(response.body).toMatchObject({
      guideName: 'Sylvi',
      text,
      audioUrl: '/api/voice/welcome/sylvi/audio?kind=study',
      alignment: { chars: [...text] },
    });
  });

  it("serves the choice's own audio", async () => {
    const { app } = await setup();
    const response = await request(app).get('/api/voice/welcome/rollo/audio?kind=play').set('Host', HOST).buffer(true).parse((res, done) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe(`mp3:${welcomeText('Rollo', 'play').length}`);
  });

  it('records each guide and welcome once', async () => {
    const { app, upstream } = await setup();
    await request(app).get('/api/voice/welcome/sylvi?kind=play').set('Host', HOST);
    await request(app).get('/api/voice/welcome/sylvi/audio?kind=play').set('Host', HOST);
    await getWelcome(app, 'sylvi');
    expect(upstream.ttsRequests().map(({ init }) => JSON.parse(init.body).text)).toEqual([
      welcomeText('Sylvi', 'play'),
      welcomeText('Sylvi'),
    ]);
  });

  it('rejects an unknown welcome without calling ElevenLabs', async () => {
    const { app, upstream } = await setup();
    const response = await request(app).get('/api/voice/welcome/sylvi?kind=goodbye').set('Host', HOST);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'unknown_welcome' });
    expect(upstream.ttsRequests()).toHaveLength(0);
  });

  // A visit now fetches three recordings, text and audio each: six requests.
  // The limit only stops a script looping on them, so it keeps room for 60 visits an hour.
  it('allows 60 visits an hour from one address', () => {
    expect(WELCOME_RATE_LIMIT).toEqual({ max: 360, windowMs: 60 * 60 * 1000 });
  });
});

describe('GET /api/voice/welcome/:guide', () => {
  it('returns the text, where to fetch the audio, and when each letter is spoken', async () => {
    const { app } = await setup();
    const response = await getWelcome(app, 'sylvi');
    expect(response.status).toBe(200);
    const text = welcomeText('Sylvi');
    expect(response.body).toEqual({
      guideName: 'Sylvi',
      text,
      audioUrl: '/api/voice/welcome/sylvi/audio',
      model: DEFAULT_WELCOME_MODEL,
      alignment: {
        chars: [...text],
        startsMs: [...text].map((_, i) => Math.round(i * 100)),
      },
    });
    expectNoSecrets(response, expect);
  });

  it("records it in the guide's own voice, with the server-held key", async () => {
    const { app, upstream } = await setup();
    await getWelcome(app, 'rollo');
    const [{ url, init }] = upstream.ttsRequests();
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice_rollo_test/with-timestamps?output_format=mp3_44100_128');
    expect(init.method).toBe('POST');
    expect(init.headers['xi-api-key']).toBe(SECRETS.ELEVENLABS_API_KEY);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ text: welcomeText('Rollo'), model_id: DEFAULT_WELCOME_MODEL });
    // The agent's voice settings, so the welcome sounds like the live voice.
    expect(body.voice_settings).toEqual({ stability: 0.5, similarity_boost: 0.75 });
  });

  // Kyle, 2026-10-11: the welcome sounded like "an early 2000s digital voice".
  // It was recorded with Turbo v2.5 while the live agent speaks with V4 Turbo
  // in expressive mode. The welcome now uses the agent's model.
  it("records with the live agent's model, V4 Turbo, and keeps Turbo v2.5 only as a fallback", () => {
    expect(DEFAULT_WELCOME_MODEL).toBe('eleven_v4_turbo');
    expect(WELCOME_FALLBACK_MODEL).toBe('eleven_turbo_v2_5');
  });

  it('falls back to Turbo v2.5 when ElevenLabs refuses the model, and says which model it used', async () => {
    const warnings = [];
    const { app, upstream } = await setup({
      elevenLabs: { rejectModels: ['eleven_v4_turbo'] },
      logger: { info: () => {}, warn: (line) => warnings.push(line) },
    });
    const response = await getWelcome(app, 'sylvi');
    expect(response.status).toBe(200);
    expect(response.body.model).toBe('eleven_turbo_v2_5');
    expect(upstream.ttsRequests().map(({ init }) => JSON.parse(init.body).model_id)).toEqual(['eleven_v4_turbo', 'eleven_turbo_v2_5']);
    expect(warnings.join('\n')).toMatch(/eleven_v4_turbo.*eleven_turbo_v2_5/);
  });

  it('does not fall back on an outage: a 5xx fails and is tried again after a minute', async () => {
    const { app, upstream } = await setup({ elevenLabs: { ttsOk: false } });
    expect((await getWelcome(app)).status).toBe(502);
    expect(upstream.ttsRequests()).toHaveLength(1);
  });

  it('logs which model recorded each guide, for the staging logs', async () => {
    const lines = [];
    const { app } = await setup({ logger: { info: (line) => lines.push(line), warn: (line) => lines.push(line) } });
    await getWelcome(app, 'rollo');
    expect(lines).toContain('[voice] welcome recorded for rollo with eleven_v4_turbo');
  });

  it('takes the model from WELCOME_TTS_MODEL when set', async () => {
    const { app, upstream } = await setup({ env: { WELCOME_TTS_MODEL: 'model_from_env' } });
    await getWelcome(app);
    expect(JSON.parse(upstream.ttsRequests()[0].init.body).model_id).toBe('model_from_env');
  });

  it('records each guide once and serves every later visitor from memory', async () => {
    const { app, upstream } = await setup();
    await getWelcome(app, 'sylvi');
    await getWelcome(app, 'sylvi');
    await request(app).get('/api/voice/welcome/sylvi/audio').set('Host', HOST);
    expect(upstream.ttsRequests()).toHaveLength(1);
    await getWelcome(app, 'rollo');
    expect(upstream.ttsRequests()).toHaveLength(2);
  });

  it('serves the audio itself as mp3', async () => {
    const { app } = await setup();
    const response = await request(app).get('/api/voice/welcome/sylvi/audio').set('Host', HOST).buffer(true).parse((res, done) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^audio\/mpeg/);
    expect(response.body.toString()).toBe(`mp3:${welcomeText('Sylvi').length}`);
    expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
  });

  it('rejects an unknown guide without calling ElevenLabs', async () => {
    const { app, upstream } = await setup();
    expect((await getWelcome(app, 'specimen')).status).toBe(400);
    expect(upstream.ttsRequests()).toHaveLength(0);
  });

  it('answers only on our hosts', async () => {
    const { app, upstream } = await setup();
    expect((await getWelcome(app, 'sylvi', 'evil.example')).status).toBe(403);
    expect(upstream.ttsRequests()).toHaveLength(0);
  });

  it('says plainly when the recording failed, and tries again only after a minute', async () => {
    expect(WELCOME_RETRY_AFTER_MS).toBe(60_000);
    const clock = fakeClock();
    const { app, upstream } = await setup({ clock, elevenLabs: { ttsOk: false } });
    const first = await getWelcome(app);
    expect(first.status).toBe(502);
    expect(first.body).toEqual({ available: false, reason: 'upstream' });
    await getWelcome(app);
    expect(upstream.ttsRequests()).toHaveLength(1);
    upstream.state.ttsOk = true;
    clock.advance(WELCOME_RETRY_AFTER_MS);
    expect((await getWelcome(app)).status).toBe(200);
    expect(upstream.ttsRequests()).toHaveLength(2);
  });

  it('never counts against anyone\'s voice minutes', async () => {
    const { app, upstream } = await setup();
    await getWelcome(app);
    expect(upstream.tokenRequests()).toHaveLength(0);
  });
});

// Kyle, 2026-10-13: the voice started late. Measured on staging, the first
// request after a deploy waited 2.1 s while the server recorded it. The
// server records both guides as it starts, so no visitor waits.
describe('Recording the welcome as the server starts', () => {
  it('records both guides at once when asked to, every welcome, before any visitor', async () => {
    const { upstream } = await setup({ warmWelcomes: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The quips are recorded at start too (Kyle, 2026-10-23); quips.test.js checks those.
    const recorded = upstream
      .ttsRequests()
      .map(({ url, init }) => `${url.match(/text-to-speech\/([^/]+)\//)[1]} ${JSON.parse(init.body).text}`)
      .filter((line) => line.includes('Hello!'))
      .sort();
    const expected = [];
    for (const [voice, name] of [['voice_rollo_test', 'Rollo'], ['voice_sylvi_test', 'Sylvi']]) {
      for (const kind of ['arrival', 'study', 'play']) expected.push(`${voice} ${welcomeText(name, kind)}`);
    }
    expect(recorded).toEqual(expected.sort());
  });

  it('serves the first visitor from memory', async () => {
    const { app, upstream } = await setup({ warmWelcomes: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await getWelcome(app, 'sylvi')).status).toBe(200);
    expect((await request(app).get('/api/voice/welcome/sylvi?kind=study').set('Host', HOST)).status).toBe(200);
    expect(upstream.ttsRequests().filter(({ init }) => JSON.parse(init.body).text.includes('Hello!'))).toHaveLength(6);
  });

  it('records nothing at start unless asked', async () => {
    const { upstream } = await setup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(upstream.ttsRequests()).toHaveLength(0);
  });
});
