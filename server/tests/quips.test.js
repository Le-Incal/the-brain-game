import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HOST, startApp } from './helpers.js';

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;
const quipsModule = await import('../quips.js').catch(() => ({}));
const { QUIPS } = quipsModule;

const setup = (options = {}) => startApp({ ...options, createApp });
const audio = (req) =>
  req.buffer(true).parse((res, done) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

// Kyle, 2026-10-23: "When the user gets something right in the game, there
// should be a small and short acknowledgment ... super short and quippy
// comments. Encouraging to the user." 2026-10-25: "create your own quips".
// Recorded once per guide, like the welcome, so a catch is answered at once
// and never costs a conversation turn.

describe('The quips, word for word', () => {
  it('are twelve short, encouraging lines, all different', () => {
    expect(QUIPS).toEqual([
      'Spot on!',
      'Right where it lives.',
      'Splendid catch!',
      'Exactly so.',
      'That is the very spot.',
      'Bravo!',
      'Well caught!',
      'Precisely right.',
      'Just so!',
      'You found it.',
      'A perfect landing.',
      'Marvellous!',
    ]);
    expect(new Set(QUIPS).size).toBe(QUIPS.length);
    for (const line of QUIPS) {
      expect(line.split(' ').length, line).toBeLessThanOrEqual(5);
      expect(line, line).toMatch(/[.!]$/);
      expect(line, line).not.toMatch(/—/);
    }
  });
});

describe('GET /api/voice/quips/:guide', () => {
  it('lists each line and where its audio is', async () => {
    const { app, upstream } = await setup();
    const response = await request(app).get('/api/voice/quips/sylvi').set('Host', HOST);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      guideName: 'Sylvi',
      quips: QUIPS.map((text, n) => ({ text, audioUrl: `/api/voice/quips/sylvi/${n}` })),
    });
    // Listing records nothing.
    expect(upstream.ttsRequests()).toHaveLength(0);
  });

  it("records a line in the guide's own voice once, then serves it from memory", async () => {
    const { app, upstream } = await setup();
    const first = await audio(request(app).get('/api/voice/quips/rollo/3').set('Host', HOST));
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(first.body.toString()).toBe(`mp3:${QUIPS[3].length}`);
    await audio(request(app).get('/api/voice/quips/rollo/3').set('Host', HOST));
    const requests = upstream.ttsRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('/v1/text-to-speech/voice_rollo_test/');
    expect(JSON.parse(requests[0].init.body).text).toBe(QUIPS[3]);
  });

  it('refuses an unknown guide or line, and other hosts, without calling ElevenLabs', async () => {
    const { app, upstream } = await setup();
    expect((await request(app).get('/api/voice/quips/specimen').set('Host', HOST)).status).toBe(400);
    expect((await request(app).get(`/api/voice/quips/sylvi/${QUIPS.length}`).set('Host', HOST)).status).toBe(400);
    expect((await request(app).get('/api/voice/quips/sylvi/one').set('Host', HOST)).status).toBe(400);
    expect((await request(app).get('/api/voice/quips/sylvi').set('Host', 'evil.example')).status).toBe(403);
    expect(upstream.ttsRequests()).toHaveLength(0);
  });

  it('are recorded with the welcomes as the server starts', async () => {
    const { upstream } = await setup({ warmWelcomes: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const quipTexts = upstream
      .ttsRequests()
      .map(({ url, init }) => `${url.match(/text-to-speech\/([^/]+)\//)[1]} ${JSON.parse(init.body).text}`)
      .filter((line) => QUIPS.some((quip) => line.endsWith(` ${quip}`)))
      .sort();
    const expected = ['voice_rollo_test', 'voice_sylvi_test'].flatMap((voice) => QUIPS.map((quip) => `${voice} ${quip}`)).sort();
    expect(quipTexts).toEqual(expected);
  });

  it("never counts against anyone's voice minutes", async () => {
    const { app, upstream } = await setup();
    await audio(request(app).get('/api/voice/quips/sylvi/0').set('Host', HOST));
    expect(upstream.tokenRequests()).toHaveLength(0);
  });
});
