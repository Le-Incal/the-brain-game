/**
 * Brain Game server: serves the built game and, when configured, the voice
 * routes. Voice failing in any way (missing variables, ElevenLabs down, the
 * budget spent) leaves the game serving as before.
 *
 *   GET  /api/voice/status              { available, reason?, remainingSeconds?, resetsInSeconds? }
 *   POST /api/voice/token               { guide } -> conversation token + signed reservation
 *   POST /api/voice/webhook/elevenlabs  post-call webhook: settles a reservation
 */
import path from 'node:path';
import express from 'express';
import { readVoiceConfig } from './config.js';
import { createMinuteLedger, MIN_RESERVATION_SECONDS } from './ledger.js';
import { createRateLimiter, TOKEN_RATE_LIMIT } from './rateLimit.js';
import { randomId, signDevice, signReservation, verifyDevice, verifyReservation } from './signing.js';
import { verifyElevenLabsSignature } from './webhook.js';
import { fetchConversation, fetchConversationToken, fetchConversationsSince } from './elevenlabs.js';

export const RESTORE_RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];
// A reservation still open this long (token window, plus the 8-minute session
// cap, plus margin) is looked up: unused ones are refunded, used ones settled.
export const RESERVATION_EXPIRY_MS = 30 * 60 * 1000;
export const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
// Re-read today's real total from ElevenLabs, which bills us.
export const RECONCILE_INTERVAL_MS = 10 * 60 * 1000;
const MAX_OPEN_PER_DEVICE = 1;
const MAX_OPEN_PER_ADDRESS = 2;

const DEVICE_COOKIE = 'bg_device';
const DEVICE_COOKIE_MAX_AGE_SECS = 365 * 24 * 60 * 60;
const GUIDE_NAMES = { rollo: 'Rollo', sylvi: 'Sylvi' };

