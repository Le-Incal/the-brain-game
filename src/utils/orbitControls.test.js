import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_FLIP_ANGLE,
  DEFAULT_MIN_FLIP_ANGLE,
  clampFlipAngle,
  dragToSpecimenVelocity,
  dragToVerticalPan,
  isClickGesture,
  projectTrackballVector,
  trackballDeltaQuaternion,
} from './orbitControls.js';
import * as THREE from 'three';

describe('dragToSpecimenVelocity', () => {
  it('moves the specimen upward for an upward drag', () => {
    expect(dragToSpecimenVelocity(0, -20, 0.005).flip).toBeGreaterThan(0);
  });

  it('moves the specimen downward for a downward drag', () => {
    expect(dragToSpecimenVelocity(0, 20, 0.005).flip).toBeLessThan(0);
  });

  it('turns the specimen right for a rightward drag', () => {
    expect(dragToSpecimenVelocity(20, 0, 0.005).yaw).toBeCloseTo(0.1);
  });
});

describe('shift-drag panning', () => {
  it('moves the specimen upward for an upward pointer drag', () => {
    expect(dragToVerticalPan(-50, 500)).toBeCloseTo(0.1);
  });

  it('moves the specimen downward for a downward pointer drag', () => {
    expect(dragToVerticalPan(50, 500)).toBeCloseTo(-0.1);
  });
});

describe('specimen flip limits', () => {
  it('starts at an upright specimen orientation', () => {
    expect(DEFAULT_MIN_FLIP_ANGLE).toBe(0);
  });

  it('permits a true 180-degree flip', () => {
    expect(DEFAULT_MAX_FLIP_ANGLE).toBe(Math.PI);
  });

  it('clamps flip angles without passing beyond either endpoint', () => {
    expect(clampFlipAngle(-1)).toBe(DEFAULT_MIN_FLIP_ANGLE);
    expect(clampFlipAngle(Math.PI + 1)).toBe(DEFAULT_MAX_FLIP_ANGLE);
  });
});

describe('virtual trackball', () => {
  it('continues rotating beyond the virtual sphere edge', () => {
    const nearEdge = projectTrackballVector(1.1, 0, new THREE.Vector3());
    const farther = projectTrackballVector(1.4, 0, new THREE.Vector3());

    expect(nearEdge.dot(farther)).toBeLessThan(0.9999);
  });

  it('moves a grabbed front-facing point upward with an upward pointer drag', () => {
    const previous = new THREE.Vector3(0, 0, 1);
    const current = new THREE.Vector3(0, 0.25, Math.sqrt(1 - 0.25 ** 2));
    const rotation = trackballDeltaQuaternion(previous, current);
    const movedPoint = previous.clone().applyQuaternion(rotation);

    expect(movedPoint.y).toBeGreaterThan(0);
    expect(movedPoint.y).toBeCloseTo(current.y);
  });

  it('moves a grabbed front-facing point right with a rightward pointer drag', () => {
    const previous = new THREE.Vector3(0, 0, 1);
    const current = new THREE.Vector3(0.25, 0, Math.sqrt(1 - 0.25 ** 2));
    const rotation = trackballDeltaQuaternion(previous, current);
    const movedPoint = previous.clone().applyQuaternion(rotation);

    expect(movedPoint.x).toBeGreaterThan(0);
    expect(movedPoint.x).toBeCloseTo(current.x);
  });
});

describe('click versus drag', () => {
  it('treats a small pointer movement as a click', () => {
    expect(isClickGesture(100, 100, 103, 104)).toBe(true);
  });

  it('does not select a region after rotating the specimen', () => {
    expect(isClickGesture(100, 100, 108, 100)).toBe(false);
  });
});
