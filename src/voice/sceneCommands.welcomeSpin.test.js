import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFakeSceneAdapter,
  flushMicrotasks,
  FRAME_MS,
  installFakeClock,
  runFrames,
} from '../test/voiceHarness.js';
import { classifyView, getViewFrame, orientationForView } from './orientation.js';

// Imported defensively so each test fails on its own while the module is absent.
const sceneCommandsModule = await import('./sceneCommands.js').catch(() => ({}));
const { createSceneCommands } = sceneCommandsModule;

// Kyle, 2026-10-11: while the brain introduces itself it turns all the way
// round, so the visitor sees at once that it is a solid thing to turn. The
// page starts the spin from the welcome's clock; the scene commands run it,
// so it counts as the guide moving and obeys every rule a guide move does.

const SPIN_MS = 6000;

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
  const home = orientationForView('left_lateral', frame);
  harness.orientGroup.quaternion.copy(home);
  harness.controls.targetQuaternion.copy(home);
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
  return { ...harness, frame, home, commands, controlChanges };
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

describe('The welcome spin as a scene command', () => {
  it('is not one of the guide tools', () => {
    const { commands } = setup();
    expect(typeof commands.welcomeSpin).toBe('function');
    expect(typeof commands.endWelcomeSpin).toBe('function');
    expect(Object.keys(commands)).not.toContain('welcomeSpin');
    expect(Object.keys(commands)).not.toContain('endWelcomeSpin');
  });

  it('turns all the way round, top, right, back and under, and settles on the left side', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ durationMs: SPIN_MS });
    const views = await framesWithViews(harness, harness.frame, SPIN_MS + 100);
    expect(views).toEqual(['left_lateral', 'superior', 'right_lateral', 'posterior', 'inferior', 'left_lateral']);
    await expect(result).resolves.toMatchObject({ ok: true });
    expect(harness.orientGroup.quaternion.angleTo(harness.home)).toBeLessThan(0.01);
  });

  it('leaves the brain still afterwards, ready for "turn me around"', async () => {
    const harness = setup({ autoRotate: true });
    const result = harness.commands.welcomeSpin({ durationMs: SPIN_MS });
    await runFrames(harness.controls, clock, SPIN_MS + 100);
    await result;
    expect(harness.controls.autoRotate).toBe(false);
    const settled = harness.orientGroup.quaternion.clone();
    await runFrames(harness.controls, clock, 1000);
    expect(harness.orientGroup.quaternion.angleTo(settled)).toBeLessThan(1e-6);
  });

  it('counts as the guide moving while it runs', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ durationMs: SPIN_MS });
    expect(harness.controlChanges).toEqual(['guide_moving']);
    await runFrames(harness.controls, clock, SPIN_MS + 100);
    await result;
    expect(harness.controlChanges).toEqual(['guide_moving', 'guide_free']);
  });

  it('stops where it is when the visitor grabs, and the brain stays theirs', async () => {
    const harness = setup();
    const result = harness.commands.welcomeSpin({ durationMs: SPIN_MS });
    await runFrames(harness.controls, clock, SPIN_MS / 3);
    harness.element.dispatch('pointerdown');
    const grabbed = harness.orientGroup.quaternion.clone();
    await flushMicrotasks();
    await expect(result).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
    expect(grabbed.angleTo(harness.home)).toBeGreaterThan(0.2);
    harness.element.dispatch('pointerup');
  });

  it('brings the brain home quickly when the welcome is cut short', async () => {
    const harness = setup({ autoRotate: true });
    const result = harness.commands.welcomeSpin({ durationMs: SPIN_MS });
    await runFrames(harness.controls, clock, SPIN_MS / 2);
    expect(harness.orientGroup.quaternion.angleTo(harness.home)).toBeGreaterThan(0.5);

    const home = harness.commands.endWelcomeSpin();
    await expect(result).resolves.toMatchObject({ ok: false });
    await runFrames(harness.controls, clock, 1300);
    await expect(home).resolves.toMatchObject({ ok: true });
    expect(harness.orientGroup.quaternion.angleTo(harness.home)).toBeLessThan(0.01);
    expect(harness.controls.autoRotate).toBe(false);
  });

  it('does nothing when asked to end a spin that is not running', async () => {
    const harness = setup();
    await expect(harness.commands.endWelcomeSpin()).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
  });

  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['Motion off', { motionAllowed: false }],
  ])('does not run with %s', async (_, options) => {
    const harness = setup(options);
    await expect(harness.commands.welcomeSpin({ durationMs: SPIN_MS })).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
  });

  it('does not run for a visitor who has already turned the brain', async () => {
    const harness = setup();
    harness.element.dispatch('pointerdown');
    harness.element.dispatch('pointerup');
    await expect(harness.commands.welcomeSpin({ durationMs: SPIN_MS })).resolves.toMatchObject({ ok: false });
    expect(harness.controls.isMoving).toBe(false);
  });
});
