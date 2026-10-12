import { describe, expect, it } from 'vitest';
import { mockVoiceLevel } from './voiceLevel.js';

const gestureModule = await import('./gestures.js').catch(() => ({}));
const { GESTURE_MAX_RADIANS, WELCOME_GESTURE_SCALE, createGesture, stepGesture, gestureStrength } = gestureModule;

const FRAME = 1 / 60;

function run({ seconds, level = (t) => mockVoiceLevel(t * 1000), suppressed = () => false, gesture = createGesture?.() }) {
  const frames = [];
  for (let i = 0; i < Math.round(seconds / FRAME); i += 1) {
    const t = i * FRAME;
    frames.push(stepGesture(gesture, { dtSeconds: FRAME, level: level(t), suppressed: suppressed(t) }));
  }
  return { frames, gesture };
}

// One style for both guides: a slow sway on phrases and a small nod on
// emphasis, driven by the guide's output level, at most about 2 degrees.
describe('Embodied gestures while the guide speaks', () => {
  it('stays within about 2 degrees', () => {
    expect(GESTURE_MAX_RADIANS).toBeCloseTo((2 * Math.PI) / 180, 6);
    const { frames } = run({ seconds: 30 });
    for (const { yaw, pitch } of frames) {
      expect(Math.abs(yaw)).toBeLessThanOrEqual(GESTURE_MAX_RADIANS);
      expect(Math.abs(pitch)).toBeLessThanOrEqual(GESTURE_MAX_RADIANS);
    }
  });

  it('sways and nods while speaking', () => {
    const { frames } = run({ seconds: 20 });
    expect(Math.max(...frames.map(({ yaw }) => Math.abs(yaw)))).toBeGreaterThan(GESTURE_MAX_RADIANS * 0.2);
    expect(Math.max(...frames.map(({ pitch }) => Math.abs(pitch)))).toBeGreaterThan(GESTURE_MAX_RADIANS * 0.1);
  });

  it('is smooth: no frame jumps more than a small step', () => {
    const switching = (t) => t > 5 && t < 9;
    const { frames } = run({ seconds: 15, suppressed: switching });
    for (let i = 1; i < frames.length; i += 1) {
      expect(Math.abs(frames[i].yaw - frames[i - 1].yaw)).toBeLessThan(GESTURE_MAX_RADIANS * 0.05);
      expect(Math.abs(frames[i].pitch - frames[i - 1].pitch)).toBeLessThan(GESTURE_MAX_RADIANS * 0.05);
    }
  });

  it('is exactly zero while suppressed from the start', () => {
    const { frames } = run({ seconds: 10, suppressed: () => true });
    expect(frames.every(({ yaw, pitch }) => yaw === 0 && pitch === 0)).toBe(true);
  });

  it('fades to zero when suppressed mid-speech, and settles in silence', () => {
    const gesture = createGesture();
    run({ seconds: 6, gesture });
    const { frames } = run({ seconds: 2, suppressed: () => true, gesture });
    expect(Math.abs(frames.at(-1).yaw)).toBeLessThan(1e-4);
    expect(Math.abs(frames.at(-1).pitch)).toBeLessThan(1e-4);

    const quiet = createGesture();
    run({ seconds: 6, gesture: quiet });
    const silent = run({ seconds: 4, level: () => 0, gesture: quiet }).frames;
    expect(Math.abs(silent.at(-1).yaw)).toBeLessThan(1e-3);
    expect(Math.abs(silent.at(-1).pitch)).toBeLessThan(1e-3);
  });

  // Kyle, 2026-10-06: a lit region kept the brain dead while the guide
  // talked. Lit and still now means half strength; moving, showcasing, held
  // or explored still means none.
  it('runs at full strength when free, half while a region or lobe stays lit, none otherwise', () => {
    const free = { control: 'guide_free', highlighted: false, reducedMotion: false };
    expect(gestureStrength(free)).toBe(1);
    expect(gestureStrength({ ...free, highlighted: true })).toBe(0.5);
    for (const control of ['guide_moving', 'player_holding', 'player_exploring']) {
      expect(gestureStrength({ ...free, control }), control).toBe(0);
      expect(gestureStrength({ ...free, control, highlighted: true }), control).toBe(0);
    }
    expect(gestureStrength({ ...free, reducedMotion: true })).toBe(0);
  });

  // Kyle, 2026-10-11: the brain should move as if it is talking while it
  // welcomes the visitor; stronger for the welcome only, the conversation unchanged.
  describe('the welcome, twice as large', () => {
    // A steady voice with a syllable beat about three times a second.
    const speech = (t) => 0.7 + 0.3 * Math.sin(2 * Math.PI * 3 * t);
    const runScaled = ({ seconds, scale, level = speech, gesture = createGesture() }) => {
      const frames = [];
      for (let i = 0; i < Math.round(seconds / FRAME); i += 1) {
        frames.push(stepGesture(gesture, { dtSeconds: FRAME, level: level(i * FRAME), scale: scale(i * FRAME) }));
      }
      return frames;
    };

    it('is twice the size', () => {
      expect(WELCOME_GESTURE_SCALE).toBe(2);
    });

    it('goes beyond the usual 2 degrees but stays within 4', () => {
      const frames = runScaled({ seconds: 20, scale: () => WELCOME_GESTURE_SCALE });
      const largest = Math.max(...frames.map(({ yaw, pitch }) => Math.max(Math.abs(yaw), Math.abs(pitch))));
      expect(largest).toBeGreaterThan(GESTURE_MAX_RADIANS);
      expect(largest).toBeLessThanOrEqual(GESTURE_MAX_RADIANS * WELCOME_GESTURE_SCALE);
    });

    it('leaves the usual size unchanged when no scale is given', () => {
      const plain = createGesture();
      const scaled = createGesture();
      for (let i = 0; i < 600; i += 1) {
        const level = speech(i * FRAME);
        const a = stepGesture(plain, { dtSeconds: FRAME, level });
        const b = stepGesture(scaled, { dtSeconds: FRAME, level, scale: 1 });
        expect(a).toEqual(b);
      }
    });

    it('changes size without a jump when the welcome ends', () => {
      const frames = runScaled({ seconds: 12, scale: (t) => (t < 6 ? WELCOME_GESTURE_SCALE : 1) });
      for (let i = 1; i < frames.length; i += 1) {
        expect(Math.abs(frames[i].yaw - frames[i - 1].yaw)).toBeLessThan(GESTURE_MAX_RADIANS * 0.1);
        expect(Math.abs(frames[i].pitch - frames[i - 1].pitch)).toBeLessThan(GESTURE_MAX_RADIANS * 0.1);
      }
    });
  });

  it('half strength stays within half the amplitude', () => {
    const gesture = createGesture();
    const frames = [];
    for (let i = 0; i < 60 * 20; i += 1) {
      frames.push(stepGesture(gesture, { dtSeconds: FRAME, level: mockVoiceLevel(i * FRAME * 1000), strength: 0.5 }));
    }
    for (const { yaw, pitch } of frames) {
      expect(Math.abs(yaw)).toBeLessThanOrEqual(GESTURE_MAX_RADIANS / 2);
      expect(Math.abs(pitch)).toBeLessThanOrEqual(GESTURE_MAX_RADIANS / 2);
    }
  });
});
