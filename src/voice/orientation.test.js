import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import regionGeometry from '../data/regionGeometry.json';
import {
  createControls,
  directionFromPivot,
  rotated,
  screenUpDirection,
  toCameraDirection,
} from '../test/voiceHarness.js';

// Imported defensively so each test fails on its own while the module is absent.
const orientation = await import('./orientation.js').catch(() => ({}));
const { VIEWS, VIEW_AXES, getViewFrame, orientationForView, orientationFacing } = orientation;

const SUPERIOR = [0, 1, 0];
const ANTERIOR = [0, 0, 1];

function liveFrame() {
  const { controls } = createControls();
  return { controls, frame: getViewFrame(controls.camera, controls.target) };
}

describe('A: view frame', () => {
  it('reads the camera direction and screen-up from the live controller', () => {
    const { controls, frame } = liveFrame();
    expect(frame.toCamera.distanceTo(toCameraDirection(controls))).toBeLessThan(1e-9);
    expect(frame.screenUp.distanceTo(screenUpDirection(controls))).toBeLessThan(1e-9);
    expect(Math.abs(frame.toCamera.dot(frame.screenUp))).toBeLessThan(1e-9);
  });
});

describe('A1: each standard view faces the viewer', () => {
  it('names the six views with their anatomical axes (+x left, +y superior, +z anterior)', () => {
    expect(VIEWS).toEqual(['left_lateral', 'right_lateral', 'anterior', 'posterior', 'superior', 'inferior']);
    expect(VIEW_AXES).toEqual({
      left_lateral: [1, 0, 0],
      right_lateral: [-1, 0, 0],
      anterior: [0, 0, 1],
      posterior: [0, 0, -1],
      superior: [0, 1, 0],
      inferior: [0, -1, 0],
    });
  });

  it.each(['left_lateral', 'right_lateral', 'anterior', 'posterior', 'superior', 'inferior'])(
    '%s turns its axis toward the camera (dot > 0.99)',
    (view) => {
      const { frame } = liveFrame();
      const quaternion = orientationForView(view, frame);
      expect(rotated(VIEW_AXES[view], quaternion).dot(frame.toCamera)).toBeGreaterThan(0.99);
    }
  );

  it('holds when the camera moves, because it reads the live camera', () => {
    const { controls } = createControls();
    controls.theta = 0.3;
    controls.phi = Math.PI * 0.3;
    controls.updateCamera();
    const frame = getViewFrame(controls.camera, controls.target);
    const quaternion = orientationForView('left_lateral', frame);
    expect(rotated([1, 0, 0], quaternion).dot(toCameraDirection(controls))).toBeGreaterThan(0.99);
  });
});

describe('A2: screen-up stays anatomical', () => {
  it.each(['left_lateral', 'right_lateral', 'anterior', 'posterior'])(
    '%s keeps superior toward screen-up',
    (view) => {
      const { frame } = liveFrame();
      const quaternion = orientationForView(view, frame);
      expect(rotated(SUPERIOR, quaternion).dot(frame.screenUp)).toBeGreaterThan(0.99);
    }
  );

  it.each(['superior', 'inferior'])('%s puts anterior toward screen-up (anatomy-plate convention)', (view) => {
    const { frame } = liveFrame();
    const quaternion = orientationForView(view, frame);
    expect(rotated(ANTERIOR, quaternion).dot(frame.screenUp)).toBeGreaterThan(0.99);
  });

  it.each([
    ['left', 'centroidLeft'],
    ['right', 'centroidRight'],
  ])('facing a lateral region (11, %s) keeps superior up, never upside down', (_side, key) => {
    const { frame } = liveFrame();
    const direction = directionFromPivot(regionGeometry.regions['11'][key]);
    const quaternion = orientationFacing(direction, frame);
    expect(direction.clone().applyQuaternion(quaternion).dot(frame.toCamera)).toBeGreaterThan(0.99);
    expect(rotated(SUPERIOR, quaternion).dot(frame.screenUp)).toBeGreaterThan(0.5);
  });

  it('falls back to anterior-up when the facing direction is vertical', () => {
    const { frame } = liveFrame();
    for (const direction of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)]) {
      const quaternion = orientationFacing(direction, frame);
      expect(Number.isFinite(quaternion.x + quaternion.y + quaternion.z + quaternion.w)).toBe(true);
      expect(direction.clone().applyQuaternion(quaternion).dot(frame.toCamera)).toBeGreaterThan(0.99);
      expect(rotated(ANTERIOR, quaternion).dot(frame.screenUp)).toBeGreaterThan(0.99);
    }
  });
});
