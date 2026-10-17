import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, fakeClock, fakeElevenLabs, startApp, tempDist } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

async function makeApp(env) {
  if (env) {
    // A bare environment: no voice variables at all.
    const app = createApp({ env, distDir: tempDist(), fetchImpl: fakeElevenLabs().fetchImpl, now: fakeClock().now });
    await app.locals.voice.ready;
    return app;
  }
  return (await startApp({ createApp })).app;
}

describe('M3: serving the game', () => {
  // Kyle, 2026-10-17: brain-game.io opens on the landing; Enter goes into the app at /app.
  it('serves the landing at /', async () => {
    const response = await request(await makeApp()).get('/').set('Host', HOST);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<main class="landing">');
  });

  it('serves the built game at /app', async () => {
    for (const route of ['/app', '/app/']) {
      const response = await request(await makeApp()).get(route).set('Host', HOST);
      expect(response.status).toBe(200);
      expect(response.text).toContain('<title>Brain Game</title>');
    }
  });

  it('serves built assets', async () => {
    const response = await request(await makeApp()).get('/assets/app.js').set('Host', HOST);
    expect(response.status).toBe(200);
    expect(response.text).toContain('brain game');
  });

  it('falls back to index.html for unknown app routes', async () => {
    const response = await request(await makeApp()).get('/study/anything').set('Host', HOST);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>Brain Game</title>');
  });

  it('answers a missing asset with 404, not the app', async () => {
    expect((await request(await makeApp()).get('/assets/missing.js').set('Host', HOST)).status).toBe(404);
  });

  it('answers an unknown API route with 404 JSON, not the app', async () => {
    const response = await request(await makeApp()).get('/api/nothing-here').set('Host', HOST);
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/json/);
  });
});

describe('M3: missing variables make voice unavailable, never the game', () => {
  const bare = { NODE_ENV: 'production' };

  it('still serves the game', async () => {
    const response = await request(await makeApp(bare)).get('/app').set('Host', HOST);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>Brain Game</title>');
  });

  it('reports voice unavailable', async () => {
    const response = await request(await makeApp(bare)).get('/api/voice/status').set('Host', HOST);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: false, reason: 'not_configured' });
  });

  it('refuses tokens with 503 and never calls ElevenLabs', async () => {
    const upstream = fakeElevenLabs();
    const app = createApp({ env: bare, distDir: tempDist(), fetchImpl: upstream.fetchImpl, now: fakeClock().now });
    await app.locals.voice.ready;
    const response = await request(app).post('/api/voice/token').set('Host', HOST).send({ guide: 'rollo' });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ available: false, reason: 'not_configured' });
    expect(upstream.requests).toHaveLength(0);
  });
});
