/**
 * The landing plates B and C, working (Kyle, 2026-10-15): the real engraved
 * brain in side elevation, framed where the mockup's plate sat. The visitor
 * may drag to turn it and look around it, and nothing else: no region picks,
 * no zoom, no pan. The analytical tags travel with the anatomy as it turns.
 * Staging only, while we choose.
 */

import * as THREE from 'three';
import { BrainScene } from '../utils/brainScene';
import { loadBrainModel } from '../utils/brainLoader';
import { getViewFrame, orientationForView } from '../voice/orientation.js';
import { PLATE_FRAME, PLATE_TAGS, elevationDistance, followSpot, projectTag, tagOpacity } from './plateTags.js';
import './landing.css';

// One degree of view: an elevation, as drawn, not a perspective.
const FOV_DEG = 1;
// The mockup's cut-out plate kept 8 px of paper round the brain, of 1241 x 1083.
const PAPER_MARGIN = { x: 8 / 1241, y: 8 / 1083 };
const SVG = 'http://www.w3.org/2000/svg';

const plate = document.querySelector('.plate');
const host = plate.querySelector('.plate-canvas');
const leaders = plate.querySelector('.plate-leaders');

const scene = new BrainScene(host, { selectable: false, zoom: false, pan: false });
scene.controls.stopAutoRotate();
scene.setColorMode(plate.dataset.plate === 'tinted');

const tags = PLATE_TAGS.map((tag) => {
  const line = document.createElementNS(SVG, 'line');
  line.setAttribute('x1', tag.anchor[0]);
  line.setAttribute('y1', tag.anchor[1]);
  line.setAttribute('x2', tag.end[0]);
  line.setAttribute('y2', tag.end[1]);
  leaders.appendChild(line);
  const dot = document.createElement('span');
  dot.className = 'plate-dot';
  dot.style.left = `${tag.anchor[0]}%`;
  dot.style.top = `${tag.anchor[1]}%`;
  const label = document.createElement('span');
  label.className = `plate-label plate-label-${tag.align}`;
  label.textContent = tag.text;
  label.style.left = `${tag.label[0]}%`;
  label.style.top = `${tag.label[1]}%`;
  plate.append(dot, label);
  // `label` stays the tag's place in the plate; its element is `labelEl`.
  return { ...tag, line, dot, labelEl: label, local: null, normal: null, region: null };
});

let elevation = null;

// The brain's frame on the canvas, in canvas pixels, and the rects it came from.
function frameOnCanvas() {
  const plateRect = plate.getBoundingClientRect();
  const canvasRect = scene.renderer.domElement.getBoundingClientRect();
  return {
    plateRect,
    canvasRect,
    x: plateRect.left + (plateRect.width * PLATE_FRAME.left) / 100 - canvasRect.left,
    y: plateRect.top + (plateRect.height * PLATE_FRAME.top) / 100 - canvasRect.top,
    w: (plateRect.width * PLATE_FRAME.width) / 100,
    h: (plateRect.height * PLATE_FRAME.height) / 100,
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
    frameWidth: frame.w * (1 - 2 * PAPER_MARGIN.x),
    fovDeg: FOV_DEG,
    aspect: camera.aspect,
  });
  // The scene places the specimen for this distance; then the brain's centre
  // is moved onto the frame's centre with a view offset.
  scene._positionSpecimen();
  camera.updateMatrixWorld();
  const centre = elevationBox().getCenter(new THREE.Vector3()).project(camera);
  const at = { x: ((centre.x + 1) / 2) * scene.width, y: ((1 - centre.y) / 2) * scene.height };
  camera.setViewOffset(scene.width, scene.height, at.x - (frame.x + frame.w / 2), at.y - (frame.y + frame.h / 2), scene.width, scene.height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

// Each tag's spot: the point on the brain under its anchor at the elevation.
function pinTags() {
  const frame = frameOnCanvas();
  const orient = scene.specimenOrientGroup;
  scene.specimenGroup.updateMatrixWorld(true);
  scene.camera.updateMatrixWorld();
  const toOrient = orient.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const tag of tags) {
    const x = frame.plateRect.left + (frame.plateRect.width * tag.anchor[0]) / 100 - frame.canvasRect.left;
    const y = frame.plateRect.top + (frame.plateRect.height * tag.anchor[1]) / 100 - frame.canvasRect.top;
    scene._pickVec.set((x / scene.width) * 2 - 1, -((y / scene.height) * 2 - 1));
    scene.raycaster.setFromCamera(scene._pickVec, scene.camera);
    const hit = scene.raycaster.intersectObjects(scene.brainMeshes)[0];
    if (!hit) continue;
    tag.local = orient.worldToLocal(hit.point.clone());
    tag.normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).applyQuaternion(toOrient);
    tag.region = scene._getHitRegionId(hit);
  }
}

function followTags() {
  requestAnimationFrame(followTags);
  if (!elevation) return;
  const frame = frameOnCanvas();
  // Read every label's size before anything is written, so the page lays out once.
  const sizes = tags.map((tag) => [
    (tag.labelEl.offsetWidth / frame.plateRect.width) * 100,
    (tag.labelEl.offsetHeight / frame.plateRect.height) * 100,
  ]);
  scene.specimenGroup.updateMatrixWorld(true);
  scene.camera.updateMatrixWorld();
  tags.forEach((tag, index) => {
    if (!tag.local) return;
    const at = projectTag({ local: tag.local, normal: tag.normal, group: scene.specimenOrientGroup, camera: scene.camera, width: scene.width, height: scene.height });
    const x = ((frame.canvasRect.left + at.x - frame.plateRect.left) / frame.plateRect.width) * 100;
    const y = ((frame.canvasRect.top + at.y - frame.plateRect.top) / frame.plateRect.height) * 100;
    // The label and its leader travel with the spot, inside the plate (Kyle, 2026-10-15).
    const { label, end } = followSpot(tag, [x, y], sizes[index]);
    tag.line.setAttribute('x1', x.toFixed(2));
    tag.line.setAttribute('y1', y.toFixed(2));
    tag.line.setAttribute('x2', end[0].toFixed(2));
    tag.line.setAttribute('y2', end[1].toFixed(2));
    tag.dot.style.left = `${x}%`;
    tag.dot.style.top = `${y}%`;
    tag.labelEl.style.left = `${label[0]}%`;
    tag.labelEl.style.top = `${label[1]}%`;
    const opacity = tagOpacity(at.facing).toFixed(3);
    tag.line.style.opacity = opacity;
    tag.dot.style.opacity = opacity;
    tag.labelEl.style.opacity = opacity;
  });
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
    pinTags();
    plate.classList.add('is-ready');
    requestAnimationFrame(followTags);
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

if (import.meta.env.DEV) window.__landing = { scene, tags, fit };
