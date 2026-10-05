import { describe, expect, it } from 'vitest';
import { fakeClock } from './helpers.js';

const ledgerModule = await import('../ledger.js').catch(() => ({}));
const { createMinuteLedger, MIN_RESERVATION_SECONDS } = ledgerModule;

const DAY = 24 * 60 * 60 * 1000;

function setup(overrides = {}) {
  const clock = fakeClock();
  const ledger = createMinuteLedger({
    sessionMaxSeconds: 480,
    dailyMaxSeconds: 900,
    globalDailyMaxSeconds: 18000,
    now: clock.now,
    ...overrides,
  });
  return { clock, ledger };
}

describe('M3: reserve, then refund', () => {
  it('reserves the full session cap when the device has room', () => {
    const { ledger } = setup();
    const reservation = ledger.reserve('device-a');
    expect(reservation).toMatchObject({ ok: true, seconds: 480 });
    expect(typeof reservation.reservationId).toBe('string');
    expect(ledger.deviceRemaining('device-a')).toBe(420);
    expect(ledger.globalRemaining()).toBe(17520);
  });

  it('reserves only what the device has left, if less', () => {
    const { ledger } = setup();
    ledger.reserve('device-a');
    expect(ledger.reserve('device-a')).toMatchObject({ ok: true, seconds: 420 });
    expect(ledger.deviceRemaining('device-a')).toBe(0);
  });

  it('refuses once the device daily cap is spent', () => {
    const { ledger } = setup();
    ledger.reserve('device-a');
    ledger.reserve('device-a');
    expect(ledger.reserve('device-a')).toEqual({ ok: false, reason: 'device_daily_cap' });
  });

  it('refuses when less than the minimum would remain to talk', () => {
    const { ledger } = setup({ dailyMaxSeconds: 480 + MIN_RESERVATION_SECONDS - 1 });
    ledger.reserve('device-a');
    expect(ledger.reserve('device-a')).toEqual({ ok: false, reason: 'device_daily_cap' });
  });

  it('refuses every device once the global budget is spent', () => {
    const { ledger } = setup({ globalDailyMaxSeconds: 960 });
    ledger.reserve('device-a');
    ledger.reserve('device-b');
    expect(ledger.globalRemaining()).toBe(0);
    expect(ledger.reserve('device-c')).toEqual({ ok: false, reason: 'global_budget' });
  });

  it('refunds the unused time when the real duration arrives', () => {
    const { ledger } = setup();
    const { reservationId } = ledger.reserve('device-a');
    expect(ledger.settle(reservationId, { durationSecs: 120, conversationId: 'conv_1' })).toBe('settled');
    expect(ledger.deviceRemaining('device-a')).toBe(780);
    expect(ledger.globalRemaining()).toBe(17880);
  });

  it('charges, never refunds, a conversation that ran past its reservation (up to the session cap)', () => {
    const { ledger } = setup();
    ledger.reserve('device-a');
    const { reservationId, seconds } = ledger.reserve('device-a');
    expect(seconds).toBe(420);
    ledger.settle(reservationId, { durationSecs: 9999, conversationId: 'conv_2' });
    expect(ledger.deviceRemaining('device-a')).toBe(0);
    expect(ledger.globalRemaining()).toBe(18000 - 480 - 480);
  });

  it('settles each reservation at most once', () => {
    const { ledger } = setup();
    const { reservationId } = ledger.reserve('device-a');
    ledger.settle(reservationId, { durationSecs: 60, conversationId: 'conv_1' });
    expect(ledger.settle(reservationId, { durationSecs: 0, conversationId: 'conv_1' })).toBe('duplicate');
    expect(ledger.settle(reservationId, { durationSecs: 0, conversationId: 'conv_other' })).toBe('duplicate');
    expect(ledger.deviceRemaining('device-a')).toBe(840);
  });

  it('ignores a conversation already settled under another reservation', () => {
    const { ledger } = setup();
    const first = ledger.reserve('device-a');
    const second = ledger.reserve('device-b');
    ledger.settle(first.reservationId, { durationSecs: 60, conversationId: 'conv_1' });
    expect(ledger.settle(second.reservationId, { durationSecs: 0, conversationId: 'conv_1' })).toBe('duplicate');
    expect(ledger.deviceRemaining('device-b')).toBe(420);
  });

  it('ignores an unknown reservation', () => {
    const { ledger } = setup();
    expect(ledger.settle('no-such-reservation', { durationSecs: 0, conversationId: 'conv_9' })).toBe('unknown');
  });

  it('keeps the full reservation charged when no report ever arrives', () => {
    const { clock, ledger } = setup();
    ledger.reserve('device-a');
    clock.advance(6 * 60 * 60 * 1000);
    expect(ledger.deviceRemaining('device-a')).toBe(420);
  });

  it('releases a reservation in full when the conversation could not start', () => {
    const { ledger } = setup();
    const { reservationId } = ledger.reserve('device-a');
    ledger.release(reservationId);
    expect(ledger.deviceRemaining('device-a')).toBe(900);
    expect(ledger.globalRemaining()).toBe(18000);
    expect(ledger.settle(reservationId, { durationSecs: 0, conversationId: 'x' })).toBe('duplicate');
  });

  it('starts every cap fresh on the next UTC day', () => {
    const { clock, ledger } = setup({ globalDailyMaxSeconds: 480 });
    ledger.reserve('device-a');
    expect(ledger.reserve('device-b')).toEqual({ ok: false, reason: 'global_budget' });
    clock.set(Date.UTC(2026, 9, 6, 0, 0, 1));
    expect(ledger.globalRemaining()).toBe(480);
    expect(ledger.deviceRemaining('device-a')).toBe(900);
  });

  it('refunds against the day the reservation was made, even after midnight', () => {
    const { clock, ledger } = setup();
    clock.set(Date.UTC(2026, 9, 5, 23, 58, 0));
    const { reservationId } = ledger.reserve('device-a');
    clock.advance(DAY / 24);
    ledger.settle(reservationId, { durationSecs: 60, conversationId: 'conv_1' });
    expect(ledger.deviceRemaining('device-a')).toBe(900);
    clock.set(Date.UTC(2026, 9, 5, 23, 59, 0));
    expect(ledger.deviceRemaining('device-a')).toBe(840);
  });
});
