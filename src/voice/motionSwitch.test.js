import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import brainRegions from '../data/brainRegions.json';
import { createFakeSceneAdapter, installFakeClock, runFrames } from '../test/voiceHarness.js';

const sceneModule = await import('./sceneCommands.js');
const { createSceneCommands, MOTION_OFF_REASON } = sceneModule;

// Kyle, 2026-10-11: a Motion switch stops the brain turning. The guide can
// still light what it talks about; it simply does not turn the brain.

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

function setup() {
  const harness = createFakeSceneAdapter();
  const motion = { on: false };
  const commands = createSceneCommands(harness.adapter, {
    motionAllowed: () => motion.on,
    setTimeoutImpl: () => 0,
    clearTimeoutImpl: () => {},
  });
  const settle = async (promise) => {
    await runFrames(harness.controls, clock, 1500);
    return promise;
  };
  const pose = () => harness.controls.orientGroup.quaternion.toArray().map((v) => v.toFixed(6)).join(',');
  return { ...harness, commands, motion, settle, pose };
}

const regionsOf = (lobe) => brainRegions.divisions.find(({ name }) => name === lobe).regions;

describe('Motion off', () => {
  it('has a reason the guide can say', () => {
    expect(MOTION_OFF_REASON).toMatch(/motion/i);
  });

  it('lights a region without turning to it', async () => {
    const { commands, state, settle, pose } = setup();
    const before = pose();
    const result = await settle(commands.faceRegion(19));
    expect(state.highlight).toBe(19);
    expect(pose()).toBe(before);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(MOTION_OFF_REASON);
    expect(result.did).toMatch(/Highlighted/);
  });

  it('lights a whole lobe without turning to it', async () => {
    const { commands, state, settle, pose } = setup();
    const before = pose();
    const result = await settle(commands.faceLobe('Occipital Lobe'));
    expect(state.highlight).toEqual(regionsOf('Occipital Lobe'));
    expect(pose()).toBe(before);
    expect(result.reason).toBe(MOTION_OFF_REASON);
  });

  it('refuses to turn to a view', async () => {
    const { commands, settle, pose } = setup();
    const before = pose();
    const result = await settle(commands.rotateTo('posterior'));
    expect(result).toMatchObject({ ok: false, reason: MOTION_OFF_REASON });
    expect(pose()).toBe(before);
  });

  it('still follows the words with light, never with a turn', async () => {
    const { commands, state, settle, pose } = setup();
    const before = pose();
    const result = await settle(commands.followName({ kind: 'region', id: 17 }));
    expect(state.highlight).toBe(17);
    expect(result.did).toBe('lit');
    expect(pose()).toBe(before);
  });

  it('turns again once Motion is back on', async () => {
    const { commands, motion, settle, pose } = setup();
    motion.on = true;
    const before = pose();
    const result = await settle(commands.rotateTo('posterior'));
    expect(result.ok).toBe(true);
    expect(pose()).not.toBe(before);
  });
});
