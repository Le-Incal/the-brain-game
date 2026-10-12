/**
 * The game coach (Kyle, 2026-10-11). It watches each word's outcome and tells
 * the guide when the player is on a streak or struggling, with the steps the
 * guide may offer. The player picks the step; the coach only notices.
 *
 *   harder: "faster" or "colours off"; once the colours are off and the words
 *           fall at 1.5x or more, "the exact region" instead of the lobe
 *   easier: "slower" or "colours back on"; "the lobe again" first if the
 *           exact region is asked
 */

import { gameLevel, MAX_SPEED, MIN_SPEED } from './levels.js';

export const STREAK_LENGTH = 5;
export const STRUGGLE_IN_A_ROW = 3;
export const STRUGGLE_WINDOW = { missed: 4, of: 6 };
export const COOLDOWN_WORDS = 6;

function harderOffers({ speed, colour, exact }) {
  const canGoFaster = speed < MAX_SPEED;
  if (colour) return [...(canGoFaster ? ['faster'] : []), 'colours off'];
  if (!exact && speed >= 1.5) return ['the exact region'];
  return canGoFaster ? ['faster'] : [];
}

function easierOffers({ speed, colour, exact }) {
  const offers = [];
  if (exact) offers.push('the lobe again');
  if (speed > MIN_SPEED) offers.push('slower');
  if (!colour) offers.push('colours back on');
  return offers.slice(0, 2);
}

export function createGameCoach() {
  let recent = [];
  let caughtInARow = 0;
  let missedInARow = 0;
  let quietFor = 0;

  function reset() {
    recent = [];
    caughtInARow = 0;
    missedInARow = 0;
    quietFor = 0;
  }

  function result(outcome, settings) {
    const caught = outcome === 'correct';
    recent = [...recent, caught].slice(-STRUGGLE_WINDOW.of);
    caughtInARow = caught ? caughtInARow + 1 : 0;
    missedInARow = caught ? 0 : missedInARow + 1;
    if (quietFor > 0) {
      quietFor -= 1;
      return null;
    }
    const { label: level } = gameLevel(settings);
    const missed = recent.filter((was) => !was).length;
    let signal = null;
    if (caughtInARow >= STREAK_LENGTH) {
      signal = { kind: 'streak', count: caughtInARow, offers: harderOffers(settings) };
    } else if (missedInARow >= STRUGGLE_IN_A_ROW) {
      signal = { kind: 'struggling', inARow: missedInARow, offers: easierOffers(settings) };
    } else if (missed >= STRUGGLE_WINDOW.missed) {
      signal = { kind: 'struggling', missed, of: recent.length, offers: easierOffers(settings) };
    }
    if (!signal) return null;
    quietFor = COOLDOWN_WORDS;
    return { ...signal, level, settings: { ...settings } };
  }

  return {
    result,
    reset,
    /** A new level needs new evidence. */
    settingsChanged() {
      recent = [];
      caughtInARow = 0;
      missedInARow = 0;
    },
  };
}