function requestHost(req) {
  const forwarded = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim();
  return String(forwarded || req.headers.host || '').split(':')[0].trim().toLowerCase();
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

export function createApp({
  env = process.env,
  distDir = path.resolve('dist'),
  fetchImpl = globalThis.fetch,
  now = Date.now,
  setTimeoutImpl = setTimeout,
  setIntervalImpl = setInterval,
} = {}) {
  const config = readVoiceConfig(env);
  const app = express();
  app.disable('x-powered-by');
  // Railway's edge always overwrites X-Real-IP with the client's address,
  // while X-Forwarded-For keeps whatever the client sent (Railway staff, May
  // 2026). Railway sets RAILWAY_ENVIRONMENT_ID on every deployment; off
  // Railway nothing overwrites the header, so use the direct connection.
  const onRailway = Boolean(env.RAILWAY_ENVIRONMENT_ID);
  const clientAddress = (req) =>
    (onRailway && req.get('x-real-ip')?.trim()) || req.socket.remoteAddress || 'unknown';

  const ledger = config.available
    ? createMinuteLedger({
        sessionMaxSeconds: config.sessionMaxSeconds,
        dailyMaxSeconds: config.dailyMaxSeconds,
        globalDailyMaxSeconds: config.globalDailyMaxSeconds,
        maxOpenPerDevice: MAX_OPEN_PER_DEVICE,
        maxOpenPerAddress: MAX_OPEN_PER_ADDRESS,
        maxOpenTotal: config.maxOpenReservations,
        now,
      })
    : null;
  const tokenLimiter = createRateLimiter({ ...TOKEN_RATE_LIMIT, now });

  const todaysMidnightSecs = () => {
    const current = new Date(now());
    return Math.floor(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()) / 1000);
  };

  const voice = {
    ledger,
    restored: false,
    ready: null,
    lastAttempt: Promise.resolve(false),
    sweep: () => Promise.resolve(),
    reconcile: () => Promise.resolve(),
  };
  let markReady;
  voice.ready = new Promise((resolve) => {
    markReady = resolve;
  });
  app.locals.voice = voice;

  if (!config.available) {
    if (config.missing.length || config.invalid.length) {
      console.warn(
        `[voice] unavailable. Missing: ${config.missing.join(', ') || 'none'}. Invalid: ${config.invalid.join(', ') || 'none'}.`
      );
    }
    markReady();
  } else {
    restoreToday(0);
    voice.sweep = sweepStaleReservations;
    voice.reconcile = reconcileWithElevenLabs;
    for (const [task, interval] of [
      [sweepStaleReservations, SWEEP_INTERVAL_MS],
      [reconcileWithElevenLabs, RECONCILE_INTERVAL_MS],
    ]) {
      const timer = setIntervalImpl(() => {
        task().catch((error) => console.warn(`[voice] ${error.message}`));
      }, interval);
      timer?.unref?.();
    }
  }

  async function sweepStaleReservations() {
    for (const { reservationId, conversationId } of ledger.openReservationsOlderThan(RESERVATION_EXPIRY_MS)) {
      if (!conversationId) {
        ledger.expire(reservationId);
        continue;
      }
      try {
        const record = await fetchConversation({ fetchImpl, apiKey: config.apiKey, conversationId });
        if (!record || record.status === 'initiated') ledger.expire(reservationId);
        else if (record.status === 'done' || record.status === 'failed') {
          ledger.settle(reservationId, { durationSecs: record.durationSecs, conversationId });
        }
        // Still running: leave it open for the next sweep.
      } catch (error) {
        console.warn(`[voice] sweep could not check a conversation (${error.message}); retrying next sweep`);
      }
    }
  }

  async function reconcileWithElevenLabs() {
    if (!voice.restored) return;
    const conversations = await fetchConversationsSince({
      fetchImpl,
      apiKey: config.apiKey,
      agentId: config.agentId,
      sinceSecs: todaysMidnightSecs(),
    });
    ledger.restore(conversations);
  }

  // Today's global usage lives in ElevenLabs' records (it bills us), so a
  // restart rebuilds it from there instead of starting the budget at zero.
  function restoreToday(attempt) {
    voice.lastAttempt = (async () => {
      try {
        const conversations = await fetchConversationsSince({
          fetchImpl,
          apiKey: config.apiKey,
          agentId: config.agentId,
          sinceSecs: todaysMidnightSecs(),
        });
        ledger.restore(conversations);
        voice.restored = true;
        markReady();
        return true;
      } catch (error) {
        const delay = RESTORE_RETRY_DELAYS_MS[Math.min(attempt, RESTORE_RETRY_DELAYS_MS.length - 1)];
        console.warn(`[voice] could not rebuild today's usage (${error.message}); retrying in ${delay / 1000}s`);
        const timer = setTimeoutImpl(() => restoreToday(attempt + 1), delay);
        timer?.unref?.();
        return false;
      }
    })();
  }

  const hostAllowed = (host) =>
    config.hosts.includes(host) || (!config.production && (host === 'localhost' || host === '127.0.0.1'));

  /** Gate shared by the voice routes; answers and returns false when voice is off. */
  function voiceGate(req, res, { onRefuse = 503 } = {}) {
    if (!config.available) {
      res.status(503).json({ available: false, reason: 'not_configured' });
      return false;
    }
    if (!hostAllowed(requestHost(req))) {
      res.status(onRefuse).json({ available: false, reason: 'host' });
      return false;
    }
    return true;
  }

  function ensureDevice(req, res) {
    const host = requestHost(req);
    const existing = verifyDevice(readCookie(req, DEVICE_COOKIE), config.sessionSecret, host);
    if (existing) return existing;
    const id = randomId();
    const value = signDevice({ id, host, issuedAt: Math.floor(now() / 1000) }, config.sessionSecret);
    const attributes = [`Path=/`, `Max-Age=${DEVICE_COOKIE_MAX_AGE_SECS}`, 'HttpOnly', 'SameSite=Lax'];
    if (config.production) attributes.push('Secure');
    res.append('Set-Cookie', `${DEVICE_COOKIE}=${encodeURIComponent(value)}; ${attributes.join('; ')}`);
    return id;
  }

  function capRefusal(deviceId) {
    if (ledger.globalRemaining() < MIN_RESERVATION_SECONDS) {
      return { status: 503, body: { available: false, reason: 'global_budget', resetsInSeconds: ledger.secondsUntilReset() } };
    }
    if (ledger.deviceRemaining(deviceId) < MIN_RESERVATION_SECONDS) {
      return { status: 429, body: { available: false, reason: 'device_daily_cap', resetsInSeconds: ledger.secondsUntilReset() } };
    }
    return null;
  }

  app.get('/api/voice/status', (req, res) => {
    if (!config.available) return res.json({ available: false, reason: 'not_configured' });
    if (!hostAllowed(requestHost(req))) return res.json({ available: false, reason: 'host' });
    if (!voice.restored) return res.json({ available: false, reason: 'restoring' });
    const deviceId = ensureDevice(req, res);
    const refusal = capRefusal(deviceId);
    if (refusal) return res.json(refusal.body);
    return res.json({ available: true, remainingSeconds: ledger.deviceRemaining(deviceId) });
  });

  app.post('/api/voice/token', express.json({ limit: '2kb' }), async (req, res) => {
    if (!voiceGate(req, res, { onRefuse: 403 })) return;
    const limit = tokenLimiter.take(clientAddress(req));
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSeconds));
      return res.status(429).json({ available: false, reason: 'rate_limited' });
    }
    const deviceId = ensureDevice(req, res);
    const guide = typeof req.body?.guide === 'string' ? req.body.guide.trim().toLowerCase() : null;
    if (!GUIDE_NAMES[guide]) return res.status(400).json({ error: 'unknown_guide' });
    if (!voice.restored) return res.status(503).json({ available: false, reason: 'restoring' });

    const reservation = ledger.reserve(deviceId, { address: clientAddress(req) });
    if (!reservation.ok) {
      if (reservation.reason === 'busy') return res.status(429).json({ available: false, reason: 'busy' });
      const refusal = capRefusal(deviceId);
      return res.status(refusal.status).json(refusal.body);
    }
    try {
      const { token: conversationToken, conversationId } = await fetchConversationToken({
        fetchImpl,
        apiKey: config.apiKey,
        agentId: config.agentId,
      });
      // Server-side matching: webhooks find their reservation by this id, so
      // nothing the browser reports is trusted. The id never goes to the browser.
      ledger.attachConversation(reservation.reservationId, conversationId);
      const guideName = GUIDE_NAMES[guide];
      return res.json({
        conversationToken,
        guideName,
        voiceId: config.voices[guide],
        maxSeconds: reservation.seconds,
        dynamicVariables: {
          guide_name: guideName,
          reservation: signReservation(reservation.reservationId, config.sessionSecret),
        },
      });
    } catch (error) {
      // No conversation can start, so nothing is owed: refund in full.
      ledger.release(reservation.reservationId);
      console.warn(`[voice] token mint failed: ${error.message}`);
      return res.status(502).json({ available: false, reason: 'upstream' });
    }
  });

  // A conversation that failed to start: refund now rather than at the sweep,
  // but only once ElevenLabs confirms it never started. A late conversation
  // is still charged (the reservation expires rather than closing).
  app.post('/api/voice/release', express.json({ limit: '2kb' }), async (req, res) => {
    if (!voiceGate(req, res, { onRefuse: 403 })) return;
    const reservationId = verifyReservation(req.body?.reservation, config.sessionSecret);
    if (!reservationId) return res.status(400).json({ error: 'invalid_reservation' });
    const info = ledger.reservationInfo(reservationId);
    if (!info) return res.status(404).json({ error: 'unknown_reservation' });
    const deviceId = verifyDevice(readCookie(req, DEVICE_COOKIE), config.sessionSecret, requestHost(req));
    if (!deviceId || deviceId !== info.deviceId) return res.status(403).json({ error: 'not_your_reservation' });
    if (info.state !== 'open') return res.status(200).json({ status: 'already_closed' });
    try {
      const record = info.conversationId
        ? await fetchConversation({ fetchImpl, apiKey: config.apiKey, conversationId: info.conversationId })
        : null;
      if (record && record.status !== 'initiated') return res.status(409).json({ status: 'started' });
      ledger.expire(reservationId);
      return res.status(200).json({ status: 'released' });
    } catch (error) {
      console.warn(`[voice] release could not check the conversation (${error.message})`);
      return res.status(503).json({ error: 'upstream' });
    }
  });

  app.post('/api/voice/webhook/elevenlabs', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
    if (!config.available || !config.refundsEnabled) {
      return res.status(503).json({ error: 'webhook_not_configured' });
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const verified = verifyElevenLabsSignature({
      rawBody,
      header: req.get('elevenlabs-signature'),
      secret: config.webhookSecret,
      now,
    });
    if (!verified.ok) return res.status(401).json({ error: 'invalid_signature' });

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(200).json({ status: 'ignored' });
    }
    const data = event?.data ?? {};
    const reservationId =
      verifyReservation(data.conversation_initiation_client_data?.dynamic_variables?.reservation, config.sessionSecret) ??
      ledger.reservationForConversation(data.conversation_id);
    if (event?.type !== 'post_call_transcription' || data.agent_id !== config.agentId || !reservationId) {
      return res.status(200).json({ status: 'ignored' });
    }
    const report = { durationSecs: data.metadata?.call_duration_secs, conversationId: data.conversation_id };
    const settled = ledger.settle(reservationId, report);
    if (settled !== 'unknown') return res.status(200).json({ status: settled });
    return res.status(200).json({ status: ledger.chargeUnreserved(report) });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  app.use(express.static(distDir, { index: 'index.html' }));
  // Unknown app routes get the game; a missing file (it has an extension) is a 404.
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || path.extname(req.path)) return next();
    return res.sendFile(path.join(distDir, 'index.html'));
  });

  return app;
}
