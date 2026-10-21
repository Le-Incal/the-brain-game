/**
 * The voice relay (Kyle, 2026-10-21): on networks that block WebRTC, the
 * browser talks to ElevenLabs over a WebSocket that passes through our server,
 * so ElevenLabs' signed address (the agent id and its signature) never leaves
 * it. The token route issues a one-time ticket; the browser opens
 * /api/voice/relay?ticket=... under the "convai" protocol; we open the signed
 * address and pass every frame both ways, reading only ElevenLabs' first
 * message for the conversation id.
 */
import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

export const RELAY_PATH = '/api/voice/relay';
export const RELAY_PROTOCOL = 'convai';
// The browser opens the relay as soon as the ticket arrives; a minute is plenty.
export const TICKET_TTL_MS = 60_000;
// Audio arrives in small base64 chunks; this bounds a single frame.
export const MAX_FRAME_BYTES = 2 * 1024 * 1024;
// What the SDK adds to the address it is given, passed on to ElevenLabs.
const FORWARDED_PARAMS = ['source', 'version'];

// Codes a WebSocket may send; others (1005, 1006, 1015) are only ever received.
function sendableCode(code) {
  return (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999) ? code : 1000;
}

function refuse(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function createVoiceRelay({
  now = Date.now,
  logger = { info: () => {}, warn: () => {} },
  // Whether this upgrade request comes from the browser the ticket was issued to.
  authorize = () => false,
  // ElevenLabs named the conversation: the ledger can match it from now on.
  onConversation = () => {},
  // ElevenLabs sees the visitor's page as its origin, as it would without the relay.
  openUpstream = (url, protocols, { origin } = {}) =>
    new WebSocket(url, protocols, { maxPayload: MAX_FRAME_BYTES, ...(origin ? { origin } : {}) }),
} = {}) {
  const tickets = new Map();
  const live = new Set();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_FRAME_BYTES,
    handleProtocols: (protocols) => (protocols.has(RELAY_PROTOCOL) ? RELAY_PROTOCOL : false),
  });

  function sweep() {
    const time = now();
    for (const [ticket, entry] of tickets) if (entry.expiresAt <= time) tickets.delete(ticket);
  }

  function pipe(client, target, entry, origin) {
    const upstream = openUpstream(target, [RELAY_PROTOCOL], { origin });
    const pending = [];
    let named = false;
    const pair = { client, upstream };
    live.add(pair);
    const closeBoth = (code, reason) => {
      live.delete(pair);
      const sendable = sendableCode(code);
      const why = String(reason ?? '').slice(0, 120);
      for (const socket of [client, upstream]) {
        if (socket.readyState === WebSocket.OPEN) socket.close(sendable, why);
        else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      }
    };

    client.on('message', (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else pending.push([data, isBinary]);
    });
    upstream.on('open', () => {
      for (const [data, isBinary] of pending.splice(0)) upstream.send(data, { binary: isBinary });
    });
    upstream.on('message', (data, isBinary) => {
      if (!named && !isBinary) {
        named = true;
        try {
          const message = JSON.parse(String(data));
          const id = message?.conversation_initiation_metadata_event?.conversation_id;
          if (message?.type === 'conversation_initiation_metadata' && typeof id === 'string' && id) {
            onConversation(entry.reservationId, id);
          }
        } catch {
          // Not JSON: pass it on all the same.
        }
      }
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    client.on('close', (code, reason) => closeBoth(code, reason));
    upstream.on('close', (code, reason) => closeBoth(code, reason));
    client.on('error', () => closeBoth(1011, 'relay error'));
    upstream.on('error', (error) => {
      logger.warn(`[voice] relay could not reach ElevenLabs (${error.message})`);
      closeBoth(1011, 'upstream error');
    });
  }

  return {
    /** A one-time ticket for this reservation's signed address. */
    issue({ signedUrl, reservationId, deviceId }) {
      sweep();
      const ticket = crypto.randomBytes(24).toString('base64url');
      tickets.set(ticket, { signedUrl, reservationId, deviceId, expiresAt: now() + TICKET_TTL_MS });
      return `${RELAY_PATH}?ticket=${ticket}`;
    },

    /** Handles an upgrade on the relay's path; returns false for any other path. */
    handleUpgrade(req, socket, head) {
      let url;
      try {
        url = new URL(req.url ?? '', 'http://relay.local');
      } catch {
        return false;
      }
      if (url.pathname !== RELAY_PATH) return false;
      sweep();
      const ticket = url.searchParams.get('ticket') ?? '';
      const entry = tickets.get(ticket);
      if (!entry) {
        logger.info('[voice] relay refused: no such ticket');
        refuse(socket, 401, 'Unauthorized');
        return true;
      }
      if (!authorize(req, entry)) {
        logger.info('[voice] relay refused: another browser');
        refuse(socket, 403, 'Forbidden');
        return true;
      }
      tickets.delete(ticket);
      const target = new URL(entry.signedUrl);
      for (const name of FORWARDED_PARAMS) {
        const value = url.searchParams.get(name);
        if (value) target.searchParams.set(name, value.slice(0, 64));
      }
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin.slice(0, 200) : undefined;
      wss.handleUpgrade(req, socket, head, (client) => pipe(client, target.toString(), entry, origin));
      return true;
    },

    close() {
      tickets.clear();
      for (const { client, upstream } of live) {
        client.terminate();
        upstream.terminate();
      }
      live.clear();
      wss.close();
    },
  };
}
