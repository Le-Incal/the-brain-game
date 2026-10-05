/**
 * Minute accounting: reserve, then refund.
 *
 * Minting a conversation token reserves the session cap (or what the device
 * has left) against the device's daily cap and the global daily budget. The
 * ElevenLabs post-call webhook settles each reservation to the real duration.
 * No report means no refund, so the ledger can only undercount what is left.
 * Days run on UTC. Everything is in memory; after a restart the global total
 * is rebuilt from ElevenLabs' history (restore) and devices start fresh.
 */
import { randomId } from './signing.js';

export const MIN_RESERVATION_SECONDS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Statuses of a conversation that may still be running: charge the full cap.
const LIVE_STATUSES = new Set(['initiated', 'in-progress', 'processing']);

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export function createMinuteLedger({ sessionMaxSeconds, dailyMaxSeconds, globalDailyMaxSeconds, now = Date.now }) {
  const days = new Map();
  const reservations = new Map();
  const countedConversations = new Set();

  function day(key = dayKey(now())) {
    if (!days.has(key)) days.set(key, { global: 0, devices: new Map() });
    return days.get(key);
  }

  function charge(key, deviceId, seconds) {
    const entry = day(key);
    entry.global = Math.max(0, entry.global + seconds);
    if (deviceId) entry.devices.set(deviceId, Math.max(0, (entry.devices.get(deviceId) ?? 0) + seconds));
  }

  const capToSession = (seconds) => Math.min(sessionMaxSeconds, Math.max(0, Math.round(Number(seconds) || 0)));

  function prune() {
    const keep = new Set([dayKey(now()), dayKey(now() - DAY_MS)]);
    for (const key of days.keys()) if (!keep.has(key)) days.delete(key);
    for (const [id, reservation] of reservations) if (!keep.has(reservation.day)) reservations.delete(id);
  }

  const deviceRemaining = (deviceId) => Math.max(0, dailyMaxSeconds - (day().devices.get(deviceId) ?? 0));
  const globalRemaining = () => Math.max(0, globalDailyMaxSeconds - day().global);

  return {
    deviceRemaining,
    globalRemaining,

    secondsUntilReset() {
      const current = now();
      const nextMidnight = Date.UTC(
        new Date(current).getUTCFullYear(),
        new Date(current).getUTCMonth(),
        new Date(current).getUTCDate() + 1
      );
      return Math.ceil((nextMidnight - current) / 1000);
    },

    reserve(deviceId) {
      prune();
      const globalLeft = globalRemaining();
      if (globalLeft < MIN_RESERVATION_SECONDS) return { ok: false, reason: 'global_budget' };
      const deviceLeft = deviceRemaining(deviceId);
      if (deviceLeft < MIN_RESERVATION_SECONDS) return { ok: false, reason: 'device_daily_cap' };
      const seconds = Math.min(sessionMaxSeconds, deviceLeft, globalLeft);
      const reservationId = randomId();
      const key = dayKey(now());
      reservations.set(reservationId, { deviceId, day: key, seconds, settled: false });
      charge(key, deviceId, seconds);
      return { ok: true, reservationId, seconds };
    },

    /** The conversation never started (token minting failed): refund in full. */
    release(reservationId) {
      const reservation = reservations.get(reservationId);
      if (!reservation || reservation.settled) return;
      reservation.settled = true;
      charge(reservation.day, reservation.deviceId, -reservation.seconds);
    },

    /** Charge the real duration (capped at the session cap) instead of the reservation. */
    settle(reservationId, { durationSecs, conversationId }) {
      const reservation = reservations.get(reservationId);
      if (!reservation) return 'unknown';
      if (reservation.settled || countedConversations.has(conversationId)) return 'duplicate';
      reservation.settled = true;
      countedConversations.add(conversationId);
      charge(reservation.day, reservation.deviceId, capToSession(durationSecs) - reservation.seconds);
      return 'settled';
    },

    /** A valid reservation this process no longer remembers (minted before a restart). */
    chargeUnreserved({ conversationId, durationSecs }) {
      if (countedConversations.has(conversationId)) return 'duplicate';
      countedConversations.add(conversationId);
      charge(dayKey(now()), null, capToSession(durationSecs));
      return 'charged';
    },

    /** Rebuild today's global total from ElevenLabs' conversation history. */
    restore(conversations) {
      for (const { conversationId, durationSecs, status } of conversations) {
        if (countedConversations.has(conversationId)) continue;
        countedConversations.add(conversationId);
        charge(dayKey(now()), null, LIVE_STATUSES.has(status) ? sessionMaxSeconds : capToSession(durationSecs));
      }
    },
  };
}
