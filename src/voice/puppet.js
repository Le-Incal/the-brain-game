/**
 * Puppet speech (Kyle, 2026-10-13): the brain "needs to feel embodied, as if a
 * puppet", so the voice seems to come from it. His pick: a quick dip of about
 * 2 degrees on every syllable, and a tilt of about 3 degrees to one side on
 * each phrase, alternating sides and settling at each stop. One character:
 * the welcome and the live guide speak the same way.
 *
 * It replaced a slow sway that moved only 0.18 degrees at the pace of her
 * syllables. Cues come from speechCues.js; the pose rides the gesture group,
 * so the orientation the guide reads is untouched.
 */

export const PUPPET_BEAT_DEGREES = 2;
export const PUPPET_TILT_DEGREES = 3;

// A beat rises to its dip in 0.1 s and is gone by about 0.4 s: s^2 e^(2(1 - s)), s = t / 0.1 s.
const BEAT_PEAK_SECONDS = 0.1;
// Only the latest few beats can still be seen.
const BEATS_KEPT = 3;
// The tilt eases through two followers, so it starts and stops softly.
const TILT_SECONDS = 0.12;
// Strength changes (lit, moved, held) fade over a quarter second.
const STRENGTH_SECONDS = 0.25;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const follow = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-dt / seconds));

function beatShape(ageSeconds) {
  const s = ageSeconds / BEAT_PEAK_SECONDS;
  return s * s * Math.exp(2 * (1 - s));
}

export function createPuppet() {
  return { time: 0, beats: [], side: -1, tiltTarget: 0, tiltA: 0, tiltB: 0, weight: null };
}

/**
 * Advances one frame and returns `{ pitch, roll }` in radians: pitch tips the
 * top toward the viewer (a dip), roll tilts about the line of sight.
 * `strength` (0 to 1) scales it, with the usual rules (gestures.js).
 */
export function stepPuppet(state, { dtSeconds, beat = false, phraseStart = false, speaking = false, strength = 1 }) {
  const dt = Math.max(0, Math.min(dtSeconds, 0.1));
  const target = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0));
  state.time += dt;

  // Nothing moves until the first frame says how strongly it may.
  if (state.weight === null) state.weight = target;
  else state.weight = follow(state.weight, target, dt, STRENGTH_SECONDS);
  if (target === 0 && state.weight < 1e-3) state.weight = 0;

  if (beat) {
    state.beats.push(state.time);
    if (state.beats.length > BEATS_KEPT) state.beats.shift();
  }
  if (phraseStart) {
    state.side = -state.side;
    state.tiltTarget = state.side;
  }
  if (!speaking) state.tiltTarget = 0;

  state.tiltA = follow(state.tiltA, state.tiltTarget, dt, TILT_SECONDS);
  state.tiltB = follow(state.tiltB, state.tiltA, dt, TILT_SECONDS);

  // The deepest of the recent beats, so overlapping syllables never add up.
  let dip = 0;
  for (const at of state.beats) dip = Math.max(dip, beatShape(state.time - at));

  return {
    pitch: toRadians(PUPPET_BEAT_DEGREES) * dip * state.weight,
    roll: toRadians(PUPPET_TILT_DEGREES) * state.tiltB * state.weight,
  };
}
