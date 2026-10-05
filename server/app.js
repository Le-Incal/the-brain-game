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
import { fetchConversationToken, fetchConversationsSince } from './elevenlabs.js';

export const RESTORE_RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];

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
} = {}) {
  const config = readVoiceConfig(env);
  const app = express();
  // Railway terminates TLS at one proxy hop; req.ip is the address it saw.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const ledger = config.available
    ? createMinuteLedger({
        sessionMaxSeconds: config.sessionMaxSeconds,
        dailyMaxSeconds: config.dailyMaxSeconds,
        globalDailyMaxSeconds: config.globalDailyMaxSeconds,
        now,
      })
    : null;
  const tokenLimiter = createRateLimiter({ ...TOKEN_RATE_LIMIT, now });

  const voice = { ledger, restored: false, ready: null, lastAttempt: Promise.resolve(false) };
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
  }

  // Today's global usage lives in ElevenLabs' records (it bills us), so a
  // restart rebuilds it from there instead of starting the budget at zero.
  function restoreToday(attempt) {
    voice.lastAttempt = (async () => {
      try {
        const current = now();
        const midnight = Date.UTC(
          new Date(current).getUTCFullYear(),
          new Date(current).getUTCMonth(),
          new Date(current).getUTCDate()
        );
        const conversations = await fetchConversationsSince({
          fetchImpl,
          apiKey: config.apiKey,
          agentId: config.agentId,
          sinceSecs: Math.floor(midnight / 1000),
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
    const limit = tokenLimiter.take(req.ip);
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSeconds));
      return res.status(429).json({ available: false, reason: 'rate_limited' });
    }
    const deviceId = ensureDevice(req, res);
    const guide = typeof req.body?.guide === 'string' ? req.body.guide.trim().toLowerCase() : null;
    if (!GUIDE_NAMES[guide]) return res.status(400).json({ error: 'unknown_guide' });
    if (!voice.restored) return res.status(503).json({ available: false, reason: 'restoring' });

    const reservation = ledger.reserve(deviceId);
    if (!reservation.ok) {
      const refusal = capRefusal(deviceId);
      return res.status(refusal.status).json(refusal.body);
    }
    try {
      const conversationToken = await fetchConversationToken({
        fetchImpl,
        apiKey: config.apiKey,
        agentId: config.agentId,
      });
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
    const reservationId = verifyReservation(
      data.conversation_initiation_client_data?.dynamic_variables?.reservation,
      config.sessionSecret
    );
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
