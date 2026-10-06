/**
 * If the guide finishes speaking at a tour stop and nothing moves the tour
 * on (no next stop, no end, no word or grab from the player), the app nudges
 * it once. Nothing moves without a call, so the lights never drift out of
 * step with the narration.
 */
import { formatTourWaiting } from './contextUpdates.js';

export const TOUR_STALL_MS = 8000;

export function createTourStallGuard({ send, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout }) {
  let stop = null;
  let spokeAtStop = false;
  let nudged = false;
  let timer = null;

  const cancel = () => {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  };

  return {
    stopShown({ stop: number, of }) {
      cancel();
      stop = { stop: number, of };
      spokeAtStop = false;
      nudged = false;
    },
    tourEnded() {
      cancel();
      stop = null;
    },
    playerActivity() {
      cancel();
    },
    guideSpeaking(speaking) {
      if (!stop) return;
      if (speaking) {
        spokeAtStop = true;
        cancel();
        return;
      }
      if (!spokeAtStop || nudged || timer !== null) return;
      timer = setTimeoutImpl(() => {
        timer = null;
        nudged = true;
        send(formatTourWaiting(stop));
      }, TOUR_STALL_MS);
    },
  };
}
