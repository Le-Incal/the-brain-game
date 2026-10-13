import { describe, expect, it } from 'vitest';

const floatingModule = await import('./floating.js').catch(() => ({}));
const { floatMode, createDrift, stepDrift, DRIFT_YAW_DEGREES, DRIFT_PITCH_DEGREES, DRIFT_CYCLE_SECONDS, IDLE_TURN_DEGREES_PER_SECOND } =
  floatingModule;

const deg = (radians) => (radians * 180) / Math.PI;
const base = { connected: true, control: 'guide_free', lit: false, guideSpeaking: false, reducedMotion: false };

// Kyle: after the first movements, the brain can float. While something is lit
// it drifts gently around the best view; when nothing is lit it turns slowly.
describe('Floating: which kind, when', () => {
  it('drifts while a region or lobe stays lit', () => {
    expect(floatMode({ ...base, lit: true })).toBe('drift');
    expect(floatMode({ ...base, lit: true, guideSpeaking: true })).toBe('drift');
  });

  it('turns slowly when nothing is lit and the guide is quiet', () => {
    expect(floatMode(base)).toBe('turn');
  });

  it('holds still while the guide talks about a view with nothing lit', () => {
    expect(floatMode({ ...base, guideSpeaking: true })).toBe('still');
  });

  it.each(['guide_moving', 'player_holding', 'player_exploring'])('holds still while %s', (control) => {
    expect(floatMode({ ...base, control, lit: true })).toBe('still');
    expect(floatMode({ ...base, control })).toBe('still');
  });

  it('holds still with reduced motion, and outside a conversation', () => {
    expect(floatMode({ ...base, reducedMotion: true, lit: true })).toBe('still');
    expect(floatMode({ ...base, connected: false, lit: true })).toBe('still');
    expect(floatMode({ ...base, connected: false })).toBe('still');
  });
});

// Kyle, 2026-10-13: when the introduction finishes the brain goes back into a
// slow free turn while it waits, until the visitor takes hold (4 degrees a second).
describe('Floating: waiting after the introduction', () => {
  const waiting = { ...base, connected: false, waiting: true };

  it('turns slowly while it waits, outside a conversation', () => {
    expect(floatMode(waiting)).toBe('turn');
    expect(IDLE_TURN_DEGREES_PER_SECOND).toBe(4);
  });

  it('holds still with reduced motion, while held or moved, or with something lit', () => {
    expect(floatMode({ ...waiting, reducedMotion: true })).toBe('still');
    expect(floatMode({ ...waiting, control: 'player_holding' })).toBe('still');
    expect(floatMode({ ...waiting, control: 'guide_moving' })).toBe('still');
    expect(floatMode({ ...waiting, lit: true })).toBe('still');
  });

  it('holds still outside a conversation when it is not waiting', () => {
    expect(floatMode({ ...waiting, waiting: false })).toBe('still');
  });
});

describe('Floating: the drift', () => {
  function run(seconds, active, state = createDrift(), dt = 1 / 60) {
    const samples = [];
    for (let t = 0; t < seconds; t += dt) samples.push(stepDrift(state, { dtSeconds: dt, active }));
    return { samples, state };
  }

  it('is about 6 degrees of turn and 3 of tilt over about 15 s', () => {
    expect(DRIFT_YAW_DEGREES).toBe(6);
    expect(DRIFT_PITCH_DEGREES).toBe(3);
    expect(DRIFT_CYCLE_SECONDS).toBe(15);
  });

  it('never strays further than that, so the lit part stays in view', () => {
    const { samples } = run(60, true);
    const yaw = Math.max(...samples.map((s) => Math.abs(deg(s.yaw))));
    const pitch = Math.max(...samples.map((s) => Math.abs(deg(s.pitch))));
    expect(yaw).toBeLessThanOrEqual(6 + 1e-9);
    expect(yaw).toBeGreaterThan(5);
    expect(pitch).toBeLessThanOrEqual(3 + 1e-9);
    expect(pitch).toBeGreaterThan(2.5);
  });

  it('eases in rather than jumping', () => {
    const { samples } = run(0.5, true);
    expect(Math.max(...samples.map((s) => Math.abs(deg(s.yaw))))).toBeLessThan(1);
  });

  it('swings each way about once per 15 s cycle', () => {
    const { samples } = run(30, true);
    const signs = samples.map((s) => Math.sign(s.yaw)).filter(Boolean);
    const changes = signs.filter((sign, i) => i > 0 && sign !== signs[i - 1]).length;
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(changes).toBeLessThanOrEqual(5);
  });

  it('eases out to exactly still when it stops', () => {
    const { state } = run(20, true);
    const { samples } = run(10, false, state);
    expect(samples.at(-1)).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe('Floating: the idle turn', () => {
  it('is a slow full turn, about 90 s a revolution', () => {
    expect(IDLE_TURN_DEGREES_PER_SECOND).toBe(4);
  });
});
