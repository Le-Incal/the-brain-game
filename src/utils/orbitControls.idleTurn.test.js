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

const RATE = THREE.MathUtils.degToRad(4);

// The idle turn floats the brain through the orbit controller, so the
// orientation the guide reads stays true and any grab stops it at once.
describe('Idle turn', () => {
  it('turns the specimen about the vertical at the rate it is given', async () => {
    const { controls, orientGroup } = createControls();
    const start = orientGroup.quaternion.clone();
    controls.setIdleTurn(RATE);
    await runFrames(controls, clock, 5000);
    const turned = THREE.MathUtils.radToDeg(orientGroup.quaternion.angleTo(start));
    expect(turned).toBeGreaterThan(17);
    expect(turned).toBeLessThan(21);
  });

  it('holds still at rate 0', async () => {
    const { controls, orientGroup } = createControls();
    controls.setIdleTurn(RATE);
    await runFrames(controls, clock, 1000);
    controls.setIdleTurn(0);
    await runFrames(controls, clock, 500);
    const held = orientGroup.quaternion.clone();
    await runFrames(controls, clock, 2000);
    expect(orientGroup.quaternion.angleTo(held)).toBeLessThan(1e-6);
  });

  it('stops at a grab and stays stopped until asked again', async () => {
    const { controls, orientGroup, element } = createControls();
    controls.setIdleTurn(RATE);
    await runFrames(controls, clock, 1000);
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    element.dispatch('pointerup', { clientX: 400, clientY: 300 });
    await runFrames(controls, clock, 500);
    const held = orientGroup.quaternion.clone();
    await runFrames(controls, clock, 2000);
    expect(orientGroup.quaternion.angleTo(held)).toBeLessThan(1e-6);
  });

  it('pauses for a programmatic move, which still lands exactly', async () => {
    const { controls, orientGroup } = createControls();
    controls.setIdleTurn(RATE);
    const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6);
    const move = controls.moveTo(target);
    await runFrames(controls, clock, 1300);
    expect((await move).completed).toBe(true);
    controls.setIdleTurn(0);
    expect(orientGroup.quaternion.angleTo(target)).toBeLessThan(0.02);
  });

  it('leaves auto-rotate off', () => {
    const { controls } = createControls();
    controls.setIdleTurn(RATE);
    expect(controls.autoRotate).toBe(false);
  });
});
