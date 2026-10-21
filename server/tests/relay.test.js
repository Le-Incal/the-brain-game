import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { WebSocket, WebSocketServer } from 'ws';
import { HOST, SECRETS, cookieFrom, startApp } from './helpers.js';

// Kyle, 2026-10-20/21: on a network that blocks WebRTC (UDP), Sylvi's audio
// link never opened. The conversation now carries on over a WebSocket that
// our server relays to ElevenLabs, so the agent id and the signature in
// ElevenLabs' signed address never reach the browser ("Relay through our
// server").

const appModule = await import('../app.js').catch(() => ({}));
const { createApp } = appModule;

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fakeElevenLabsSocket() {
  const connections = [];
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', handleProtocols: (protocols) => (protocols.has('convai') ? 'convai' : false) });
  await new Promise((resolve) => wss.once('listening', resolve));
  wss.on('connection', (socket, req) => {
    const entry = { socket, url: req.url, protocol: socket.protocol, origin: req.headers.origin, received: [] };
    socket.on('message', (data) => entry.received.push(String(data)));
    connections.push(entry);
  });
  cleanups.push(() => new Promise((resolve) => wss.close(() => resolve())));
  const { port } = wss.address();
  return {
    connections,
    signedUrl: `ws://127.0.0.1:${port}/v1/convai/conversation?agent_id=${SECRETS.ELEVENLABS_AGENT_ID}&conversation_signature=sig_never_leaks`,
  };
}

async function setup() {
  const elevenLabs = await fakeElevenLabsSocket();
  const lines = [];
  const started = await startApp({
    createApp,
    elevenLabs: { signedUrl: elevenLabs.signedUrl },
    logger: { info: (line) => lines.push(line), warn: (line) => lines.push(line) },
  });
  const server = http.createServer(started.app);
  server.on('upgrade', (req, socket, head) => {
    if (!started.app.voiceRelay?.handleUpgrade(req, socket, head)) socket.destroy();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => {
    started.app.voiceRelay?.close();
    return new Promise((resolve) => server.close(() => resolve()));
  });
  return { ...started, elevenLabs, port: server.address().port, lines };
}

const mint = (app, { cookie, transport = 'websocket' } = {}) => {
  const req = request(app).post('/api/voice/token').set('Host', HOST);
  if (cookie) req.set('Cookie', cookie);
  return req.send({ guide: 'sylvi', transport });
};

function connect(port, path, { cookie, host = HOST } = {}) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, ['convai'], {
    headers: { Host: host, ...(cookie ? { Cookie: cookie } : {}) },
    origin: `https://${HOST}`,
  });
  cleanups.push(() => socket.terminate());
  return socket;
}

const opened = (socket) =>
  new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('unexpected-response', (_, res) => reject(new Error(`status ${res.statusCode}`)));
    socket.once('error', reject);
  });
const refusedWith = (socket) =>
  new Promise((resolve) => {
    socket.once('unexpected-response', (_, res) => resolve(res.statusCode));
    socket.once('open', () => resolve('opened'));
    socket.once('error', () => resolve('error'));
  });
