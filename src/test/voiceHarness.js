/**
 * Shared test harness for the voice scene layer (M1). Lets the real
 * BrainOrbitControls run without WebGL or a DOM: a fake canvas element records
 * listeners so tests can dispatch pointer and wheel events, and a fake clock
 * drives performance.now() so eased moves are measured frame by frame.
 */

import { vi } from 'vitest';
import * as THREE from 'three';
import { BrainOrbitControls } from '../utils/orbitControls.js';
import regionGeometry from '../data/regionGeometry.json';

export const FRAME_MS = 1000 / 60;

export function createFakeElement(rect = { left: 0, top: 0, width: 800, height: 600 }) {
  const listeners = new Map();
  return {
    style: {},
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, init = {}) {
      const event = { type, preventDefault() {}, pointerId: 1, clientX: 400, clientY: 300, ...init };
      listeners.get(type)?.forEach((handler) => handler(event));
      return event;
    },
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    setPointerCapture() {},
    releasePointerCapture() {},
  };
}

export function installFakeClock(startMs = 1000) {
  let now = startMs;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  return {
    get now() {
      return now;
    },
    advance(ms) {
      now += ms;
    },
    restore() {
      spy.mockRestore();
    },
  };
}

export function createControls(options = {}) {
  const camera = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 100);
  const orientGroup = new THREE.Group();
  const element = createFakeElement();
  const controls = new BrainOrbitControls(camera, element, {
    orientGroup,
    autoRotate: false,
    ...options,
  });
  // The renderer refreshes the camera's world matrices every frame; without
  // this the trackball projects the pivot from a stale, identity view.
  camera.updateMatrixWorld();
  return { camera, orientGroup, element, controls };
}

// Lets promise chains settle between frames so commands that await a move
// observe each step the way they would under requestAnimationFrame.
export async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

export async function runFrames(controls, clock, durationMs, frameMs = FRAME_MS) {
  const frames = Math.ceil(durationMs / frameMs);
  for (let i = 0; i < frames; i += 1) {
    await flushMicrotasks();
    clock.advance(frameMs);
    controls.update();
  }
  await flushMicrotasks();
}

/** Direction from the specimen toward the viewer, read from the live controller. */
export function toCameraDirection(controls) {
  const { camera, target } = controls;
  return camera.position
    .clone()
    .sub(new THREE.Vector3(target.x, target.y, target.z))
    .normalize();
}

/** camera.up made perpendicular to the camera direction. */
export function screenUpDirection(controls) {
  const toCamera = toCameraDirection(controls);
  const up = controls.camera.up.clone();
  return up.sub(toCamera.clone().multiplyScalar(up.dot(toCamera))).normalize();
}

export function rotated(vector, quaternion) {
  return new THREE.Vector3(...vector).applyQuaternion(quaternion);
}

/**
 * A stand-in specimen pivot in regionGeometry space: the vertex-weighted mean
 * of the painted regions, which approximates the centre of the painted mass.
 */
export function geometryPivot() {
  let total = 0;
  const sum = [0, 0, 0];
  for (const region of Object.values(regionGeometry.regions)) {
    total += region.vertexCount;
    region.centroid.forEach((value, axis) => {
      sum[axis] += value * region.vertexCount;
    });
  }
  return sum.map((value) => value / total);
}

export function directionFromPivot(point, pivot = geometryPivot()) {
  return new THREE.Vector3(point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]).normalize();
}

/** In-memory scene adapter: what BrainScene will expose to the command layer. */
export function createFakeSceneAdapter(controlOptions = {}) {
  const harness = createControls(controlOptions);
  const state = { highlight: null, colourRegions: false, annotations: false, mode: 'study' };
  const pivot = geometryPivot();
  return {
    ...harness,
    state,
    adapter: {
      controls: harness.controls,
      getPivot: () => pivot,
      // Geometry space to specimen (orientGroup) space. The fake specimen has
      // no source rotation, so this is a pure offset from the pivot.
      toSpecimenSpace: (point) =>
        new THREE.Vector3(point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]),
      setHighlight(regionId) {
        state.highlight = regionId;
      },
      getHighlight: () => state.highlight,
      setColourRegions(enabled) {
        state.colourRegions = enabled;
      },
      getColourRegions: () => state.colourRegions,
      setAnnotations(enabled) {
        state.annotations = enabled;
      },
      getAnnotations: () => state.annotations,
      getMode: () => state.mode,
    },
  };
}
