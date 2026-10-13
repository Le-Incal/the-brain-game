import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

const brainSceneModule = await import('./brainScene.js');
const { gestureQuaternion } = brainSceneModule;

// The guide's gestures ride their own group (the orientation the guide reads is
// untouched). Kyle, 2026-10-13: puppet speech adds a tilt to one side on each
// phrase, a roll about the line of sight, beside the sway and the nod.

const camera = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 100);
camera.position.set(4, 1.3, 0);
camera.lookAt(0, -0.06, 0);
camera.updateMatrixWorld();

const about = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
const cameraAxis = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(camera.quaternion).normalize();

describe('How a gesture turns the brain', () => {
  it('sways about the vertical', () => {
    expect(gestureQuaternion({ yaw: 0.05 }, camera.quaternion).angleTo(about(new THREE.Vector3(0, 1, 0), 0.05))).toBeLessThan(1e-9);
  });

  it("nods about the screen's horizontal", () => {
    expect(gestureQuaternion({ pitch: 0.04 }, camera.quaternion).angleTo(about(cameraAxis(1, 0, 0), 0.04))).toBeLessThan(1e-9);
  });

  it('tilts to one side about the line of sight', () => {
    expect(gestureQuaternion({ roll: 0.05 }, camera.quaternion).angleTo(about(cameraAxis(0, 0, 1), 0.05))).toBeLessThan(1e-9);
  });

  it('applies the sway, then the nod, then the tilt', () => {
    const expected = about(new THREE.Vector3(0, 1, 0), 0.03)
      .multiply(about(cameraAxis(1, 0, 0), 0.02))
      .multiply(about(cameraAxis(0, 0, 1), 0.04));
    // angleTo resolves about 3e-8 rad near zero (an acos near 1).
    expect(gestureQuaternion({ yaw: 0.03, pitch: 0.02, roll: 0.04 }, camera.quaternion).angleTo(expected)).toBeLessThan(1e-6);
  });

  it('is no turn at all when still', () => {
    expect(gestureQuaternion({}, camera.quaternion).angleTo(new THREE.Quaternion())).toBeLessThan(1e-9);
  });
});
