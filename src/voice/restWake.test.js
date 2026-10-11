import { describe, expect, it } from 'vitest';

const restModule = await import('./restWake.js').catch(() => ({}));
const { createRestTimer, createSpeechOnset, REST_AFTER_SILENCE_MS, HIDDEN_REST_MS, ONSET_LEVEL, ONSET_HOLD_MS } = restModule;

// Kyle, 2026-10-11: the live session rests after 30 s of silence and wakes
// when the visitor speaks or writes. Nothing on screen says it ended.

function clockAndTimers() {
  const clock = { now: 0 };
  let timers = [];
  let nextId = 1;
  return {
    clock,
    setTimeoutImpl: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, fn, at: clock.now + ms });
      return id;
    },
    clearTimeoutImpl: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    advance(ms) {
      const until = clock.now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        clock.now = due.at;
        due.fn();
      }
      clock.now = until;
    },
  };
}

function setup() {
  const env = clockAndTimers();
  const rests = [];
  const timer = createRestTimer({
    now: () => env.clock.now,
    setTimeoutImpl: env.setTimeoutImpl,
    clearTimeoutImpl: env.clearTimeoutImpl,
    onRest: (reason) => rests.push({ at: env.clock.now, reason }),
  });
  return { ...env, timer, rests };
}

describe('When the conversation rests', () => {
  it('after 30 s with no speech and no writing', () => {
    expect(REST_AFTER_SILENCE_MS).toBe(30_000);
    const { timer, rests, advance } = setup();
    timer.connected(true);
    advance(29_999);
    expect(rests).toEqual([]);
    advance(1);
    expect(rests).toEqual([{ at: 30_000, reason: 'silence' }]);
  });

  it('never while the guide is speaking; the count starts when it stops', () => {
    const { timer, rests, advance } = setup();
    timer.connected(true);
    timer.guideSpeaking(true);
    advance(60_000);
    expect(rests).toEqual([]);
    timer.guideSpeaking(false);
    advance(30_000);
    expect(rests).toHaveLength(1);
  });

  it('starts the count again on any activity', () => {
    const { timer, rests, advance } = setup();
    timer.connected(true);
    advance(20_000);
    timer.activity();
    advance(20_000);
    expect(rests).toEqual([]);
    advance(10_000);
    expect(rests).toHaveLength(1);
  });

  it('soon after the tab is hidden', () => {
    expect(HIDDEN_REST_MS).toBe(10_000);
    const { timer, rests, advance } = setup();
    timer.connected(true);
    timer.hidden(true);
    advance(10_000);
    expect(rests).toEqual([{ at: 10_000, reason: 'hidden' }]);
  });

  it('never when no conversation is connected, and only once per conversation', () => {
    const { timer, rests, advance } = setup();
    advance(60_000);
    expect(rests).toEqual([]);
    timer.connected(true);
    advance(90_000);
    expect(rests).toHaveLength(1);
    timer.connected(false);
    advance(60_000);
    expect(rests).toHaveLength(1);
  });
});

describe('Waking on speech', () => {
  it('hears the visitor start speaking: a level held above the threshold for a moment', () => {
    expect(ONSET_LEVEL).toBeGreaterThan(0);
    expect(ONSET_HOLD_MS).toBe(150);
    const clock = { now: 0 };
    const onsets = [];
    const onset = createSpeechOnset({ now: () => clock.now, onOnset: () => onsets.push(clock.now) });
    onset.level(ONSET_LEVEL * 2);
    clock.now = 100;
    onset.level(ONSET_LEVEL * 2);
    expect(onsets).toEqual([]);
    clock.now = 160;
    onset.level(ONSET_LEVEL * 2);
    expect(onsets).toEqual([160]);
    clock.now = 400;
    onset.level(ONSET_LEVEL * 2);
    expect(onsets).toHaveLength(1);
  });

  it('ignores a click or a bump: too short to be speech', () => {
    const clock = { now: 0 };
    const onsets = [];
    const onset = createSpeechOnset({ now: () => clock.now, onOnset: () => onsets.push(clock.now) });
    onset.level(ONSET_LEVEL * 3);
    clock.now = 60;
    onset.level(0);
    clock.now = 400;
    onset.level(0);
    expect(onsets).toEqual([]);
  });
});
