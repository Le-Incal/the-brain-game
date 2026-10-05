/**
 * The guide's speaking level drives the uVoiceLevel shader uniform. Speech
 * envelopes are jumpy, so the level rises quickly and falls back slowly.
 */
const ATTACK_PER_SECOND = 18;
const RELEASE_PER_SECOND = 5;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function smoothVoiceLevel(current, target, dtSeconds) {
  const from = Number.isFinite(current) ? clamp01(current) : 0;
  const to = Number.isFinite(target) ? clamp01(target) : 0;
  const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
  const rate = to > from ? ATTACK_PER_SECOND : RELEASE_PER_SECOND;
  return clamp01(from + (to - from) * (1 - Math.exp(-rate * dt)));
}

/**
 * A deterministic stand-in for a speaking voice until M4 supplies the real
 * output volume: syllable-rate bursts under a slower phrase envelope.
 */
export function mockVoiceLevel(timeMs) {
  const t = timeMs / 1000;
  const syllables = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 4.3);
  const phrase = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.35 + 1.1);
  return clamp01(syllables * (0.35 + 0.65 * phrase));
}
