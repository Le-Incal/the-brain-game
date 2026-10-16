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
import { getViewFrame, orientationForView } from '../voice/orientation.js';
import { elevationDistance } from './elevation.js';
import './landing.css';

// One degree of view: an elevation, as drawn, not a perspective.
const FOV_DEG = 1;

const plate = document.querySelector('.plate');
const host = plate.querySelector('.plate-canvas');

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

loadBrainModel('/brain.glb')
  .then(({ group }) => {
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
    plate.classList.add('is-ready');
    new ResizeObserver(() => {
      scene._onResize();
      fit();
    }).observe(host);
  })
  .catch((error) => {
    console.error('[Brain Game] The specimen did not load:', error);
    plate.classList.add('is-missing');
  });

// The Enter key does what the Enter button does.
const enter = document.querySelector('.enter');
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && enter && document.activeElement !== enter) enter.click();
});

if (import.meta.env.DEV) window.__landing = { scene, fit };
