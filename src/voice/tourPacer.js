/**
 * The tour moves in lockstep with the guide's voice: next_tour_stop is
 * refused until the guide has spoken about the stop it is at. Each stop
 * answers as soon as the brain arrives, so without this the model could call
 * it again and again before saying a word, and the brain would race ahead of
 * the narration. ElevenLabs runs next_tour_stop post_tool_speech, so an honest
 * call arrives after the narration's audio; this catches only chaining.
 *
 * Speech is measured from the SDK's mode changes, counting only what is said
 * after the stop arrived. If that measure ever fails, a stop still passes
 * after 20 s: a tour that stalls forever is worse than one early move.
 */
import { TOUR_ORDER } from './lobes.js';

export const TOUR_STOP_MIN_SPEECH_MS = 8000;
export const TOUR_STOP_PASS_AFTER_MS = 20000;

// The speech measured when a call was refused, for the session summary. A
// symbol key, so JSON.stringify leaves it out of the agent's answer.
export const GATE_REFUSAL = Symbol('gateRefusal');

const refusal = (reason, instruction, spokenMs) => ({
  ok: false,
  did: '',
  reason,
  instruction,
  [GATE_REFUSAL]: { spokenMs: Math.round(spokenMs) },
});

export function createTourPacer({ now = Date.now } = {}) {
  let speakingSince = null;
  // null outside a tour. index: the stop shown, -1 before the first.
  let tour = null;

  const spokenMs = () => tour.spokenMs + (speakingSince === null ? 0 : now() - Math.max(speakingSince, tour.arrivedAt));

  function atStop(index) {
    tour = { index, arrivedAt: now(), spokenMs: 0, inFlight: false };
  }

  return {
    guideSpeaking(speaking) {
      if (speaking) {
        speakingSince ??= now();
        return;
      }
      if (speakingSince !== null && tour) tour.spokenMs += now() - Math.max(speakingSince, tour.arrivedAt);
      speakingSince = null;
    },

    tourStarted() {
      atStop(-1);
    },

    tourEnded() {
      tour = null;
    },

    /** null if next_tour_stop may go ahead (it is then on its way), else the refusal for the agent. */
    request() {
      if (!tour) return null;
      if (tour.inFlight) {
        const coming = TOUR_ORDER[tour.index + 1];
        return refusal(
          `I am still turning to my ${coming}.`,
          `Wait for next_tour_stop to answer, describe the ${coming}, then call next_tour_stop.`,
          spokenMs()
        );
      }
      const welcome = tour.index < 0;
      const waited = now() - tour.arrivedAt >= TOUR_STOP_PASS_AFTER_MS;
      const spoken = spokenMs();
      if (!welcome && !waited && spoken < TOUR_STOP_MIN_SPEECH_MS) {
        const lobe = TOUR_ORDER[tour.index];
        return refusal(
          `The tour waits until I have spoken about my ${lobe}.`,
          `Describe the ${lobe} first (two or three sentences), then call next_tour_stop.`,
          spoken
        );
      }
      tour.inFlight = true;
      return null;
    },

    /** What next_tour_stop answered: a new stop, the end of the tour, or a failure. */
    arrived(result) {
      if (!tour) return;
      if (result?.done) {
        tour = null;
        return;
      }
      const index = TOUR_ORDER.indexOf(result?.lobe);
      if (Number.isInteger(result?.stop) && index >= 0) {
        atStop(index);
        return;
      }
      tour.inFlight = false;
    },
  };
}
