/**
 * Levels of hard (Kyle, 2026-10-11). The game starts with any region in the
 * right lobe scoring, colours on, words at their usual speed. Each step the
 * player takes is a level: a quarter faster, colours off, or the exact region
 * instead of the lobe. The player sees the steps taken: Easy, Hard 1, Hard 2...
 */

export const SPEED_STEP = 0.25;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;
const EPSILON = 1e-9;

/** The next quarter faster or slower, or null at either end. */
export function stepSpeed(speed, change) {
  const value = Number(speed);
  if (change === 'faster') {
    if (value >= MAX_SPEED - EPSILON) return null;
    return Math.min(MAX_SPEED, (Math.floor(value / SPEED_STEP + EPSILON) + 1) * SPEED_STEP);
  }
  if (change === 'slower') {
    if (value <= MIN_SPEED + EPSILON) return null;
    return Math.max(MIN_SPEED, (Math.ceil(value / SPEED_STEP - EPSILON) - 1) * SPEED_STEP);
  }
  return null;
}

/** How many steps above the start, and what the player sees. */
export function gameLevel({ speed = 1, colour = true, exact = false } = {}) {
  const speedSteps = Math.round((Number(speed) - 1) / SPEED_STEP);
  const steps = Math.max(0, speedSteps + (colour ? 0 : 1) + (exact ? 1 : 0));
  return { steps, label: steps === 0 ? 'Easy' : `Hard ${steps}` };
}
