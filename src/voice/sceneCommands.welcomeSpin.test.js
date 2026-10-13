import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFakeSceneAdapter,
  directionFromPivot,
  flushMicrotasks,
  FRAME_MS,
  installFakeClock,
  rotated,
  runFrames,
} from '../test/voiceHarness.js';
import * as THREE from 'three';
import regionGeometry from '../data/regionGeometry.json';
import { classifyView, getViewFrame, orientationForView } from './orientation.js';

// Imported defensively so each test fails on its own while the module is absent.
const sceneCommandsModule = await import('./sceneCommands.js').catch(() => ({}));
const { createSceneCommands } = sceneCommandsModule;

// Kyle, 2026-10-13: on the open the brain turns to look at the visitor, then
// shows each side and below, turning deliberately from one standard view to
// the next, and ends facing us. The page starts it from the welcome's clock;
// the scene commands run it, so it obeys every rule a guide move does.

// Kyle, 2026-10-13 (later): it ends facing us at the elevation it arrived
// with, upright, and then turns slowly while it waits.

// Kyle, 2026-10-13 (later still): at "turn me around and select any of my
// regions" it shows what selecting looks like: no pause at the sides, a flip
// to the underside, up to the front-right a little above, the prefrontal
// cortex selected for 2 s, then upright facing us. The selection is the
// page's own, as a click would make it, but it is not the visitor's.

// Sylvi's "You can study". Then three sides and a flip at 1.5 s each, a
// quarter second on the underside, about 2 s up to the front-right, 2 s
// selected, a quarter second, and about 1.5 s back to face us.
const TOUR_AT_MS = 3480;
const SIDES_DONE_MS = TOUR_AT_MS + 3 * 1500;
const TOUR_MS = 17000;
const PREFRONTAL = 1;
const UP = new THREE.Vector3(0, 1, 0);

// Upright with `side` (an anatomical axis) toward the camera's heading.
function upright(frame, side) {
  const toward = new THREE.Vector3(frame.toCamera.x, 0, frame.toCamera.z).normalize();
  const across = new THREE.Vector3().crossVectors(UP, toward);
  // Anatomical axes: +x left, +y superior, +z anterior.
  const basis =
    side === 'left'
      ? new THREE.Matrix4().makeBasis(toward, UP, new THREE.Vector3().crossVectors(toward, UP))
      : new THREE.Matrix4().makeBasis(across, UP, toward);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}
const tiltFromUpright = (pose) => Math.acos(Math.min(1, UP.clone().applyQuaternion(pose).dot(UP)));

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

function setup({ reducedMotion = false, motionAllowed = true, autoRotate = true } = {}) {
  const harness = createFakeSceneAdapter({ autoRotate });
  harness.state.mode = 'explore';
  const frame = getViewFrame(harness.controls.camera, harness.controls.target);
  const view = (name) => orientationForView(name, frame);
  // The arrival pose: upright, its left side toward us.
  harness.orientGroup.quaternion.copy(upright(frame, 'left'));
  harness.controls.targetQuaternion.copy(upright(frame, 'left'));
  const uprightFace = upright(frame, 'front');
  const controlChanges = [];
  const timers = [];
  const commands = createSceneCommands(harness.adapter, {
    onControlChange: (control) => controlChanges.push(control),
    reducedMotion: () => reducedMotion,
    motionAllowed: () => motionAllowed,
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimeoutImpl: () => {},
  });
  return { ...harness, frame, view, uprightFace, commands, controlChanges };
}

// Runs frames until `done()` holds; returns the time it took, or null.
async function runUntil({ controls }, done, maxMs) {
  for (let elapsed = 0; elapsed <= maxMs; elapsed += FRAME_MS) {
    if (done()) return elapsed;
    clock.advance(FRAME_MS);
    controls.update();
    await flushMicrotasks();
  }
  return null;
}

