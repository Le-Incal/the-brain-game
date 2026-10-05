/**
 * Maps the raw painted-model frame (where regionGeometry.json, labelsPerView
 * and the six view axes are measured) into the specimen's own frame, where the
 * scene draws the brain.
 *
 * The loader bakes the model node's transform into the vertices (an 8 degree
 * rotation and an offset on the v17 master), normalises by the bounds, then
 * BrainScene scales the brain and offsets it by the cerebrum pivot. Points take
 * all of that; directions take the rotation only.
 */

import * as THREE from 'three';

export function createSpecimenSpace({ normalization, scale, pivot }) {
  const source = normalization.sourceMatrix
    ? new THREE.Matrix4().fromArray(normalization.sourceMatrix)
    : new THREE.Matrix4();
  const center = new THREE.Vector3(...normalization.center);
  const { maxDim } = normalization;
  const rotation = new THREE.Quaternion();
  source.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());

  return {
    toSpecimenSpace(point) {
      return new THREE.Vector3(...point)
        .applyMatrix4(source)
        .sub(center)
        .divideScalar(maxDim)
        .sub(pivot)
        .multiplyScalar(scale);
    },
    toSpecimenDirection(direction) {
      return new THREE.Vector3(...direction).applyQuaternion(rotation).normalize();
    },
  };
}
