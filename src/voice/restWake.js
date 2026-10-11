/**
 * One conversation on screen, many sessions underneath (Kyle, 2026-10-11).
 * The live session rests after 30 s with no speech and no writing, or soon
 * after the tab is hidden, and wakes when the visitor speaks or writes.
 * Nothing on screen says it ended.
 */

export const REST_AFTER_SILENCE_MS = 30_000;
export const HIDDEN_REST_MS = 10_000;
// A voice level held this long above this threshold is the visitor speaking.
export const ONSET_LEVEL = 0.06;
export const ONSET_HOLD_MS = 150;
const ONSET_REARM_MS = 1500;

/** Decides when a connected conversation rests: `onRest('silence' | 'hidden')`, once. */
export function createRestTimer({
  onRest,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  restAfterMs = REST_AFTER_SILENCE_MS,
  hiddenAfterMs = HIDDEN_REST_MS,
}) {
  let isConnected = false;
  let speaking = false;
  let isHidden = false;
  let timer = null;
  let rested = false;

  function clear() {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  }

  function arm() {
    clear();
    if (!isConnected || rested) return;
    if (isHidden) {
      timer = setTimeoutImpl(() => fire('hidden'), hiddenAfterMs);
      return;
    }
    if (speaking) return;
    timer = setTimeoutImpl(() => fire('silence'), restAfterMs);
  }

  function fire(reason) {
    timer = null;
    if (!isConnected || rested) return;
    rested = true;
    onRest(reason);
  }

  return {
    connected(value) {
      isConnected = Boolean(value);
      if (isConnected) rested = false;
      arm();
    },
    guideSpeaking(value) {
      speaking = Boolean(value);
      arm();
    },
    activity() {
      arm();
    },
    hidden(value) {
      isHidden = Boolean(value);
      arm();
    },
    dispose: clear,
  };
}

/** Hears the visitor begin to speak from a stream of levels: `onOnset()` once per utterance. */
export function createSpeechOnset({ onOnset, now = () => performance.now(), level = ONSET_LEVEL, holdMs = ONSET_HOLD_MS }) {
  let aboveSince = null;
  let firedAt = -Infinity;
  return {
    level(value) {
      const at = now();
      if (Number(value) >= level) {
        aboveSince ??= at;
        if (at - aboveSince >= holdMs && at - firedAt >= ONSET_REARM_MS) {
          firedAt = at;
          onOnset();
        }
      } else {
        aboveSince = null;
      }
    },
  };
}
