/**
 * The landing plate's side elevation (Kyle, 2026-10-15). The plate is the
 * brain's own outline, so the camera stands where the brain spans its width.
 */

import * as THREE from 'three';

/**
 * How far the camera stands so the brain spans `frameWidth` of a canvas
 * `canvasWidth` wide, with `fovDeg` of vertical view at `aspect`.
 */
export function elevationDistance({ brainWidth, canvasWidth, frameWidth, fovDeg, aspect }) {
  const halfView = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  return (brainWidth * canvasWidth) / (frameWidth * 2 * halfView * aspect);
}
