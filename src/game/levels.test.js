import { describe, expect, it } from 'vitest';

const levelsModule = await import('./levels.js').catch(() => ({}));
const { gameLevel, stepSpeed, SPEED_STEP, MIN_SPEED, MAX_SPEED } = levelsModule;

// Kyle, 2026-10-11: there are levels of hard. On a streak the guide asks
// "Faster, or colours off?" and the player picks. Each step is a level:
// +0.25x speed, colours off, or the exact region instead of the lobe. The
// player sees the steps taken: Easy, Hard 1, Hard 2...

describe('Speed steps', () => {
  it('move by a quarter, between half speed and double', () => {
    expect(SPEED_STEP).toBe(0.25);
    expect(MIN_SPEED).toBe(0.5);
    expect(MAX_SPEED).toBe(2);
  });

  it.each([
    [1, 'faster', 1.25],
    [1.25, 'faster', 1.5],
    [1.75, 'faster', 2],
    [1, 'slower', 0.75],
    [0.75, 'slower', 0.5],
  ])('from %s, %s is %s', (speed, change, expected) => {
    expect(stepSpeed(speed, change)).toBe(expected);
  });

  it('snaps a slider value onto the next quarter', () => {
    expect(stepSpeed(1.1, 'faster')).toBe(1.25);
    expect(stepSpeed(1.1, 'slower')).toBe(1);
    expect(stepSpeed(1.9, 'faster')).toBe(2);
    expect(stepSpeed(0.6, 'slower')).toBe(0.5);
  });

  it('has nowhere to go past either end', () => {
    expect(stepSpeed(2, 'faster')).toBeNull();
    expect(stepSpeed(0.5, 'slower')).toBeNull();
  });
});

describe('The level', () => {
  it.each([
    [{ speed: 1, colour: true, exact: false }, 0, 'Easy'],
    [{ speed: 1.25, colour: true, exact: false }, 1, 'Hard 1'],
    [{ speed: 1, colour: false, exact: false }, 1, 'Hard 1'],
    [{ speed: 1.25, colour: false, exact: false }, 2, 'Hard 2'],
    [{ speed: 1.5, colour: false, exact: true }, 4, 'Hard 4'],
    [{ speed: 2, colour: false, exact: true }, 6, 'Hard 6'],
  ])('%j is %s steps: %s', (settings, steps, label) => {
    expect(gameLevel(settings)).toEqual({ steps, label });
  });

  it('never drops below Easy when the player slows down', () => {
    expect(gameLevel({ speed: 0.5, colour: true, exact: false })).toEqual({ steps: 0, label: 'Easy' });
    expect(gameLevel({ speed: 0.75, colour: false, exact: false })).toEqual({ steps: 0, label: 'Easy' });
  });

  it('counts a slider value by its nearest quarter', () => {
    expect(gameLevel({ speed: 1.1, colour: true, exact: false }).label).toBe('Easy');
    expect(gameLevel({ speed: 1.2, colour: true, exact: false }).label).toBe('Hard 1');
  });
});
