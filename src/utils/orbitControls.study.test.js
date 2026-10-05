import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createControls, installFakeClock, runFrames } from '../test/voiceHarness.js';

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

describe('M2: Study mode stops auto-rotate', () => {
  // Without this, the specimen drifts away from a region the guide just faced.
  it('stops the spin so a faced region stays faced', async () => {
    const { controls, orientGroup } = createControls({ autoRotate: true });
    controls.stopAutoRotate();
    const settled = orientGroup.quaternion.clone();
    await runFrames(controls, clock, 2000);
    expect(controls.autoRotate).toBe(false);
    expect(orientGroup.quaternion.angleTo(settled)).toBeLessThan(1e-6);
  });

  it('is not counted as the player interacting', () => {
    let interactions = 0;
    const { controls, element } = createControls({
      autoRotate: true,
      onFirstInteraction: () => (interactions += 1),
    });
    controls.stopAutoRotate();
    expect(interactions).toBe(0);

    element.dispatch('pointerdown');
    element.dispatch('pointerup');
    expect(interactions).toBe(1);
  });

  it("leaves the player's own controls unchanged", async () => {
    const { controls, orientGroup, element } = createControls({ autoRotate: true });
    const before = {
      radius: controls.radius,
      theta: controls.theta,
      phi: controls.phi,
      rotationSmoothing: controls.rotationSmoothing,
    };
    controls.stopAutoRotate();
    expect({
      radius: controls.radius,
      theta: controls.theta,
      phi: controls.phi,
      rotationSmoothing: controls.rotationSmoothing,
    }).toEqual(before);

    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    const grabbed = orientGroup.quaternion.clone();
    element.dispatch('pointermove', { clientX: 470, clientY: 300 });
    await runFrames(controls, clock, 200);
    element.dispatch('pointerup', { clientX: 470, clientY: 300 });
    expect(orientGroup.quaternion.angleTo(grabbed)).toBeGreaterThan(0.05);

    element.dispatch('wheel', { deltaY: 100 });
    expect(controls.radius).not.toBe(before.radius);
  });
});
