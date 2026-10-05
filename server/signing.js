/** HMAC signing for the device cookie and reservation codes. */
import crypto from 'node:crypto';

export function hmac(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64url');
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export const randomId = () => crypto.randomBytes(18).toString('base64url');

/** `<id>.<HMAC>`: the server can tell its own reservation codes from forgeries. */
export function signReservation(id, secret) {
  return `${id}.${hmac(secret, `reservation:${id}`)}`;
}

export function verifyReservation(code, secret) {
  if (typeof code !== 'string') return null;
  const [id, signature, extra] = code.split('.');
  if (!id || !signature || extra !== undefined) return null;
  return safeEqual(signature, hmac(secret, `reservation:${id}`)) ? id : null;
}

/** Anonymous device cookie: a random id bound to the host, nothing else. */
export function signDevice({ id, host, issuedAt }, secret) {
  const payload = Buffer.from(JSON.stringify({ id, host, iat: issuedAt })).toString('base64url');
  return `${payload}.${hmac(secret, `device:${payload}`)}`;
}

export function verifyDevice(value, secret, host) {
  if (typeof value !== 'string') return null;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  if (!safeEqual(signature, hmac(secret, `device:${payload}`))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.host === host && typeof decoded.id === 'string' ? decoded.id : null;
  } catch {
    return null;
  }
}
