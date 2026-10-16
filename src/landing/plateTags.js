/**
 * The landing plate's analytical tags (Kyle, 2026-10-15). The page shows the
 * real engraved brain in side elevation, framed where the mockup's plate sat,
 * and the visitor may turn it. Each tag's label stays where the mockup placed
 * it; its leader stays pinned to its spot on the brain, and the tag fades while
 * that spot faces away.
 *
 * Positions are percent of the plate (the mockup's 1361 x 1193 frame). Each
 * anchor was found on the rendered elevation by asking the scene which region
 * lies under each point, then taking the most interior point of the region.
 */

import * as THREE from 'three';

/** Where the brain's side elevation sits in the plate, in percent. */
export const PLATE_FRAME = Object.freeze({ left: 4.41, top: 7.54, width: 91.18, height: 90.78 });

/**
 * `label`: where the label sits (its left edge, right edge or centre, by
 * `align`); `anchor`: the spot on the elevation; `end`: where the leader meets
 * the label. Names are the game's own (src/data/brainRegions.json).
 */
export const PLATE_TAGS = Object.freeze([
  { id: 1, text: 'Prefrontal Cortex', align: 'left', label: [1.47, 13.41], anchor: [14.84, 36.13], end: [3.67, 15.07] },
  { id: 6, text: "Broca's Area", align: 'left', label: [1.47, 71.25], anchor: [28.95, 33.11], end: [12.43, 71.25] },
  { id: 5, text: 'Primary Motor Cortex', align: 'center', label: [28.66, 3.52], anchor: [43.06, 19.03], end: [35.71, 5.18] },
  { id: 7, text: 'Primary Somatosensory Cortex', align: 'center', label: [63.92, 3.52], anchor: [50.11, 25.06], end: [53.46, 5.18] },
  { id: 13, text: "Wernicke's Area", align: 'right', label: [99.19, 11.9], anchor: [73.03, 44.17], end: [85.67, 11.9] },
  { id: 17, text: 'Primary Visual Cortex', align: 'right', label: [99.19, 88.01], anchor: [91.55, 55.24], end: [90.24, 86.35] },
  { id: 19, text: 'Cerebellum', align: 'left', label: [74.94, 95.73], anchor: [68.63, 73.34], end: [77.15, 94.07] },
  { id: 20, text: 'Brain Stem', align: 'right', label: [58.78, 95.73], anchor: [62.45, 85.41], end: [54.52, 94.07] },
]);

/**
 * How far the camera stands so the brain spans `frameWidth` of a canvas
 * `canvasWidth` wide, with `fovDeg` of vertical view at `aspect`.
 */
export function elevationDistance({ brainWidth, canvasWidth, frameWidth, fovDeg, aspect }) {
  const halfView = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  return (brainWidth * canvasWidth) / (frameWidth * 2 * halfView * aspect);
}

const worldPoint = new THREE.Vector3();
const worldNormal = new THREE.Vector3();
const toCamera = new THREE.Vector3();
const groupQuaternion = new THREE.Quaternion();
const projected = new THREE.Vector3();

/**
 * Where a tag's spot (`local`, with its surface `normal`, both in `group`'s
 * frame) lands on a `width` x `height` canvas, in pixels, and how squarely it
 * faces the camera (1 facing, 0 edge on, below 0 turned away).
 */
export function projectTag({ local, normal, group, camera, width, height }) {
  worldPoint.copy(local);
  group.localToWorld(worldPoint);
  group.getWorldQuaternion(groupQuaternion);
  worldNormal.copy(normal).applyQuaternion(groupQuaternion).normalize();
  toCamera.setFromMatrixPosition(camera.matrixWorld).sub(worldPoint).normalize();
  projected.copy(worldPoint).project(camera);
  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
    facing: worldNormal.dot(toCamera),
  };
}

// A tag shows fully once its spot turns about 15 degrees toward us past edge on.
const FADE_FROM = 0.02;
const FADE_TO = 0.25;

/** A tag's opacity from how squarely its spot faces us. */
export function tagOpacity(facing) {
  const t = Math.min(1, Math.max(0, (facing - FADE_FROM) / (FADE_TO - FADE_FROM)));
  return t * t * (3 - 2 * t);
}
