/**
 * Floating, once the guide's moves have settled (Kyle, 2026-10-10). While a
 * region or lobe stays lit the brain drifts gently around the view that shows
 * it, never far enough to lose it; when nothing is lit and the guide is quiet
 * it turns slowly, as if suspended. Nothing floats while the player holds or
 * explores it, while the guide moves it, with reduced motion, or outside a
 * conversation.
 *
 * The drift rides the gesture group, like the guide's gestures, so the
 * orientation the guide reads is untouched. The idle turn goes through the
 * orbit controller, so the view the guide reads stays true and a grab stops it.
 */

export const DRIFT_YAW_DEGREES = 6;
export const DRIFT_PITCH_DEGREES = 3;
export const DRIFT_CYCLE_SECONDS = 15;
// About 90 s a revolution.
export const IDLE_TURN_DEGREES_PER_SECOND = 4;

const ENVELOPE_SECONDS = 1.2;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** 'drift', 'turn' or 'still'. */
export function floatMode({ connected, waiting = false, control, lit, guideSpeaking, reducedMotion }) {
  if (reducedMotion || control !== 'guide_free') return 'still';
  // Outside a conversation it turns slowly only while it waits after its
  // introduction, until the visitor takes hold (Kyle, 2026-10-13).
  if (!connected) return waiting && !lit ? 'turn' : 'still';
  if (lit) return 'drift';
  // A view the guide is talking about holds still until the guide is quiet.
  return guideSpeaking ? 'still' : 'turn';
}

export function createDrift() {
  return { phase: 0, weight: 0 };
}

/** Advances the drift one frame and returns its { yaw, pitch } in radians, eased in and out. */
export function stepDrift(state, { dtSeconds, active }) {
  const dt = Math.max(0, Math.min(dtSeconds, 0.1));
  const target = active ? 1 : 0;
  state.weight += (target - state.weight) * (1 - Math.exp(-dt / ENVELOPE_SECONDS));
  if (!active && state.weight < 1e-3) {
    state.weight = 0;
    return { yaw: 0, pitch: 0 };
  }
  state.phase = (state.phase + (dt * 2 * Math.PI) / DRIFT_CYCLE_SECONDS) % (2 * Math.PI);
  // A slow ellipse around the best view.
  return {
    yaw: toRadians(DRIFT_YAW_DEGREES) * state.weight * Math.sin(state.phase),
    pitch: toRadians(DRIFT_PITCH_DEGREES) * state.weight * Math.cos(state.phase),
  };
}
