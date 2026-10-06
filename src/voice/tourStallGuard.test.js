import { describe, expect, it } from 'vitest';

const guardModule = await import('./tourStallGuard.js').catch(() => ({}));
const { createTourStallGuard, TOUR_STALL_MS } = guardModule;

function setup() {
  const sent = [];
  const timers = [];
  const guard = createTourStallGuard({
    send: (text) => sent.push(text),
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeoutImpl: (id) => {
      if (timers[id]) timers[id].cleared = true;
    },
  });
  const fire = () => timers.filter((t) => !t.cleared && !t.ran).forEach((t) => {
    t.ran = true;
    t.fn();
  });
  return { sent, timers, guard, fire };
}

// If the guide finishes speaking at a stop and nothing moves the tour on,
// the app nudges it. Nothing moves without a call, so the lights never drift.
describe('Tour stall guard', () => {
  it('waits 8 seconds', () => {
    expect(TOUR_STALL_MS).toBe(8000);
  });

  it('nudges once when the guide goes quiet at a stop and nothing follows', () => {
    const { sent, timers, guard, fire } = setup();
    guard.stopShown({ stop: 3, of: 7 });
    guard.guideSpeaking(true);
    guard.guideSpeaking(false);
    expect(timers.filter((t) => !t.cleared).map((t) => t.ms)).toEqual([8000]);
    fire();
    expect(sent).toEqual(['[app] the tour is waiting at stop 3 of 7']);
    guard.guideSpeaking(true);
    guard.guideSpeaking(false);
    fire();
    expect(sent).toHaveLength(1);
  });

  it('does not start counting until the guide has spoken at the stop', () => {
    const { timers, guard } = setup();
    guard.stopShown({ stop: 1, of: 7 });
    guard.guideSpeaking(false);
    expect(timers).toHaveLength(0);
  });

  it.each([
    ['the next stop', (guard) => guard.stopShown({ stop: 4, of: 7 })],
    ['the end of the tour', (guard) => guard.tourEnded()],
    ['the player speaking or taking hold', (guard) => guard.playerActivity()],
    ['the guide speaking again', (guard) => guard.guideSpeaking(true)],
  ])('is cancelled by %s', (_label, act) => {
    const { sent, guard, fire } = setup();
    guard.stopShown({ stop: 3, of: 7 });
    guard.guideSpeaking(true);
    guard.guideSpeaking(false);
    act(guard);
    fire();
    expect(sent).toEqual([]);
  });

  it('does nothing outside a tour', () => {
    const { timers, guard } = setup();
    guard.guideSpeaking(true);
    guard.guideSpeaking(false);
    expect(timers).toHaveLength(0);
  });
});
