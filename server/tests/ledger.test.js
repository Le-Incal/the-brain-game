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

  it('reports seconds until the next UTC day', () => {
    const { clock, ledger } = setup();
    expect(ledger.secondsUntilReset()).toBe(12 * 3600);
    clock.set(Date.UTC(2026, 9, 5, 21, 0, 0));
    expect(ledger.secondsUntilReset()).toBe(3 * 3600);
  });
});

describe('M3: rebuilding today from ElevenLabs after a restart', () => {
  it("restores today's global usage from conversation history, each capped at the session cap", () => {
    const { ledger } = setup();
    ledger.restore([
      { conversationId: 'a', durationSecs: 120, status: 'done' },
      { conversationId: 'b', durationSecs: 9999, status: 'done' },
      { conversationId: 'c', durationSecs: 0, status: 'failed' },
    ]);
    expect(ledger.globalRemaining()).toBe(18000 - 120 - 480);
  });

  it('charges a conversation that may still be running its full session cap', () => {
    const { ledger } = setup();
    ledger.restore([
      { conversationId: 'live', durationSecs: 30, status: 'in-progress' },
      { conversationId: 'new', durationSecs: 0, status: 'initiated' },
      { conversationId: 'wrapping', durationSecs: 200, status: 'processing' },
    ]);
    expect(ledger.globalRemaining()).toBe(18000 - 3 * 480);
  });

  it('never counts a restored conversation twice when its webhook arrives', () => {
    const { ledger } = setup();
    ledger.restore([{ conversationId: 'a', durationSecs: 120, status: 'done' }]);
    expect(ledger.chargeUnreserved({ conversationId: 'a', durationSecs: 120 })).toBe('duplicate');
    expect(ledger.globalRemaining()).toBe(18000 - 120);
  });

  it('starts per-device counts fresh, as accepted', () => {
    const { ledger } = setup();
    ledger.restore([{ conversationId: 'a', durationSecs: 480, status: 'done' }]);
    expect(ledger.deviceRemaining('device-a')).toBe(900);
  });

  it('charges a conversation with no remembered reservation to the global budget, once', () => {
    const { ledger } = setup();
    expect(ledger.chargeUnreserved({ conversationId: 'orphan', durationSecs: 9999 })).toBe('charged');
    expect(ledger.chargeUnreserved({ conversationId: 'orphan', durationSecs: 10 })).toBe('duplicate');
    expect(ledger.globalRemaining()).toBe(18000 - 480);
  });
});

describe('M3 fix: open reservations are capped', () => {
  const capped = (overrides = {}) =>
    setup({ maxOpenPerDevice: 1, maxOpenPerAddress: 2, maxOpenTotal: 10, globalDailyMaxSeconds: 1_000_000, dailyMaxSeconds: 100_000, ...overrides });

  it('holds at most one open reservation per device', () => {
    const { ledger } = capped();
    expect(ledger.reserve('device-a', { address: '1.1.1.1' }).ok).toBe(true);
    expect(ledger.reserve('device-a', { address: '1.1.1.1' })).toEqual({ ok: false, reason: 'busy', cap: 'device' });
  });

  it('holds at most two open reservations per address, whatever the device', () => {
    const { ledger } = capped();
    expect(ledger.reserve('d1', { address: '1.1.1.1' }).ok).toBe(true);
    expect(ledger.reserve('d2', { address: '1.1.1.1' }).ok).toBe(true);
    expect(ledger.reserve('d3', { address: '1.1.1.1' })).toEqual({ ok: false, reason: 'busy', cap: 'address' });
    expect(ledger.reserve('d4', { address: '2.2.2.2' }).ok).toBe(true);
  });

  it('holds at most the site-wide number open at once', () => {
    const { ledger } = capped({ maxOpenTotal: 3 });
    for (let i = 0; i < 3; i += 1) expect(ledger.reserve(`d${i}`, { address: `10.0.0.${i}` }).ok).toBe(true);
    expect(ledger.reserve('d9', { address: '10.0.0.9' })).toEqual({ ok: false, reason: 'busy', cap: 'total' });
  });

  it('frees a slot once a reservation settles or is released', () => {
    const { ledger } = capped();
    const first = ledger.reserve('device-a', { address: '1.1.1.1' });
    ledger.settle(first.reservationId, { durationSecs: 30, conversationId: 'c1' });
    const second = ledger.reserve('device-a', { address: '1.1.1.1' });
    expect(second.ok).toBe(true);
    ledger.release(second.reservationId);
    expect(ledger.reserve('device-a', { address: '1.1.1.1' }).ok).toBe(true);
  });
});

describe('M3 fix: expired reservations', () => {
  it('lists open reservations older than a cutoff, with their conversation ids', () => {
    const { clock, ledger } = setup();
    const old = ledger.reserve('device-a');
    ledger.attachConversation(old.reservationId, 'conv_old');
    clock.advance(30 * 60 * 1000);
    ledger.reserve('device-b');
    expect(ledger.openReservationsOlderThan(25 * 60 * 1000)).toEqual([
      { reservationId: old.reservationId, conversationId: 'conv_old' },
    ]);
  });

  it('finds a reservation by the conversation id recorded at mint', () => {
    const { ledger } = setup();
    const { reservationId } = ledger.reserve('device-a');
    ledger.attachConversation(reservationId, 'conv_x');
    expect(ledger.reservationForConversation('conv_x')).toBe(reservationId);
    expect(ledger.reservationForConversation('conv_unknown')).toBeNull();
  });

  it('releasing an expired, unused reservation refunds it in full', () => {
    const { ledger } = setup();
    const { reservationId } = ledger.reserve('device-a');
    ledger.expire(reservationId);
    expect(ledger.deviceRemaining('device-a')).toBe(900);
    expect(ledger.globalRemaining()).toBe(18000);
    expect(ledger.openReservationsOlderThan(0)).toEqual([]);
  });

  it('still charges a conversation that turns up after its reservation expired', () => {
    const { ledger } = setup();
    const { reservationId } = ledger.reserve('device-a');
    ledger.expire(reservationId);
    expect(ledger.settle(reservationId, { durationSecs: 200, conversationId: 'late' })).toBe('settled');
    expect(ledger.globalRemaining()).toBe(18000 - 200);
    expect(ledger.settle(reservationId, { durationSecs: 200, conversationId: 'late' })).toBe('duplicate');
  });
});
