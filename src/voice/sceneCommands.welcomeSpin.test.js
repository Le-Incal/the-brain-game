import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFakeSceneAdapter,
  flushMicrotasks,
  FRAME_MS,
  installFakeClock,
  runFrames,
} from '../test/voiceHarness.js';
import * as THREE from 'three';
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

// Sylvi's "You can study"; then 5 turns of 1.5 s, 5 pauses of 0.5 s, and a
// last tip down from the underside to upright (a little more than a quarter turn).
const TOUR_AT_MS = 3480;
const TOUR_MS = TOUR_AT_MS + 5 * 1500 + 5 * 500 + 2000;
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

  it('faces us, shows the right side, back, left side, faces us, shows the underside, and ends facing us', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    const views = await framesWithViews(harness, harness.frame, TOUR_MS + 100);
    expect(views).toEqual([
      'left_lateral',
      'anterior',
      'right_lateral',
      'posterior',
      'left_lateral',
      'anterior',
      'inferior',
      'anterior',
    ]);
    await expect(result).resolves.toMatchObject({ ok: true });
    expect(harness.orientGroup.quaternion.angleTo(harness.uprightFace)).toBeLessThan(0.01);
  });

  it('ends at the elevation it arrived with: upright, not tipped toward the camera', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    await runFrames(harness.controls, clock, TOUR_MS + 100);
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
    await runFrames(harness.controls, clock, TOUR_MS + 100);
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
    await runFrames(harness.controls, clock, TOUR_MS + 100);
    await result;
    expect(harness.controlChanges).toEqual(['guide_moving', 'guide_free']);
  });

  it('stops where it is when the visitor grabs, and the brain stays theirs', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ tourAtMs: TOUR_AT_MS });
    // Mid-turn from the right side to the back.
    await runFrames(harness.controls, clock, TOUR_AT_MS + 2000 + 750);
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
    // Pausing at the back.
    await runFrames(harness.controls, clock, TOUR_AT_MS + 2 * 2000 - 250);
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
