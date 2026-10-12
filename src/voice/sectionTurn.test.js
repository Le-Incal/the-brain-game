import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import regionGeometry from '../data/regionGeometry.json';
import { createFakeSceneAdapter, installFakeClock, runFrames, screenUpDirection, toCameraDirection } from '../test/voiceHarness.js';
import { createSceneCommands } from './sceneCommands.js';

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

function setup({ motion = true, section } = {}) {
  const harness = createFakeSceneAdapter();
  const commands = createSceneCommands(harness.adapter, {
    motionAllowed: () => motion,
    section,
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
    expect(Object.keys(commands)).toHaveLength(13);
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

// Kyle, 2026-10-11: the guide decides when to show the section, in
// descriptions and tours. The page owns the plate; the command asks it.
describe('show_section', () => {
  function fakeSection({ openResult = { ok: true } } = {}) {
    const calls = [];
    let open = false;
    return {
      calls,
      api: {
        open: async () => {
          calls.push('open');
          if (openResult.ok) open = true;
          return openResult;
        },
        close: () => {
          calls.push('close');
          open = false;
        },
        isOpen: () => open,
      },
    };
  }

  it('opens the section and says what the visitor now sees', async () => {
    const section = fakeSection();
    const { commands, settle } = setup({ section: section.api });
    const result = await settle(commands.showSection(true));
    expect(section.calls).toEqual(['open']);
    expect(result.ok).toBe(true);
    expect(result.did).toMatch(/divided along the midline/);
  });

  it('closes it again', async () => {
    const section = fakeSection();
    const { commands, settle } = setup({ section: section.api });
    await settle(commands.showSection(true));
    const result = await settle(commands.showSection('false'));
    expect(section.calls).toEqual(['open', 'close']);
    expect(result.ok).toBe(true);
  });

  it("passes on the page's reason when it will not open (only in Study)", async () => {
    const section = fakeSection({ openResult: { ok: false, reason: 'The section opens only in Study mode.' } });
    const { commands, settle } = setup({ section: section.api });
    expect(await settle(commands.showSection(true))).toMatchObject({ ok: false, reason: 'The section opens only in Study mode.' });
  });

  it('never opens during a game, and asks for a true or false', async () => {
    const section = fakeSection();
    const { commands, state, settle } = setup({ section: section.api });
    expect((await settle(commands.showSection('maybe'))).ok).toBe(false);
    state.mode = 'game';
    expect((await settle(commands.showSection(true))).ok).toBe(false);
    expect(section.calls).toEqual([]);
  });

  it('keeps the plate up while the guide talks: named regions do not light or turn the brain', async () => {
    const section = fakeSection();
    const { commands, state, settle } = setup({ section: section.api });
    await settle(commands.showSection(true));
    const result = await settle(commands.followName({ kind: 'region', id: 19 }));
    expect(result.did).toBe('skipped');
    expect(state.highlight).toBeNull();
  });
});

// Kyle, 2026-10-11: the guide plays an example. Words fall down the centre and
// land on the first surface they meet, so the region turns to the top of the
// brain, tilted a little toward the player.
describe('Turning a region up for an example', () => {
  it("is not one of the guide's tools", () => {
    const { commands } = setup();
    expect(typeof commands.turnRegionUp).toBe('function');
    expect(Object.keys(commands)).not.toContain('turnRegionUp');
  });

  it('points the region up, tilted toward the player by the given angle', async () => {
    const { commands, adapter, controls, settle } = setup();
    const result = await settle(commands.turnRegionUp(17, { tiltDegrees: 12 }));
    expect(result.ok).toBe(true);
    const up = screenUpDirection(controls);
    const toward = toCameraDirection(controls);
    const tilt = THREE.MathUtils.degToRad(12);
    const target = up.clone().multiplyScalar(Math.cos(tilt)).add(toward.clone().multiplyScalar(Math.sin(tilt)));
    const centroid = regionGeometry.regions['17'].centroidLeft;
    const region = adapter.toSpecimenSpace(centroid).normalize().applyQuaternion(controls.orientGroup.quaternion);
    expect(region.dot(target)).toBeGreaterThan(0.999);
  });

  it('turns from any game phase: the page decides when an example may play', async () => {
    const { commands, state, settle } = setup();
    state.mode = 'game';
    expect((await settle(commands.turnRegionUp(6, { tiltDegrees: 12 }))).ok).toBe(true);
  });

  it('refuses with motion off, so the guide explains in words instead', async () => {
    const { commands, settle } = setup({ motion: false });
    const result = await settle(commands.turnRegionUp(17, { tiltDegrees: 12 }), 50);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/motion/i);
  });
});
