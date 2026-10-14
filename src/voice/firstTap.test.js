import { describe, expect, it } from 'vitest';

const firstTapModule = await import('./firstTap.js').catch(() => ({}));
const { firstTapAction, listenForFirstTap, FIRST_TAP_EVENTS } = firstTapModule;

// Kyle, 2026-10-13: on brain-game.io the welcome streamed silently. Chrome
// allows sound only after the visitor has clicked, tapped or pressed a key on
// the site (or after many visits with sound, which staging had). "Ok first
// click turn[s the voice on]": the first interaction anywhere on the page
// turns Sylvi's voice on at the word she has reached.
describe('What the first click, tap or key press does', () => {
  it("turns the welcome's voice on while it streams silently", () => {
    expect(firstTapAction({ welcomeState: 'silent' })).toBe('unlock');
  });

  it('waits while the welcome has not started: the press lets it start aloud', () => {
    expect(firstTapAction({ welcomeState: 'none' })).toBe('wait');
  });

  it('stops listening once the welcome is heard or over', () => {
    expect(firstTapAction({ welcomeState: 'audible' })).toBe('stop');
    expect(firstTapAction({ welcomeState: 'done' })).toBe('stop');
  });

  it('leaves the Voice and Motion switches to themselves, and stops listening', () => {
    // A press on the Voice switch would otherwise turn the voice on, then the switch's own click would turn it off.
    expect(firstTapAction({ welcomeState: 'silent', onSwitch: true })).toBe('stop');
  });

  it('never overrides a visitor who has used the Voice switch', () => {
    expect(firstTapAction({ welcomeState: 'silent', voiceChosen: true })).toBe('stop');
  });
});

describe('Listening for the first interaction', () => {
  function fakeTarget() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener: (type, fn, capture) => listeners.set(type, { fn, capture }),
      removeEventListener: (type) => listeners.delete(type),
      fire: (type, target = { closest: () => null }) => listeners.get(type)?.fn({ type, target }),
    };
  }
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  it('listens for the presses that let a page play sound, before the page handles them', () => {
    expect(FIRST_TAP_EVENTS).toEqual(['pointerup', 'keydown', 'touchend']);
    const target = fakeTarget();
    listenForFirstTap({ target, state: () => ({ welcomeState: 'none' }), unlock: async () => true });
    expect([...target.listeners.keys()]).toEqual(FIRST_TAP_EVENTS);
    for (const { capture } of target.listeners.values()) expect(capture).toBe(true);
  });

  it('turns the voice on at the first press, then stops listening', async () => {
    const target = fakeTarget();
    const calls = [];
    listenForFirstTap({ target, state: () => ({ welcomeState: 'silent' }), unlock: async () => calls.push('unlock') > 0 });
    target.fire('pointerup');
    await flush();
    expect(calls).toEqual(['unlock']);
    expect(target.listeners.size).toBe(0);
  });

  it('keeps listening if the browser still refused the sound', async () => {
    const target = fakeTarget();
    let tries = 0;
    listenForFirstTap({ target, state: () => ({ welcomeState: 'silent' }), unlock: async () => (tries += 1) > 1 });
    target.fire('pointerup');
    await flush();
    expect(target.listeners.size).toBe(3);
    target.fire('keydown');
    await flush();
    expect(tries).toBe(2);
    expect(target.listeners.size).toBe(0);
  });

  it('stops without turning anything on for a press on a switch', async () => {
    const target = fakeTarget();
    const calls = [];
    listenForFirstTap({ target, state: () => ({ welcomeState: 'silent' }), unlock: async () => calls.push('unlock') > 0 });
    target.fire('pointerup', { closest: (selector) => (selector === '.guide-switch' ? {} : null) });
    await flush();
    expect(calls).toEqual([]);
    expect(target.listeners.size).toBe(0);
  });

  it('can be removed by the page', () => {
    const target = fakeTarget();
    const stop = listenForFirstTap({ target, state: () => ({ welcomeState: 'none' }), unlock: async () => true });
    stop();
    expect(target.listeners.size).toBe(0);
  });
});
