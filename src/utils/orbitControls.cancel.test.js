import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls, installFakeClock, runFrames } from '../test/voiceHarness.js';

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

describe('M4: cancelling a programmatic move', () => {
  it('resolves the move with the reason and leaves the specimen where it is', async () => {
    const { controls, orientGroup } = createControls();
    const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const pending = controls.moveTo(target);
    await runFrames(controls, clock, 400);
    const stopped = orientGroup.quaternion.clone();
    controls.cancelMove('hidden');
    await expect(pending).resolves.toEqual({ completed: false, reason: 'hidden' });
    expect(controls.isMoving).toBe(false);
    await runFrames(controls, clock, 500);
    expect(orientGroup.quaternion.angleTo(stopped)).toBeLessThan(1e-6);
  });

  it('does nothing when no move is running', () => {
    const { controls } = createControls();
    expect(() => controls.cancelMove('hidden')).not.toThrow();
    expect(controls.isMoving).toBe(false);
  });
});
