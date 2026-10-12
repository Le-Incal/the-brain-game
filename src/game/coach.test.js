import { describe, expect, it } from 'vitest';

const coachModule = await import('./coach.js').catch(() => ({}));
const { createGameCoach, STREAK_LENGTH, STRUGGLE_IN_A_ROW, STRUGGLE_WINDOW, COOLDOWN_WORDS } = coachModule;

// Kyle, 2026-10-11: the guide senses when the player is getting every answer
// right and asks "Faster, or colours off?"; it senses when they are struggling
// and asks "Slower, or colours back on?". The player picks each step. Once
// colours are off and the speed is at least 1.5x, the next offer is the exact
// region instead of the lobe.

const EASY = { speed: 1, colour: true, exact: false };

function play(coach, outcomes, settings = EASY) {
  return outcomes.map((outcome) => coach.result(outcome, settings));
}

describe('The thresholds', () => {
  it('are five in a row, three missed in a row or four of the last six, and six words between offers', () => {
    expect(STREAK_LENGTH).toBe(5);
    expect(STRUGGLE_IN_A_ROW).toBe(3);
    expect(STRUGGLE_WINDOW).toEqual({ missed: 4, of: 6 });
    expect(COOLDOWN_WORDS).toBe(6);
  });
});

describe('A streak', () => {
  it('is noticed on the fifth catch in a row', () => {
    const coach = createGameCoach();
    const signals = play(coach, ['correct', 'correct', 'correct', 'correct', 'correct']);
    expect(signals.slice(0, 4)).toEqual([null, null, null, null]);
    expect(signals[4]).toMatchObject({ kind: 'streak', count: 5, level: 'Easy', offers: ['faster', 'colours off'] });
  });

  it('starts again after a miss', () => {
    const coach = createGameCoach();
    const signals = play(coach, ['correct', 'correct', 'correct', 'correct', 'wrong', 'correct', 'correct', 'correct', 'correct']);
    expect(signals.every((signal) => signal === null)).toBe(true);
  });

  it('offers faster alone once the colours are off', () => {
    const coach = createGameCoach();
    const settings = { speed: 1.25, colour: false, exact: false };
    const signal = play(coach, Array(5).fill('correct'), settings)[4];
    expect(signal).toMatchObject({ kind: 'streak', level: 'Hard 2', offers: ['faster'] });
  });

  it('offers the exact region once the colours are off and the words fall at 1.5x or more', () => {
    const coach = createGameCoach();
    const signal = play(coach, Array(5).fill('correct'), { speed: 1.5, colour: false, exact: false })[4];
    expect(signal.offers).toEqual(['the exact region']);
  });

  it('has nothing harder to offer at the top', () => {
    const coach = createGameCoach();
    const signal = play(coach, Array(5).fill('correct'), { speed: 2, colour: false, exact: true })[4];
    expect(signal).toMatchObject({ kind: 'streak', level: 'Hard 6', offers: [] });
  });
});

describe('Struggling', () => {
  it('is noticed on the third miss in a row', () => {
    const coach = createGameCoach();
    const signals = play(coach, ['wrong', 'miss', 'wrong']);
    expect(signals.slice(0, 2)).toEqual([null, null]);
    expect(signals[2]).toMatchObject({ kind: 'struggling', inARow: 3, level: 'Easy', offers: ['slower'] });
  });

  it('is noticed on four misses in the last six', () => {
    const coach = createGameCoach();
    const signals = play(coach, ['wrong', 'correct', 'wrong', 'wrong', 'correct', 'miss']);
    expect(signals.slice(0, 5).every((signal) => signal === null)).toBe(true);
    expect(signals[5]).toMatchObject({ kind: 'struggling', missed: 4, of: 6 });
  });

  it('offers slower or colours back on', () => {
    const coach = createGameCoach();
    const signal = play(coach, ['wrong', 'wrong', 'wrong'], { speed: 1.25, colour: false, exact: false })[2];
    expect(signal.offers).toEqual(['slower', 'colours back on']);
  });

  it('offers the lobe again first when the exact region is asked', () => {
    const coach = createGameCoach();
    const signal = play(coach, ['wrong', 'wrong', 'wrong'], { speed: 1.5, colour: false, exact: true })[2];
    expect(signal.offers).toEqual(['the lobe again', 'slower']);
  });

  it('has nothing easier to offer at the gentlest settings', () => {
    const coach = createGameCoach();
    const signal = play(coach, ['wrong', 'wrong', 'wrong'], { speed: 0.5, colour: true, exact: false })[2];
    expect(signal.offers).toEqual([]);
  });
});

describe('Restraint', () => {
  it('waits six words after an offer before making another', () => {
    const coach = createGameCoach();
    play(coach, Array(5).fill('correct'));
    const after = play(coach, Array(6).fill('wrong'));
    expect(after.every((signal) => signal === null)).toBe(true);
    expect(coach.result('wrong', EASY)).toMatchObject({ kind: 'struggling' });
  });

  it('counts afresh once the settings change: a new level needs new evidence', () => {
    const coach = createGameCoach();
    play(coach, ['correct', 'correct', 'correct', 'correct']);
    coach.settingsChanged();
    const signals = play(coach, ['correct', 'correct', 'correct', 'correct']);
    expect(signals.every((signal) => signal === null)).toBe(true);
    expect(coach.result('correct', EASY)).toMatchObject({ kind: 'streak', count: 5 });
  });

  it('forgets everything when a new game starts', () => {
    const coach = createGameCoach();
    play(coach, ['wrong', 'wrong']);
    coach.reset();
    expect(coach.result('wrong', EASY)).toBeNull();
  });
});
