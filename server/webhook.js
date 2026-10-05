/**
 * ElevenLabs post-call webhook verification. Scheme taken from the official
 * ElevenLabs JS SDK (webhooks.constructEvent): header
 * `elevenlabs-signature: t=<unix secs>,v0=<hex HMAC-SHA256 of "<t>.<raw body>">`,
 * rejected when older than 30 minutes. We also reject timestamps from the
 * future and compare in constant time.
 */
import crypto from 'node:crypto';

const MAX_AGE_SECS = 30 * 60;
const MAX_CLOCK_SKEW_SECS = 5 * 60;

export function verifyElevenLabsSignature({ rawBody, header, secret, now = Date.now }) {
  if (!secret) return { ok: false, reason: 'no_secret' };
  if (typeof header !== 'string' || !header) return { ok: false, reason: 'missing_signature' };
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    })
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v0) return { ok: false, reason: 'malformed_signature' };

  const nowSecs = Math.floor(now() / 1000);
  if (nowSecs - timestamp > MAX_AGE_SECS || timestamp - nowSecs > MAX_CLOCK_SKEW_SECS) {
    return { ok: false, reason: 'stale_signature' };
  }
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const given = Buffer.from(parts.v0);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}
