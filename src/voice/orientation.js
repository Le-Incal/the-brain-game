/**
 * Orientation math for the voice scene layer.
 *
 * "Facing" means facing the viewer on screen. The camera sits above level and
 * may move, so every orientation is solved against the live camera: its
 * direction toward the viewer and its screen-up, never world +x or +y.
 * Anatomical axes: +x is the specimen's left, +y superior, +z anterior.
 */

import * as THREE from 'three';

export const VIEWS = ['left_lateral', 'right_lateral', 'anterior', 'posterior', 'superior', 'inferior'];

export const VIEW_AXES = {
  left_lateral: [1, 0, 0],
  right_lateral: [-1, 0, 0],
  anterior: [0, 0, 1],
  posterior: [0, 0, -1],
  superior: [0, 1, 0],
  inferior: [0, -1, 0],
};

const SUPERIOR = new THREE.Vector3(0, 1, 0);
const ANTERIOR = new THREE.Vector3(0, 0, 1);

// Below this, superior is too close to the facing direction to define "up"
// (about 17 degrees from vertical), so anterior takes over as on a plate.
const MIN_UP_COMPONENT = 0.3;

export const EXACT_VIEW_DOT = 0.99;

export function getViewFrame(camera, target) {
  const toCamera = camera.position
    .clone()
    .sub(new THREE.Vector3(target.x, target.y, target.z))
    .normalize();
  const up = camera.up.clone();
  const screenUp = up.sub(toCamera.clone().multiplyScalar(up.dot(toCamera))).normalize();
  return { toCamera, screenUp };
}

function perpendicularUp(direction, preferredUp) {
  const up = preferredUp.clone().sub(direction.clone().multiplyScalar(preferredUp.dot(direction)));
  return up.length() < MIN_UP_COMPONENT ? null : up.normalize();
}

/**
 * The specimen rotation that turns an anatomical direction toward the viewer
 * while keeping an anatomical up toward screen-up: superior by default,
 * anterior when the direction is too close to vertical for superior to work.
 */
export function orientationFacing(direction, frame, preferredUp = SUPERIOR) {
  const forward = direction.clone().normalize();
  const up =
    perpendicularUp(forward, preferredUp) ?? perpendicularUp(forward, ANTERIOR);
  const side = new THREE.Vector3().crossVectors(up, forward);

  const screenSide = new THREE.Vector3().crossVectors(frame.screenUp, frame.toCamera);
  const anatomical = new THREE.Matrix4().makeBasis(forward, up, side);
  const screen = new THREE.Matrix4().makeBasis(frame.toCamera, frame.screenUp, screenSide);
  const rotation = screen.multiply(anatomical.transpose());
  return new THREE.Quaternion().setFromRotationMatrix(rotation).normalize();
}

export function orientationForView(view, frame) {
  const axis = new THREE.Vector3(...VIEW_AXES[view]);
  // Top and bottom views put anterior up, the anatomy-plate convention.
  const up = view === 'superior' || view === 'inferior' ? ANTERIOR : SUPERIOR;
  return orientationFacing(axis, frame, up);
}

/** Nearest standard view to the viewer, and whether it is squarely that view. */
export function classifyView(quaternion, frame) {
  let best = { view: VIEWS[0], dot: -Infinity };
  for (const view of VIEWS) {
    const dot = new THREE.Vector3(...VIEW_AXES[view]).applyQuaternion(quaternion).dot(frame.toCamera);
    if (dot > best.dot) best = { view, dot };
  }
  return { view: best.view, viewExact: best.dot > EXACT_VIEW_DOT };
}
