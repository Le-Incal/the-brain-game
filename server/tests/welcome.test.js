import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, SECRETS, expectNoSecrets, fakeClock, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;
const welcomeModule = await import('../welcome.js').catch(() => ({}));
const { welcomeText, WELCOME_RETRY_AFTER_MS, DEFAULT_WELCOME_MODEL } = welcomeModule;

const setup = (options = {}) => startApp({ ...options, createApp });
const getWelcome = (app, guide = 'sylvi', host = HOST) => request(app).get(`/api/voice/welcome/${guide}`).set('Host', host);

// Kyle, 2026-10-11: the brain welcomes every visitor within seconds. The
// welcome is recorded once per guide on the server and cached, so it plays at
// once, costs nothing per visit and still works when every slot is taken.

describe('The welcome, word for word', () => {
  it('introduces the guide as a human brain and names the three ways in', () => {
    expect(welcomeText('Sylvi')).toBe(
      'Welcome. I am Sylvi, a human brain. You can study with me to learn how I work, test your knowledge in the Brain Game, or explore on your own: turn me around and select any of my regions.'
    );
    expect(welcomeText('Rollo')).toContain('I am Rollo, a human brain.');
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
