/**
 * Minute accounting: reserve, then refund.
 *
 * Minting a conversation token reserves the session cap (or what the device
 * has left) against the device's daily cap and the global daily budget. The
 * ElevenLabs post-call webhook settles each reservation to the real duration.
 * No report means no refund, so the ledger can only undercount what is left.
 *
 * Unused tokens must not drain the budget: open reservations are capped per
 * device, per address and site-wide, and the server's sweep expires stale
 * ones (refunded in full). A conversation that turns up after its
 * reservation expired is still charged its real duration.
 *
 * Days run on UTC. Everything is in memory; after a restart the global total
 * is rebuilt from ElevenLabs' history (restore) and devices start fresh.
 */
import { randomId } from './signing.js';

export const MIN_RESERVATION_SECONDS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Statuses of a conversation that may still be running: charge the full cap.
const LIVE_STATUSES = new Set(['initiated', 'in-progress', 'processing']);

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export function createMinuteLedger({
  sessionMaxSeconds,
  dailyMaxSeconds,
  globalDailyMaxSeconds,
  maxOpenPerDevice = Infinity,
  maxOpenPerAddress = Infinity,
  maxOpenTotal = Infinity,
  now = Date.now,
}) {
  const days = new Map();
  const reservations = new Map();
  const byConversation = new Map();
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
    for (const [id, reservation] of reservations) {
      if (keep.has(reservation.day) || reservation.state === 'open') continue;
      reservations.delete(id);
      if (reservation.conversationId) byConversation.delete(reservation.conversationId);
    }
  }

  const openReservations = () => [...reservations.values()].filter((r) => r.state === 'open');
  const deviceRemaining = (deviceId) => Math.max(0, dailyMaxSeconds - (day().devices.get(deviceId) ?? 0));
  const globalRemaining = () => Math.max(0, globalDailyMaxSeconds - day().global);

  return {
    deviceRemaining,
    globalRemaining,

    secondsUntilReset() {
      const current = new Date(now());
      const nextMidnight = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1);
      return Math.ceil((nextMidnight - current.getTime()) / 1000);
    },

    reserve(deviceId, { address } = {}) {
      prune();
      const globalLeft = globalRemaining();
      if (globalLeft < MIN_RESERVATION_SECONDS) return { ok: false, reason: 'global_budget' };
      const deviceLeft = deviceRemaining(deviceId);
      if (deviceLeft < MIN_RESERVATION_SECONDS) return { ok: false, reason: 'device_daily_cap' };
      const open = openReservations();
      if (open.length >= maxOpenTotal) return { ok: false, reason: 'busy', cap: 'total' };
      if (open.filter((r) => r.deviceId === deviceId).length >= maxOpenPerDevice) {
        return { ok: false, reason: 'busy', cap: 'device' };
      }
      if (address && open.filter((r) => r.address === address).length >= maxOpenPerAddress) {
        return { ok: false, reason: 'busy', cap: 'address' };
      }
      const seconds = Math.min(sessionMaxSeconds, deviceLeft, globalLeft);
      const reservationId = randomId();
      const key = dayKey(now());
      reservations.set(reservationId, {
        deviceId,
        address: address ?? null,
        day: key,
        seconds,
        createdAt: now(),
        conversationId: null,
        state: 'open',
      });
      charge(key, deviceId, seconds);
      return { ok: true, reservationId, seconds };
    },

    /** ElevenLabs returns the conversation id with the token; remember it. */
    attachConversation(reservationId, conversationId) {
      const reservation = reservations.get(reservationId);
      if (!reservation || !conversationId) return;
      reservation.conversationId = conversationId;
      byConversation.set(conversationId, reservationId);
    },

    reservationForConversation(conversationId) {
      return byConversation.get(conversationId) ?? null;
    },

    reservationInfo(reservationId) {
      const reservation = reservations.get(reservationId);
      if (!reservation) return null;
      const { deviceId, conversationId, state, seconds } = reservation;
      return { deviceId, conversationId, state, seconds };
    },

    openReservationsOlderThan(ageMs) {
      const cutoff = now() - ageMs;
      return openReservations()
        .filter((r) => r.createdAt < cutoff)
        .map((r) => {
          const reservationId = [...reservations.entries()].find(([, value]) => value === r)[0];
          return { reservationId, conversationId: r.conversationId };
        });
    },

    /** The conversation never started (token minting failed): refund in full. */
    release(reservationId) {
      const reservation = reservations.get(reservationId);
      if (!reservation || reservation.state !== 'open') return;
      reservation.state = 'settled';
      charge(reservation.day, reservation.deviceId, -reservation.seconds);
    },

    /** Stale and unused: refund in full, but still charge it if it turns up. */
    expire(reservationId) {
      const reservation = reservations.get(reservationId);
      if (!reservation || reservation.state !== 'open') return;
      reservation.state = 'expired';
      charge(reservation.day, reservation.deviceId, -reservation.seconds);
    },

    /** Charge the real duration (capped at the session cap) instead of the reservation. */
    settle(reservationId, { durationSecs, conversationId }) {
      const reservation = reservations.get(reservationId);
      if (!reservation) return 'unknown';
      if (reservation.state === 'settled' || countedConversations.has(conversationId)) return 'duplicate';
      const alreadyCharged = reservation.state === 'open' ? reservation.seconds : 0;
      reservation.state = 'settled';
      countedConversations.add(conversationId);
      charge(reservation.day, reservation.deviceId, capToSession(durationSecs) - alreadyCharged);
      return 'settled';
    },

    /** A valid reservation this process no longer remembers (minted before a restart). */
    chargeUnreserved({ conversationId, durationSecs }) {
      if (countedConversations.has(conversationId)) return 'duplicate';
      countedConversations.add(conversationId);
      charge(dayKey(now()), null, capToSession(durationSecs));
      return 'charged';
    },

    /**
     * Count today's conversations from ElevenLabs' history that the ledger does
     * not already account for: at startup, and on every periodic re-read.
     */
    restore(conversations) {
      const counted = { conversations: 0, seconds: 0 };
      for (const { conversationId, durationSecs, status } of conversations) {
        if (countedConversations.has(conversationId)) continue;
        const reservationId = byConversation.get(conversationId);
        if (reservationId && reservations.get(reservationId)?.state === 'open') continue;
        countedConversations.add(conversationId);
        const seconds = LIVE_STATUSES.has(status) ? sessionMaxSeconds : capToSession(durationSecs);
        charge(dayKey(now()), null, seconds);
        counted.conversations += 1;
        counted.seconds += seconds;
      }
      return counted;
    },
  };
}
