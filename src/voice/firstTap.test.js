import { describe, expect, it } from 'vitest';

const firstTapModule = await import('./firstTap.js').catch(() => ({}));
const { firstTapAction, listenForFirstTap, FIRST_TAP_EVENTS, CHOICE_SELECTOR, FIELD_SELECTOR } = firstTapModule;

// Kyle, 2026-10-13: on brain-game.io the welcome streamed silently. Chrome
// allows sound only after the visitor has clicked, tapped or pressed a key on
// the site (or after many visits with sound, which staging had). "Ok first
// click turn[s the voice on]": the first interaction anywhere on the page
// turns Sylvi's voice on at the word she has reached.
describe('What the first click, tap or key press does', () => {
  it("turns the welcome's voice on while it streams silently", () => {
    expect(firstTapAction({ welcomeState: 'silent' })).toBe('unlock');
  });

  // Safari allows sound only from inside the press: the press primes the
  // recordings, so she starts aloud when her moment comes.
  it('primes the recordings while the welcome has not started, so she starts aloud', () => {
    expect(firstTapAction({ welcomeState: 'none' })).toBe('prime');
  });

  // Kyle, 2026-10-13: "only trigger streaming and motion if the voice talks".
  // Where the browser refused sound, the welcome waits, unstarted; the first
  // press gives the whole welcome from the top, aloud.
  it('starts a waiting welcome from the top', () => {
    expect(firstTapAction({ welcomeState: 'held' })).toBe('greet');
  });

  it("leaves a waiting welcome to the switches, the choices' own welcomes and the message box", () => {
    expect(firstTapAction({ welcomeState: 'held', onSwitch: true })).toBe('wait');
    expect(firstTapAction({ welcomeState: 'held', onChoice: true })).toBe('wait');
    expect(firstTapAction({ welcomeState: 'held', inField: true })).toBe('wait');
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

  it('starts a waiting welcome at the first press, then stops listening', async () => {
    const target = fakeTarget();
    const calls = [];
    listenForFirstTap({
      target,
      state: () => ({ welcomeState: 'held' }),
      greet: () => calls.push('greet') > 0,
      prime: () => calls.push('prime'),
    });
    target.fire('keydown');
    await flush();
    expect(calls).toEqual(['prime', 'greet']);
    expect(target.listeners.size).toBe(0);
  });

  it('primes and keeps listening before the welcome starts', async () => {
    const target = fakeTarget();
    const calls = [];
    listenForFirstTap({ target, state: () => ({ welcomeState: 'none' }), greet: () => true, prime: () => calls.push('prime') });
    target.fire('pointerup');
    await flush();
    expect(calls).toEqual(['prime']);
    expect(target.listeners.size).toBe(3);
  });

  it("knows a press on a choice or in the message box, and leaves those alone", async () => {
    expect(CHOICE_SELECTOR).toBe('.arrival-study, .arrival-play, .bar-study, .bar-play');
    expect(FIELD_SELECTOR).toBe('input, textarea, [contenteditable="true"]');
    const target = fakeTarget();
    const calls = [];
    listenForFirstTap({ target, state: () => ({ welcomeState: 'held' }), greet: () => calls.push('greet') > 0, prime: () => {} });
    target.fire('pointerup', { closest: (selector) => (selector === CHOICE_SELECTOR ? {} : null) });
    target.fire('keydown', { closest: (selector) => (selector === FIELD_SELECTOR ? {} : null) });
    await flush();
    expect(calls).toEqual([]);
    expect(target.listeners.size).toBe(3);
  });

  it('can be removed by the page', () => {
    const target = fakeTarget();
    const stop = listenForFirstTap({ target, state: () => ({ welcomeState: 'none' }), unlock: async () => true });
    stop();
    expect(target.listeners.size).toBe(0);
  });
});
