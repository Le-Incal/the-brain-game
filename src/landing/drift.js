/**
 * The landing's drift (Kyle, 2026-10-16): "the brain should start slowly
 * drifting in counter clockwise rotate when a user enters the page." A
 * turntable, counter-clockwise seen from above, at the same 4 degrees a second
 * as the voice guide's floating in the game. It runs through the orbit
 * controller's idle turn, so a grab stops it at once; it drifts on from where
 * the visitor let go, 3 seconds after they let go. The gaze pauses it while the
 * brain looks at Enter and resumes it after. Visitors who ask for reduced
 * motion get a still brain.
 */

import { IDLE_TURN_DEGREES_PER_SECOND } from '../voice/floating.js';

export const DRIFT_DEGREES_PER_SECOND = IDLE_TURN_DEGREES_PER_SECOND;
export const DRIFT_RESUME_MS = 3000;

function defaultSchedule(fn, ms) {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

const STILL = Object.freeze({ stop() {}, pause() {}, resume() {} });

/** Starts the drift: `pause()`, `resume({ afterMs })`, and `stop()` for good. */
export function startDrift({ controls, reducedMotion = false, schedule = defaultSchedule }) {
  if (reducedMotion) return STILL;
  // A positive turn about +y: counter-clockwise looking down on the brain.
  const rate = (DRIFT_DEGREES_PER_SECOND * Math.PI) / 180;
  let cancelResume = null;
  const clearResume = () => {
    cancelResume?.();
    cancelResume = null;
  };

  function pause() {
    clearResume();
    controls.setIdleTurn(0);
  }

  function resume({ afterMs = 0 } = {}) {
    clearResume();
    if (afterMs <= 0) {
      controls.setIdleTurn(rate);
      return;
    }
    cancelResume = schedule(() => {
      cancelResume = null;
      controls.setIdleTurn(rate);
    }, afterMs);
  }

  resume();
  const unsubscribe = controls.subscribeUserInput((event) => {
    // A grab has already stopped the turn; a pending resume waits for the next release.
    if (event.type === 'grab') clearResume();
    if (event.type === 'release') resume({ afterMs: DRIFT_RESUME_MS });
  });

  return {
    pause,
    resume,
    stop() {
      clearResume();
      unsubscribe();
      controls.setIdleTurn(0);
    },
  };
}
