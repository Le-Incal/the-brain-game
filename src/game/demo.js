/**
 * The guide's example (Kyle, 2026-10-11): an unscored word the guide catches
 * itself, to show how the game works. Words fall down the centre and land on
 * the first surface they meet, so the guide turns the word's region to the
 * top of the brain, tilted a little toward the player.
 *
 * Measured on the painted model (2026-10-11): for the regions below, a word
 * falling down the centre lands on the region at every tilt from 5 to 20
 * degrees. 12 degrees sits in the middle of that window.
 *
 * On the first Play of a visit the guide offers an example. The game starts
 * after 6 s of quiet (never more than 20 s without the player speaking), so
 * silence or "no" lets the player play.
 */

import { WORD_BANK } from '../data/regions';

export const DEMO_TILT_DEGREES = 12;
// About two seconds from the top of the screen to the top of the brain.
export const DEMO_FALL_SPEED = 0.12;

const DEMO_ORDER = ['VISION', 'SPEECH', 'BALANCE', 'TOUCH', 'HEARING', 'MOVEMENT'];
export const DEMO_WORDS = DEMO_ORDER.map((word) => WORD_BANK.find((entry) => entry.word === word));

/** The example for the nth request: each one shows something new. */
export const demoWord = (index) => DEMO_WORDS[((index % DEMO_WORDS.length) + DEMO_WORDS.length) % DEMO_WORDS.length];

export const TOUR_OFFER_QUIET_MS = 6000;
export const TOUR_OFFER_MAX_MS = 20_000;

export function createTourOffer({ onStart, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout, quietMs = TOUR_OFFER_QUIET_MS, maxMs = TOUR_OFFER_MAX_MS }) {
  let active = false;
  let speaking = false;
  let example = false;
  let quiet = null;
  let cap = null;

  const clear = (timer) => {
    if (timer !== null) clearTimeoutImpl(timer);
    return null;
  };

  function start() {
    if (!active) return;
    active = false;
    quiet = clear(quiet);
    cap = clear(cap);
    onStart();
  }

  function armQuiet() {
    quiet = clear(quiet);
    if (active && !speaking && !example) quiet = setTimeoutImpl(start, quietMs);
  }

  function armCap() {
    cap = clear(cap);
    if (active && !example) cap = setTimeoutImpl(start, maxMs);
  }

  return {
    begin() {
      active = true;
      example = false;
      armQuiet();
      armCap();
    },
    active: () => active,
    guideSpeaking(value) {
      speaking = Boolean(value);
      armQuiet();
    },
    /** A real exchange: the player answered, so the wait starts over. */
    visitorSpoke() {
      armQuiet();
      armCap();
    },
    exampleStarted() {
      example = true;
      quiet = clear(quiet);
      cap = clear(cap);
    },
    exampleEnded() {
      example = false;
      armQuiet();
      armCap();
    },
    cancel() {
      active = false;
      quiet = clear(quiet);
      cap = clear(cap);
    },
  };
}
