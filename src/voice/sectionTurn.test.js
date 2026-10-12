import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeSceneAdapter, installFakeClock, runFrames } from '../test/voiceHarness.js';
import { createSceneCommands } from './sceneCommands.js';

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

function setup({ motion = true } = {}) {
  const harness = createFakeSceneAdapter();
  const commands = createSceneCommands(harness.adapter, {
    motionAllowed: () => motion,
    setTimeoutImpl: () => 0,
    clearTimeoutImpl: () => {},
  });
  const settle = async (promise, ms = 1500) => {
    await runFrames(harness.controls, clock, ms);
    return promise;
  };
  return { ...harness, commands, settle };
}

// Opening the section turns the brain to its left side first.
describe('Turning to the side for the section', () => {
  it('is not one of the guide\'s tools', () => {
    const { commands } = setup();
    expect(Object.keys(commands)).toHaveLength(12);
    expect(typeof commands.turnToSide).toBe('function');
  });

  it('turns to the left lateral view, the same pose as rotate_to_view', async () => {
    const a = setup();
    await a.settle(a.commands.turnToSide('left_lateral'));
    const b = setup();
    await b.settle(b.commands.rotateTo('left_lateral'));
    expect(a.controls.orientGroup.quaternion.angleTo(b.controls.orientGroup.quaternion)).toBeLessThan(1e-3);
  });

  it('turns at once, without animating, when motion is off', async () => {
    const { commands, controls, settle } = setup({ motion: false });
    const result = await settle(commands.turnToSide('left_lateral'), 50);
    expect(result.ok).toBe(true);
    const reference = setup();
    await reference.settle(reference.commands.rotateTo('left_lateral'));
    expect(controls.orientGroup.quaternion.angleTo(reference.controls.orientGroup.quaternion)).toBeLessThan(1e-3);
  });

  it('works in Study and while exploring, but never during a game', async () => {
    const { commands, state, settle } = setup();
    state.mode = 'game';
    expect((await settle(commands.turnToSide('left_lateral'))).ok).toBe(false);
  });
});