const nextMessage = (socket) => new Promise((resolve) => socket.once('message', (data) => resolve(String(data))));
const until = async (check, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('A relay ticket instead of a WebRTC token', () => {
  it('mints a one-time relay path; the signed address, signature and agent id stay on the server', async () => {
    const { app, upstream } = await setup();
    const response = await mint(app);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      relayPath: expect.stringMatching(/^\/api\/voice\/relay\?ticket=[A-Za-z0-9_-]{32,}$/),
      guideName: 'Sylvi',
      voiceId: 'voice_sylvi_test',
      maxSeconds: 480,
      dynamicVariables: { guide_name: 'Sylvi', reservation: expect.stringMatching(/^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/) },
    });
    const text = JSON.stringify({ headers: response.headers, body: response.body });
    for (const secret of [SECRETS.ELEVENLABS_AGENT_ID, SECRETS.ELEVENLABS_API_KEY, 'sig_never_leaks', 'conversation_signature']) {
      expect(text.includes(secret), secret).toBe(false);
    }
    const [{ url, init }] = upstream.signedUrlRequests();
    expect(url).toBe(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${SECRETS.ELEVENLABS_AGENT_ID}`);
    expect(init.headers['xi-api-key']).toBe(SECRETS.ELEVENLABS_API_KEY);
    expect(upstream.tokenRequests()).toHaveLength(0);
  });

  it('still mints a WebRTC token when asked for one', async () => {
    const { app, upstream } = await setup();
    const response = await mint(app, { transport: 'webrtc' });
    expect(response.body.conversationToken).toBe('conv_token_abc');
    expect(upstream.signedUrlRequests()).toHaveLength(0);
  });
});

describe('The relay', () => {
  it("carries the conversation both ways, under ElevenLabs' convai protocol, to the signed address", async () => {
    const { app, port, elevenLabs } = await setup();
    const minted = await mint(app);
    const socket = connect(port, `${minted.body.relayPath}&source=js_sdk&version=1.0.0`, { cookie: cookieFrom(minted) });
    await opened(socket);
    expect(socket.protocol).toBe('convai');
    await until(() => elevenLabs.connections.length === 1);
    const [upstream] = elevenLabs.connections;
    expect(upstream.protocol).toBe('convai');
    // ElevenLabs sees the page the visitor is on, as it would without the relay.
    expect(upstream.origin).toBe(`https://${HOST}`);
    const target = new URL(upstream.url, 'ws://x');
    expect(target.searchParams.get('agent_id')).toBe(SECRETS.ELEVENLABS_AGENT_ID);
    expect(target.searchParams.get('conversation_signature')).toBe('sig_never_leaks');
    expect(target.searchParams.get('source')).toBe('js_sdk');
    expect(target.searchParams.get('version')).toBe('1.0.0');
    expect(target.searchParams.get('ticket')).toBeNull();

    socket.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
    await until(() => upstream.received.length === 1);
    expect(JSON.parse(upstream.received[0])).toEqual({ type: 'conversation_initiation_client_data' });

    const reply = nextMessage(socket);
    upstream.socket.send(JSON.stringify({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } }));
    expect(JSON.parse(await reply)).toEqual({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } });
  });

  it("learns the conversation id from ElevenLabs' first message, on the server", async () => {
    const { app, port, elevenLabs } = await setup();
    const minted = await mint(app);
    const socket = connect(port, minted.body.relayPath, { cookie: cookieFrom(minted) });
    await opened(socket);
    await until(() => elevenLabs.connections.length === 1);
    const forwarded = nextMessage(socket);
    elevenLabs.connections[0].socket.send(
      JSON.stringify({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'conv_ws_1', agent_output_audio_format: 'pcm_16000' } })
    );
    expect(JSON.parse(await forwarded).type).toBe('conversation_initiation_metadata');
    expect(app.locals.voice.ledger.reservationForConversation('conv_ws_1')).toBeTruthy();
  });

  it('takes each ticket once, and only from the browser it was issued to', async () => {
    const { app, port } = await setup();
    const minted = await mint(app);
    const cookie = cookieFrom(minted);
    const other = cookieFrom(await mint(app));
    expect(await refusedWith(connect(port, minted.body.relayPath, { cookie: other }))).toBe(403);
    expect(await refusedWith(connect(port, minted.body.relayPath))).toBe(403);
    await opened(connect(port, minted.body.relayPath, { cookie }));
    expect(await refusedWith(connect(port, minted.body.relayPath, { cookie }))).toBe(401);
    expect(await refusedWith(connect(port, '/api/voice/relay?ticket=made_up_ticket_made_up_ticket_00', { cookie }))).toBe(401);
  });

  it('lets a ticket lapse after a minute', async () => {
    const { app, port, clock } = await setup();
    const minted = await mint(app);
    clock.advance(61_000);
    expect(await refusedWith(connect(port, minted.body.relayPath, { cookie: cookieFrom(minted) }))).toBe(401);
  });

  it('closes the visitor\'s side when ElevenLabs closes, and ElevenLabs\' side when the visitor leaves', async () => {
    const { app, port, elevenLabs } = await setup();
    const first = await mint(app);
    const socket = connect(port, first.body.relayPath, { cookie: cookieFrom(first) });
    await opened(socket);
    await until(() => elevenLabs.connections.length === 1);
    const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
    elevenLabs.connections[0].socket.close(1000, 'done');
    expect(await closed).toBe(1000);

    // One open conversation per browser: the second is another visitor's.
    const second = await mint(app);
    const leaving = connect(port, second.body.relayPath, { cookie: cookieFrom(second) });
    await opened(leaving);
    await until(() => elevenLabs.connections.length === 2);
    const upstreamClosed = new Promise((resolve) => elevenLabs.connections[1].socket.once('close', resolve));
    leaving.close(1000, 'User ended conversation');
    await upstreamClosed;
  });

  it('is started by the real server', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    expect(source).toMatch(/server\.on\('upgrade', \(req, socket, head\) => \{\s*if \(!app\.voiceRelay\?\.handleUpgrade\(req, socket, head\)\) socket\.destroy\(\);/);
  });
});
