import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls, flushMicrotasks, FRAME_MS, installFakeClock, runFrames } from '../test/voiceHarness.js';

// The welcome spin (Kyle, 2026-10-11) follows a path rather than easing
// between two poses, so the controller gains a path move beside moveTo. It
// obeys the same rules as every guide move: a grab ends it where it is, a
// later move replaces it, and the arrival turn waits while it runs.

const UP = new THREE.Vector3(0, 1, 0);
const PATH_MS = 3000;

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

// A full turn about the vertical, linear in progress.
const fullTurn = (progress) => new THREE.Quaternion().setFromAxisAngle(UP, progress * Math.PI * 2);

describe('A path move', () => {
  it('places the specimen on the path at each moment, and resolves at the end', async () => {
    const { controls, orientGroup } = createControls();
    const result = controls.followPath(fullTurn, { durationMs: PATH_MS });
    expect(controls.isMoving).toBe(true);

    await runFrames(controls, clock, PATH_MS / 4);
    expect(orientGroup.quaternion.angleTo(fullTurn(0.25))).toBeLessThan(0.05);

    await runFrames(controls, clock, PATH_MS / 2);
    expect(orientGroup.quaternion.angleTo(fullTurn(0.75))).toBeLessThan(0.05);

    await runFrames(controls, clock, PATH_MS / 4 + FRAME_MS * 2);
    await expect(result).resolves.toEqual({ completed: true });
    expect(controls.isMoving).toBe(false);
    expect(orientGroup.quaternion.angleTo(fullTurn(1))).toBeLessThan(1e-6);
  });

  it('stays where the path ended once it is done', async () => {
    const { controls, orientGroup } = createControls();
    const end = new THREE.Quaternion().setFromAxisAngle(UP, 1);
    controls.followPath((p) => new THREE.Quaternion().slerp(end, p), { durationMs: 500 });
    await runFrames(controls, clock, 600);
    await runFrames(controls, clock, 500);
    expect(orientGroup.quaternion.angleTo(end)).toBeLessThan(1e-6);
  });

  it('ends at once where it is when the player grabs', async () => {
    const { controls, orientGroup, element } = createControls();
    const result = controls.followPath(fullTurn, { durationMs: PATH_MS });
    await runFrames(controls, clock, PATH_MS / 3);
    const grabbed = orientGroup.quaternion.clone();

    element.dispatch('pointerdown');
    await flushMicrotasks();
    await expect(result).resolves.toEqual({ completed: false, reason: 'user' });

    await runFrames(controls, clock, 500);
    expect(orientGroup.quaternion.angleTo(grabbed)).toBeLessThan(1e-6);
    element.dispatch('pointerup');
  });

  it('is replaced by a later move', async () => {
    const { controls } = createControls();
    const result = controls.followPath(fullTurn, { durationMs: PATH_MS });
    await runFrames(controls, clock, 300);
    controls.moveTo(new THREE.Quaternion());
    await expect(result).resolves.toEqual({ completed: false, reason: 'superseded' });
  });

  it('can be cancelled like any move', async () => {
    const { controls } = createControls();
    const result = controls.followPath(fullTurn, { durationMs: PATH_MS });
    controls.cancelMove('hidden');
    await expect(result).resolves.toEqual({ completed: false, reason: 'hidden' });
  });

  it('pauses the arrival turn while it runs, and leaves it on', async () => {
    const { controls, orientGroup } = createControls({ autoRotate: true });
    const result = controls.followPath(fullTurn, { durationMs: PATH_MS });
    await runFrames(controls, clock, PATH_MS / 2);
    expect(orientGroup.quaternion.angleTo(fullTurn(0.5))).toBeLessThan(0.05);
    await runFrames(controls, clock, PATH_MS / 2 + FRAME_MS * 2);
    await expect(result).resolves.toEqual({ completed: true });
    expect(controls.autoRotate).toBe(true);
  });

  it('is not the player touching the brain', async () => {
    let interactions = 0;
    const { controls } = createControls({ onFirstInteraction: () => (interactions += 1) });
    controls.followPath(fullTurn, { durationMs: 300 });
    await runFrames(controls, clock, 400);
    expect(interactions).toBe(0);
    expect(controls.hasInteracted).toBe(false);
  });
});

describe('Whether the visitor has touched the brain yet', () => {
  it('is false on arrival', () => {
    const { controls } = createControls();
    expect(controls.hasInteracted).toBe(false);
  });

  it('is true after a grab', () => {
    const { controls, element } = createControls();
    element.dispatch('pointerdown');
    element.dispatch('pointerup');
    expect(controls.hasInteracted).toBe(true);
  });

  it('is true after a zoom', () => {
    const { controls, element } = createControls();
    element.dispatch('wheel', { deltaY: 50 });
    expect(controls.hasInteracted).toBe(true);
  });
});

// The welcome's demonstration selects a region at a moment in the tour, so
// a path move reports how far along it is on every frame.
describe('A path move reports its progress', () => {
  it('on every frame, rising to exactly 1 at the end', async () => {
    const { controls } = createControls();
    const steps = [];
    const result = controls.followPath(fullTurn, { durationMs: 300, onStep: (progress) => steps.push(progress) });
    await runFrames(controls, clock, 400);
    await result;
    expect(steps.length).toBeGreaterThanOrEqual(17);
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps.at(-1)).toBe(1);
  });

  it('stops reporting once a grab ends it', async () => {
    const { controls, element } = createControls();
    const steps = [];
    controls.followPath(fullTurn, { durationMs: 1000, onStep: (progress) => steps.push(progress) });
    await runFrames(controls, clock, 300);
    element.dispatch('pointerdown');
    const count = steps.length;
    await runFrames(controls, clock, 300);
    expect(steps.length).toBe(count);
    element.dispatch('pointerup');
  });
});
