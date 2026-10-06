/**
 * Embodied gestures while the guide speaks: a slow sway on phrases and a
 * small nod on emphasis, one style for both guides, driven by the guide's
 * output level. At most about 2 degrees, eased in and out.
 *
 * Gestures rotate their own outer group in the scene, so facing a region,
 * the specimen-space conversion and the reported view are unaffected, and
 * they never count as the guide moving the brain.
 */

export const GESTURE_MAX_RADIANS = (2 * Math.PI) / 180;

const SWAY_SHARE = 0.85; // of the maximum, at full phrase level
const NOD_SHARE = 0.6;
const SWAY_HZ = 0.22; // a slow sway, about one cycle every 4.5 s
const PHRASE_SECONDS = 1.0; // the slow "phrase" level
const EMPHASIS_SECONDS = 0.35; // a beat louder than the phrase is emphasis
const ENVELOPE_SECONDS = 0.25; // gestures ease in and out
const OUTPUT_SECONDS = 0.2; // a last smoothing so no frame jumps

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const follow = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-dt / seconds));

export function createGesture() {
  return { phrase: 0, emphasis: 0, weight: 0, phase: 0, yaw: 0, pitch: 0 };
}

/** Advances the gesture one frame and returns its { yaw, pitch } in radians. */
export function stepGesture(state, { dtSeconds, level, suppressed }) {
  const dt = Math.max(0, Math.min(dtSeconds, 0.1));
  const voice = clamp01(level);
  state.phrase = follow(state.phrase, voice, dt, PHRASE_SECONDS);
  state.emphasis = follow(state.emphasis, Math.max(0, voice - state.phrase), dt, EMPHASIS_SECONDS);
  state.weight = follow(state.weight, suppressed ? 0 : 1, dt, ENVELOPE_SECONDS);
  state.phase = (state.phase + dt * 2 * Math.PI * SWAY_HZ) % (2 * Math.PI);

  const sway = GESTURE_MAX_RADIANS * SWAY_SHARE * Math.min(1, state.phrase * 1.6) * Math.sin(state.phase);
  const nod = -GESTURE_MAX_RADIANS * NOD_SHARE * Math.min(1, state.emphasis * 1.5);
  state.yaw = follow(state.yaw, sway * state.weight, dt, OUTPUT_SECONDS);
  state.pitch = follow(state.pitch, nod * state.weight, dt, OUTPUT_SECONDS);

  // Fully settled while suppressed: exactly still, not a lingering tremor.
  if (suppressed && state.weight < 1e-3 && Math.abs(state.yaw) < 1e-5 && Math.abs(state.pitch) < 1e-5) {
    state.weight = 0;
    state.yaw = 0;
    state.pitch = 0;
  }
  return { yaw: state.yaw, pitch: state.pitch };
}

/** Gestures give way to anything else directing attention, and to reduced motion. */
export function gestureSuppressed({ control, highlightedRegion, reducedMotion }) {
  return control !== 'guide_free' || (highlightedRegion !== null && highlightedRegion !== undefined) || Boolean(reducedMotion);
}