async function framesWithViews({ controls, orientGroup }, frame, durationMs) {
  const views = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += FRAME_MS) {
    clock.advance(FRAME_MS);
    controls.update();
    const { view } = classifyView(orientGroup.quaternion, frame);
    if (views.at(-1) !== view) views.push(view);
    await flushMicrotasks();
  }
  return views;
}

describe('The welcome tour as a scene command', () => {
  it('is not one of the guide tools', () => {
    const { commands } = setup();
    expect(typeof commands.welcomeSpin).toBe('function');
    expect(typeof commands.endWelcomeSpin).toBe('function');
    expect(Object.keys(commands)).not.toContain('welcomeSpin');
    expect(Object.keys(commands)).not.toContain('endWelcomeSpin');
  });

  it('faces us, shows the left side, back, right side and underside, and ends facing us', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    const views = await framesWithViews(harness, harness.frame, TOUR_MS);
    expect(views.slice(0, 6)).toEqual(['left_lateral', 'anterior', 'left_lateral', 'posterior', 'right_lateral', 'inferior']);
    expect(views.at(-1)).toBe('anterior');
    await expect(result).resolves.toMatchObject({ ok: true });
    expect(harness.orientGroup.quaternion.angleTo(harness.uprightFace)).toBeLessThan(0.01);
  });

  it('selects the prefrontal cortex once it has risen from the underside, and lets it go 2 s later', async () => {
    const harness = setup();
    harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    const selectedAt = await runUntil(harness, () => harness.state.demoSelected === PREFRONTAL, TOUR_MS);
    // After the sides, the flip and its look, and the rise to the front-right.
    expect(selectedAt).toBeGreaterThan(SIDES_DONE_MS + 1500 + 250 + 1500);
    expect(harness.controls.isMoving).toBe(true);
    const heldFor = await runUntil(harness, () => harness.state.demoSelected === null, 3000);
    expect(heldFor).toBeGreaterThan(1950);
    expect(heldFor).toBeLessThan(2100);
    expect(harness.state.selections).toEqual([['select', PREFRONTAL], ['clear']]);
  });

  it('holds the right prefrontal cortex toward us, from the front-right a little above, while it is selected', async () => {
    const harness = setup();
    harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runUntil(harness, () => harness.state.demoSelected === PREFRONTAL, TOUR_MS);
    await runFrames(harness.controls, clock, 500);
    const pose = harness.orientGroup.quaternion;
    const prefrontal = rotated(directionFromPivot(regionGeometry.regions[String(PREFRONTAL)].centroidRight), pose);
    expect(prefrontal.dot(harness.frame.toCamera)).toBeGreaterThan(0.85);
    // Seen from a little above: the top leans toward us.
    expect(rotated([0, 1, 0], pose).dot(harness.frame.toCamera)).toBeGreaterThan(0.3);
  });

  it('ends at the elevation it arrived with: upright, not tipped toward the camera', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runFrames(harness.controls, clock, TOUR_MS);
    await result;
    expect(tiltFromUpright(harness.orientGroup.quaternion)).toBeLessThan(1e-4);
    expect(tiltFromUpright(harness.view('anterior'))).toBeGreaterThan(0.15);
  });

  it('is facing us 1.5 s after "Welcome.", and still holding there at "You can study"', async () => {
    const harness = setup();
    harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runFrames(harness.controls, clock, 1550);
    expect(harness.orientGroup.quaternion.angleTo(harness.view('anterior'))).toBeLessThan(0.01);
    await runFrames(harness.controls, clock, TOUR_AT_MS - 1600);
    expect(harness.orientGroup.quaternion.angleTo(harness.view('anterior'))).toBeLessThan(0.01);
  });

  it('leaves the arrival turn off afterwards (the page takes over with a slow turn)', async () => {
    const harness = setup({ autoRotate: true });
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runFrames(harness.controls, clock, TOUR_MS);
    await result;
    expect(harness.controls.autoRotate).toBe(false);
    const settled = harness.orientGroup.quaternion.clone();
    await runFrames(harness.controls, clock, 1000);
    expect(harness.orientGroup.quaternion.angleTo(settled)).toBeLessThan(1e-6);
  });

  it('counts as the guide moving while it runs', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    expect(harness.controlChanges).toEqual(['guide_moving']);
    await runFrames(harness.controls, clock, TOUR_MS);
    await result;
    expect(harness.controlChanges).toEqual(['guide_moving', 'guide_free']);
  });

  it('stops where it is when the visitor grabs, and the brain stays theirs', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    // Mid-turn from the left side to the back.
    await runFrames(harness.controls, clock, TOUR_AT_MS + 1500 + 750);
    harness.element.dispatch('pointerdown');
    const grabbed = harness.orientGroup.quaternion.clone();
    await flushMicrotasks();
    await expect(result).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
    await runFrames(harness.controls, clock, 500);
    expect(harness.orientGroup.quaternion.angleTo(grabbed)).toBeLessThan(1e-6);
    harness.element.dispatch('pointerup');
  });

  it('turns calmly back to face us, upright, when the welcome is cut short', async () => {
    const harness = setup({ autoRotate: true });
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    // Just arrived at the back.
    await runFrames(harness.controls, clock, TOUR_AT_MS + 2 * 1500 + 20);
    expect(classifyView(harness.orientGroup.quaternion, harness.frame).view).toBe('posterior');

    const home = harness.commands.endWelcomeSpin();
    await expect(result).resolves.toMatchObject({ ok: false });
    // About half a turn at the tour's pace: about 3 s.
    await runFrames(harness.controls, clock, 1500);
    expect(harness.orientGroup.quaternion.angleTo(harness.uprightFace)).toBeGreaterThan(0.5);
    await runFrames(harness.controls, clock, 1800);
    await expect(home).resolves.toMatchObject({ ok: true });
    expect(harness.orientGroup.quaternion.angleTo(harness.uprightFace)).toBeLessThan(0.01);
    expect(harness.controls.autoRotate).toBe(false);
  });

  it('lets go of the demonstration at once when the visitor grabs while it is selected', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runUntil(harness, () => harness.state.demoSelected === PREFRONTAL, TOUR_MS);
    harness.element.dispatch('pointerdown');
    await flushMicrotasks();
    await expect(result).resolves.toMatchObject({ ok: false });
    expect(harness.state.demoSelected).toBeNull();
    harness.element.dispatch('pointerup');
  });

  it('lets go of the demonstration and turns to face us when the welcome is cut short while it is selected', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runUntil(harness, () => harness.state.demoSelected === PREFRONTAL, TOUR_MS);
    const home = harness.commands.endWelcomeSpin();
    expect(harness.state.demoSelected).toBeNull();
    await expect(result).resolves.toMatchObject({ ok: false });
    await runFrames(harness.controls, clock, 1600);
    await expect(home).resolves.toMatchObject({ ok: true });
    expect(harness.orientGroup.quaternion.angleTo(harness.uprightFace)).toBeLessThan(0.01);
  });

  it('never selects anything when it does not run', async () => {
    const harness = setup({ motionAllowed: false });
    await harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runFrames(harness.controls, clock, TOUR_MS);
    expect(harness.state.selections).toEqual([]);
  });

  it('does nothing when asked to end a tour that is not running', async () => {
    const harness = setup();
    await expect(harness.commands.endWelcomeSpin()).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
  });

  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['Motion off', { motionAllowed: false }],
  ])('does not run with %s', async (_, options) => {
    const harness = setup(options);
    await expect(harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS })).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
  });

  it('does not run for a visitor who has already turned the brain', async () => {
    const harness = setup();
    harness.element.dispatch('pointerdown');
    harness.element.dispatch('pointerup');
    await expect(harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS })).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
  });
});
