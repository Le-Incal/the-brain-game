/**
 * The landing plates B and C, working (Kyle, 2026-10-15): the real engraved
 * brain in side elevation, filling the plate. The visitor may drag to turn it
 * and look around it, and nothing else: no region picks, no zoom, no pan.
 * No tags (Kyle, 2026-10-16: "Let's remove the labels"). Staging only, while
 * we choose.
 */

import * as THREE from 'three';
import { BrainScene } from '../utils/brainScene';
import { loadBrainModel } from '../utils/brainLoader';
import { BRAIN_MODEL_URL } from '../utils/webAssets.js';
import { getViewFrame, orientationForView } from '../voice/orientation.js';
import { elevationDistance } from './elevation.js';
import { startDrift } from './drift.js';
import { lookAtButton, lookAway, lookUpAtVisitor, nearButton, poseLooking, startGaze } from './gaze.js';
import { createEnter } from './enter.js';
import './landing.css';

// One degree of view: an elevation, as drawn, not a perspective.
const FOV_DEG = 1;

const plate = document.querySelector('.plate');
const host = plate.querySelector('.plate-canvas');
const enter = document.querySelector('.enter');

const scene = new BrainScene(host, { selectable: false, zoom: false, pan: false });
scene.controls.stopAutoRotate();
scene.setColorMode(plate.dataset.plate === 'tinted');

let elevation = null;

// The plate on the canvas, in canvas pixels: the brain's frame.
function frameOnCanvas() {
  const plateRect = plate.getBoundingClientRect();
  const canvasRect = scene.renderer.domElement.getBoundingClientRect();
  return {
    x: plateRect.left - canvasRect.left,
    y: plateRect.top - canvasRect.top,
    w: plateRect.width,
    h: plateRect.height,
  };
}

// The brain's box in the world at the side elevation, whatever pose it holds now.
function elevationBox() {
  const orient = scene.specimenOrientGroup;
  const held = orient.quaternion.clone();
  orient.quaternion.copy(elevation);
  scene.specimenGroup.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const mesh of scene.brainMeshes) box.expandByObject(mesh, true);
  orient.quaternion.copy(held);
  scene.specimenGroup.updateMatrixWorld(true);
  return box;
}

// The camera looks along -x, so the canvas's width runs along z.
function fit() {
  if (!elevation) return;
  const { camera, controls } = scene;
  camera.clearViewOffset();
  camera.aspect = scene.width / scene.height;
  camera.updateProjectionMatrix();
  const frame = frameOnCanvas();
  const box = elevationBox();
  controls.radius = elevationDistance({
    brainWidth: box.max.z - box.min.z,
    canvasWidth: scene.width,
    frameWidth: frame.w,
    fovDeg: FOV_DEG,
    aspect: camera.aspect,
  });
  // The scene places the specimen for this distance; then the brain's centre
  // is moved onto the plate's centre with a view offset.
  scene._positionSpecimen();
  camera.updateMatrixWorld();
  const centre = elevationBox().getCenter(new THREE.Vector3()).project(camera);
  const at = { x: ((centre.x + 1) / 2) * scene.width, y: ((1 - centre.y) / 2) * scene.height };
  camera.setViewOffset(scene.width, scene.height, at.x - (frame.x + frame.w / 2), at.y - (frame.y + frame.h / 2), scene.width, scene.height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

loadBrainModel(BRAIN_MODEL_URL)
  .then(async ({ group }) => {
    scene.addBrainGeometry(group);
    const { camera, controls } = scene;
    camera.fov = FOV_DEG;
    camera.far = 5000;
    controls.phi = Math.PI / 2;
    controls.theta = Math.PI / 2;
    controls.updateCamera();
    camera.updateMatrixWorld();
    elevation = orientationForView('left_lateral', getViewFrame(camera, controls.target), (axis) => scene.toSpecimenDirection(axis));
    scene.specimenOrientGroup.quaternion.copy(elevation);
    controls.targetQuaternion.copy(elevation);
    fit();
    // The still gives way once the brain is fully drawn, and the drift starts then (Kyle, 2026-10-20).
    await scene.texturesReady;
    plate.classList.add('is-ready');
    // The brain drifts from the moment the visitor arrives (Kyle, 2026-10-16).
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const drift = startDrift({ controls: scene.controls, reducedMotion });
    // It notices a cursor near Enter; a phone has no cursor to notice.
    const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    if (enter && finePointer && !reducedMotion) watchForEnter(drift);
    new ResizeObserver(() => {
      scene._onResize();
      fit();
    }).observe(host);
  })
  .catch((error) => {
    console.error('[Brain Game] The specimen did not load:', error);
    plate.classList.add('is-missing');
  });

const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

// The gaze (Kyle, 2026-10-16): near Enter the brain looks at it; pulled away,
// it looks up at the visitor and drifts on.
function watchForEnter(drift) {
  const convert = (axis) => scene.toSpecimenDirection(axis);
  const frame = () => getViewFrame(scene.camera, scene.controls.target);
  const poses = {
    button: () => {
      const brain = centreOf(plate.getBoundingClientRect());
      const button = centreOf(enter.getBoundingClientRect());
      const view = frame();
      return poseLooking(lookAtButton({ frame: view, toButton: { dx: button.x - brain.x, dy: button.y - brain.y } }), view, convert);
    },
    you: () => {
      const view = frame();
      return poseLooking(lookUpAtVisitor({ frame: view }), view, convert);
    },
    away: () => {
      const view = frame();
      return poseLooking(lookAway({ frame: view }), view, convert);
    },
  };
  const gaze = startGaze({ controls: scene.controls, drift, poses });
  let pointerNear = false;
  let focused = false;
  const update = () => gaze.setNear(pointerNear || focused);
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pointerNear = nearButton({ x: event.clientX, y: event.clientY }, enter.getBoundingClientRect());
    update();
  });
  document.documentElement.addEventListener('pointerleave', () => {
    pointerNear = false;
    update();
  });
  enter.addEventListener('focus', () => {
    focused = true;
    update();
  });
  enter.addEventListener('blur', () => {
    focused = false;
    update();
  });
}

// Enter asks for the microphone, then goes into the app (Kyle, 2026-10-15:
// "that acts as your action to turn on your mic and your speakers").
if (enter) {
  let storage = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  const enterApp = createEnter({ mediaDevices: navigator.mediaDevices, storage, go: (path) => window.location.assign(path) });
  enter.addEventListener('click', (event) => {
    event.preventDefault();
    enterApp();
  });
}

// The Enter key does what the Enter button does.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && enter && document.activeElement !== enter) enter.click();
});

if (import.meta.env.DEV) window.__landing = { scene, fit };
