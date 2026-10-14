import { describe, expect, it } from 'vitest';

const choiceWelcomeModule = await import('./choiceWelcome.js').catch(() => ({}));
const { choiceWelcomeAction, createIntroHold } = choiceWelcomeModule;

// Kyle, 2026-10-13: "Have a custom welcome for each button if the first
// welcome never plays". A press on Study the Brain or the Brain Game, before
// the arrival welcome has been heard, plays that choice's own welcome instead.
describe("When a choice plays its own welcome", () => {
  it('plays it if the arrival welcome has not been heard', () => {
    expect(choiceWelcomeAction({ welcomeState: 'none', currentKind: 'arrival' })).toBe('play');
    expect(choiceWelcomeAction({ welcomeState: 'held', currentKind: 'arrival' })).toBe('play');
  });

  it('leaves the buttons as they are once a welcome has been heard', () => {
    expect(choiceWelcomeAction({ welcomeState: 'audible', currentKind: 'arrival' })).toBe('none');
    expect(choiceWelcomeAction({ welcomeState: 'done', currentKind: 'arrival' })).toBe('none');
    expect(choiceWelcomeAction({ welcomeState: 'done', currentKind: 'study' })).toBe('none');
  });

  it('never plays over a visitor who has turned the voice on', () => {
    expect(choiceWelcomeAction({ welcomeState: 'held', currentKind: 'arrival', voiceChosen: true })).toBe('none');
  });

  // A second choice while the first one's welcome plays: that welcome ends.
  it("ends a choice's welcome when another choice is made", () => {
    expect(choiceWelcomeAction({ welcomeState: 'audible', currentKind: 'play' })).toBe('stop');
    expect(choiceWelcomeAction({ welcomeState: 'greeting', currentKind: 'study' })).toBe('stop');
  });
});

// Kyle, 2026-10-13: the countdown waits until she finishes the Brain Game's
// welcome ("Hold the countdown").
describe('Holding the countdown for her welcome', () => {
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  it('starts the game once she finishes', async () => {
    const hold = createIntroHold();
    let finish;
    const calls = [];
    hold.start(new Promise((resolve) => (finish = resolve)), () => calls.push('countdown'));
    expect(hold.active()).toBe(true);
    await flush();
    expect(calls).toEqual([]);
    finish();
    await flush();
    expect(calls).toEqual(['countdown']);
    expect(hold.active()).toBe(false);
  });

  it('never starts the game once the visitor has moved on', async () => {
    const hold = createIntroHold();
    let finish;
    const calls = [];
    hold.start(new Promise((resolve) => (finish = resolve)), () => calls.push('countdown'));
    expect(hold.cancel()).toBe(true);
    expect(hold.cancel()).toBe(false);
    finish();
    await flush();
    expect(calls).toEqual([]);
    expect(hold.active()).toBe(false);
  });

  it('keeps only the latest hold', async () => {
    const hold = createIntroHold();
    let first;
    const calls = [];
    hold.start(new Promise((resolve) => (first = resolve)), () => calls.push('first'));
    hold.start(Promise.resolve(), () => calls.push('second'));
    first();
    await flush();
    expect(calls).toEqual(['second']);
  });
});
