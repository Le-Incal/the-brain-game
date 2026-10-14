/**
 * Kyle, 2026-10-13: "Have a custom welcome for each button if the first
 * welcome never plays". A press on Study the Brain or the Brain Game, before
 * the arrival welcome has been heard, plays that choice's own welcome instead.
 * The press itself lets the browser play sound, so she is heard.
 */

const UNHEARD = new Set(['none', 'held']);
const PLAYING = new Set(['greeting', 'audible']);

/** 'play' the choice's welcome, 'stop' the one playing, or 'none'. */
export function choiceWelcomeAction({ welcomeState, currentKind, voiceChosen = false }) {
  if (currentKind !== 'arrival' && PLAYING.has(welcomeState)) return 'stop';
  if (voiceChosen) return 'none';
  return UNHEARD.has(welcomeState) ? 'play' : 'none';
}

/**
 * Holds the Brain Game's countdown until she finishes its welcome (Kyle,
 * 2026-10-13: "Hold the countdown"). A cancelled hold, or a newer one, never
 * starts the game.
 */
export function createIntroHold() {
  let current = null;
  return {
    start(finished, then) {
      const token = {};
      current = token;
      Promise.resolve(finished).then(() => {
        if (current !== token) return;
        current = null;
        then();
      });
    },
    active: () => current !== null,
    /** True if a hold was waiting. */
    cancel() {
      const was = current !== null;
      current = null;
      return was;
    },
  };
}
