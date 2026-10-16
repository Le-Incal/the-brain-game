import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls } from '../test/voiceHarness.js';

const brainSceneModule = await import('./brainScene.js').catch(() => ({}));
const { regionPickingEnabled } = brainSceneModule;

// Kyle, 2026-10-15: on the landing page the visitor may drag and rotate the
// brain, "but they shouldn't be able to click any of the regions. Just rotate
// and look around the brain." The page stays composed: no zoom, no pan.

describe('Turning only, for the landing page', () => {
  it('ignores the wheel when zoom is off', () => {
    const { controls, element } = createControls({ zoom: false });
    const radius = controls.radius;
    element.dispatch('wheel', { deltaY: 240 });
    expect(controls.radius).toBe(radius);
  });

  it('still zooms everywhere else', () => {
    const { controls, element } = createControls();
    const radius = controls.radius;
    element.dispatch('wheel', { deltaY: 240 });
    expect(controls.radius).not.toBe(radius);
  });

  it('turns instead of panning on a shift-drag when pan is off', () => {
    const pans = [];
    const { controls, element } = createControls({ pan: false, onPan: (delta) => pans.push(delta) });
    element.dispatch('pointerdown', { shiftKey: true, clientX: 400, clientY: 300 });
    element.dispatch('pointermove', { clientX: 470, clientY: 300 });
    element.dispatch('pointerup', { clientX: 470, clientY: 300 });
    expect(pans).toEqual([]);
    expect(controls.targetQuaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.05);
  });
});

describe('Picking regions', () => {
  it('is on in the game, and off on the landing page', () => {
    expect(regionPickingEnabled({})).toBe(true);
    expect(regionPickingEnabled({ selectable: false })).toBe(false);
  });
});
